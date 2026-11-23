package handler

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"my-silo/internal/config"
	"my-silo/internal/ipfilter"
	"my-silo/internal/model"
)

type ServeHandler struct {
	db  *sql.DB
	cfg *config.Config
}

func NewServeHandler(db *sql.DB, cfg *config.Config) *ServeHandler {
	return &ServeHandler{db: db, cfg: cfg}
}

// ServeView 提供浏览器直接预览（/f/:id，如图片外链插入）
func (h *ServeHandler) ServeView(c *gin.Context) {
	h.serveFileContent(c, false)
}

// ServeDownload 触发附件强制下载（/d/:id）
func (h *ServeHandler) ServeDownload(c *gin.Context) {
	h.serveFileContent(c, true)
}

func (h *ServeHandler) serveFileContent(c *gin.Context, forceDownload bool) {
	id := c.Param("id")

	var item model.Item
	err := h.db.QueryRow(`
		SELECT id, name, is_dir, size_bytes, mime_type, stored_path, access_type, allowed_ips
		FROM items WHERE id = ?
	`, id).Scan(
		&item.ID, &item.Name, &item.IsDir, &item.SizeBytes,
		&item.MimeType, &item.StoredPath, &item.AccessType, &item.AllowedIPs,
	)

	if err == sql.ErrNoRows || item.IsDir {
		c.String(http.StatusNotFound, "404 资源不存在")
		return
	} else if err != nil {
		c.String(http.StatusInternalServerError, "500 查询错误")
		return
	}

	// 1. IP 权限控制检查
	clientIP := ipfilter.GetClientIP(c.Request, h.cfg.TrustedProxies)

	switch item.AccessType {
	case model.AccessPrivate:
		// 仅登录后可访问（检查当前请求是否带有效 Token 或 API Key）
		tokenValid := false
		if apiKey := c.GetHeader("X-API-Key"); apiKey != "" && apiKey == h.cfg.APIKey {
			tokenValid = true
		} else if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			tokenValid = true
		}
		if !tokenValid {
			c.String(http.StatusForbidden, "403 该文件已被设为私有，仅管理员可访问")
			return
		}

	case model.AccessIPWhitelist:
		// 校验当前 IP 是否在白名单中
		if !ipfilter.CheckIPAllowed(clientIP, item.AllowedIPs) {
			c.String(http.StatusForbidden, fmt.Sprintf("403 访问被拒绝：您的 IP (%s) 不在允许列表中", clientIP))
			return
		}

	case model.AccessPublic:
		// 所有人均可访问，不做 IP 拦截
	}

	// 2. 检查物理文件是否存在
	fullPath := filepath.Join(h.cfg.DataDir, item.StoredPath)
	fileInfo, err := os.Stat(fullPath)
	if err != nil || fileInfo.IsDir() {
		c.String(http.StatusNotFound, "404 物理文件丢失")
		return
	}

	// 3. 安全响应头设置
	c.Header("X-Content-Type-Options", "nosniff")
	textExtension := strings.ToLower(filepath.Ext(item.Name))
	if textExtension == ".md" || textExtension == ".txt" {
		// Text documents remain plain text on public links, even when their
		// contents resemble HTML. Formatted Markdown is rendered in the app.
		c.Header("Content-Type", "text/plain; charset=utf-8")
	}

	// 对可能包含恶意脚本的富文本/矢量图设置沙箱隔离
	if strings.Contains(item.MimeType, "svg") || strings.Contains(item.MimeType, "html") {
		c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	}

	encodedFilename := url.PathEscape(item.Name)
	if forceDownload {
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"; filename*=UTF-8''%s", encodedFilename, encodedFilename))
	} else {
		// 预览模式：如果不是强制下载，支持浏览器缓存（1天）
		if textExtension == ".md" || textExtension == ".txt" {
			c.Header("Cache-Control", "no-store")
		} else {
			c.Header("Cache-Control", "public, max-age=86400")
		}
		c.Header("Content-Disposition", fmt.Sprintf("inline; filename=\"%s\"; filename*=UTF-8''%s", encodedFilename, encodedFilename))
	}

	// 4. 利用 Go 标准库的 ServeFile，原生支持断点续传（206 Partial Content）、ETag 与 304 缓存
	http.ServeFile(c.Writer, c.Request, fullPath)
}
