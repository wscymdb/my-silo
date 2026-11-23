package handler

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const maxTextBytes = 1024 * 1024

type textFile struct {
	name, storedPath, fullPath, format string
	content                            []byte
}

func textVersion(content []byte) string {
	hash := sha256.Sum256(content)
	return hex.EncodeToString(hash[:])
}

func (h *ItemsHandler) readTextFile(c *gin.Context) (*textFile, bool) {
	file := &textFile{}
	var isDir bool
	err := h.db.QueryRow("SELECT name, is_dir, stored_path FROM items WHERE id = ?", c.Param("id")).Scan(&file.name, &isDir, &file.storedPath)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && isDir) {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在"})
		return nil, false
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件信息失败"})
		return nil, false
	}
	switch strings.ToLower(filepath.Ext(file.name)) {
	case ".md":
		file.format = "markdown"
	case ".txt":
		file.format = "text"
	default:
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "仅支持在线查看和编辑 MD、TXT 文件"})
		return nil, false
	}
	root, err := filepath.Abs(h.cfg.DataDir)
	if err == nil {
		root, err = filepath.EvalSymlinks(root)
	}
	if err != nil || filepath.IsAbs(file.storedPath) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "文件存储路径无效"})
		return nil, false
	}
	file.fullPath, err = filepath.EvalSymlinks(filepath.Join(root, file.storedPath))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "物理文件不存在"})
		return nil, false
	}
	rel, err := filepath.Rel(root, file.fullPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "文件存储路径无效"})
		return nil, false
	}
	f, err := os.Open(file.fullPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return nil, false
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "该文件不支持在线编辑"})
		return nil, false
	}
	file.content, err = io.ReadAll(io.LimitReader(f, maxTextBytes+1))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件内容失败"})
		return nil, false
	}
	if len(file.content) > maxTextBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "在线编辑仅支持不超过 1 MB 的文件，请下载后处理"})
		return nil, false
	}
	if !utf8.Valid(file.content) || bytes.IndexByte(file.content, 0) >= 0 {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "仅支持 UTF-8 编码的文本文件"})
		return nil, false
	}
	return file, true
}

func textResponse(c *gin.Context, file *textFile) {
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"id": c.Param("id"), "name": file.name, "format": file.format,
		"content": string(file.content), "version": textVersion(file.content), "size_bytes": len(file.content),
	})
}

func (h *ItemsHandler) GetTextContent(c *gin.Context) {
	h.contentMu.Lock()
	defer h.contentMu.Unlock()
	file, ok := h.readTextFile(c)
	if ok {
		textResponse(c, file)
	}
}

func (h *ItemsHandler) SaveTextContent(c *gin.Context) {
	// JSON escaping can take six bytes per decoded byte; limit both layers.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxTextBytes*6+1024)
	var req struct {
		Content *string `json:"content" binding:"required"`
		Version string  `json:"version" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "在线编辑内容不能超过 1 MB"})
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请提供文件内容和读取时的版本"})
		}
		return
	}
	if len(*req.Content) > maxTextBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "在线编辑内容不能超过 1 MB"})
		return
	}
	if !utf8.ValidString(*req.Content) || strings.IndexByte(*req.Content, 0) >= 0 {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "仅支持 UTF-8 编码的文本文件"})
		return
	}
	h.contentMu.Lock()
	defer h.contentMu.Unlock()
	file, ok := h.readTextFile(c)
	if !ok {
		return
	}
	if req.Version != textVersion(file.content) {
		c.JSON(http.StatusConflict, gin.H{"error": "文件已被其他页面修改，请先复制你的修改，再重新加载最新版本"})
		return
	}
	// Write a complete new file before switching the database pointer. A failed
	// write or database update leaves the original content intact.
	tmp, err := os.CreateTemp(filepath.Dir(file.fullPath), "text-*"+filepath.Ext(file.fullPath))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建保存文件失败"})
		return
	}
	newPath := tmp.Name()
	committed := false
	defer func() {
		tmp.Close()
		if !committed {
			os.Remove(newPath)
		}
	}()
	if _, err = tmp.WriteString(*req.Content); err == nil {
		err = tmp.Sync()
	}
	closeErr := tmp.Close()
	if err != nil || closeErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败，原内容未更改"})
		return
	}
	root, err := filepath.Abs(h.cfg.DataDir)
	if err == nil {
		root, err = filepath.EvalSymlinks(root)
	}
	rel, relErr := filepath.Rel(root, newPath)
	if err != nil || relErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "文件存储路径无效"})
		return
	}
	result, err := h.db.Exec("UPDATE items SET stored_path = ?, size_bytes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stored_path = ?", rel, len(*req.Content), c.Param("id"), file.storedPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件记录失败，原内容未更改"})
		return
	}
	count, err := result.RowsAffected()
	if err != nil || count != 1 {
		c.JSON(http.StatusConflict, gin.H{"error": "文件已变化，请重新加载"})
		return
	}
	committed = true
	os.Remove(file.fullPath)
	file.content = []byte(*req.Content)
	textResponse(c, file)
}
