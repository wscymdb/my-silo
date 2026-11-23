package handler

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"my-silo/internal/config"
	"my-silo/internal/model"
)

type ItemsHandler struct {
	db        *sql.DB
	cfg       *config.Config
	contentMu sync.Mutex
}

func NewItemsHandler(db *sql.DB, cfg *config.Config) *ItemsHandler {
	return &ItemsHandler{db: db, cfg: cfg}
}

// ListItems 获取当前目录下的条目及面包屑导航
func (h *ItemsHandler) ListItems(c *gin.Context) {
	parentID := c.Query("parent_id")
	if parentID == "root" || parentID == "" {
		parentID = ""
	}
	if parentID != "" {
		var isDir bool
		err := h.db.QueryRow("SELECT is_dir FROM items WHERE id = ?", parentID).Scan(&isDir)
		if err == sql.ErrNoRows || (err == nil && !isDir) {
			c.JSON(http.StatusNotFound, gin.H{"error": "目录不存在或已删除"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取目录失败"})
			return
		}
	}

	// 1. 查询当前文件夹下的所有文件和文件夹（文件夹排在前面，按名称排序）
	var rows *sql.Rows
	var err error
	if parentID == "" {
		rows, err = h.db.Query(`
			SELECT id, parent_id, name, is_dir, size_bytes, mime_type, stored_path, access_type, allowed_ips, created_at, updated_at
			FROM items
			WHERE parent_id IS NULL OR parent_id = ''
			ORDER BY is_dir DESC, name ASC
		`)
	} else {
		rows, err = h.db.Query(`
			SELECT id, parent_id, name, is_dir, size_bytes, mime_type, stored_path, access_type, allowed_ips, created_at, updated_at
			FROM items
			WHERE parent_id = ?
			ORDER BY is_dir DESC, name ASC
		`, parentID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件列表失败: " + err.Error()})
		return
	}
	defer rows.Close()

	items := make([]model.Item, 0)
	for rows.Next() {
		var item model.Item
		var pID sql.NullString
		err := rows.Scan(
			&item.ID, &pID, &item.Name, &item.IsDir, &item.SizeBytes,
			&item.MimeType, &item.StoredPath, &item.AccessType, &item.AllowedIPs,
			&item.CreatedAt, &item.UpdatedAt,
		)
		if err == nil {
			if pID.Valid && pID.String != "" {
				item.ParentID = &pID.String
			}
			items = append(items, item)
		}
	}

	// 2. 递归回溯构建面包屑导航（从当前节点向上找 parent_id）
	breadcrumbs := make([]model.Breadcrumb, 0)
	currID := parentID
	for currID != "" {
		var name string
		var nextPID sql.NullString
		err := h.db.QueryRow("SELECT name, parent_id FROM items WHERE id = ? AND is_dir = 1", currID).Scan(&name, &nextPID)
		if err != nil {
			break
		}
		breadcrumbs = append([]model.Breadcrumb{{ID: currID, Name: name}}, breadcrumbs...)
		if nextPID.Valid && nextPID.String != "" {
			currID = nextPID.String
		} else {
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"current_id":  parentID,
		"breadcrumbs": breadcrumbs,
		"items":       items,
	})
}

// CreateFolder 创建新文件夹
func (h *ItemsHandler) CreateFolder(c *gin.Context) {
	var req struct {
		ParentID string `json:"parent_id"`
		Name     string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" || strings.ContainsAny(name, `/\:*?"<>|`) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件夹名称不合法"})
		return
	}

	id := generateShortID()
	var parentIDVal interface{}
	if req.ParentID != "" && req.ParentID != "root" {
		parentIDVal = req.ParentID
	}

	_, err := h.db.Exec(`
		INSERT INTO items (id, parent_id, name, is_dir, access_type)
		VALUES (?, ?, ?, 1, 'public')
	`, id, parentIDVal, name)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建文件夹失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":   id,
		"name": name,
	})
}

// UploadFiles 上传单个或多个文件
func (h *ItemsHandler) UploadFiles(c *gin.Context) {
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "解析表单失败: " + err.Error()})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未选择任何文件"})
		return
	}

	parentID := c.PostForm("parent_id")
	accessType := c.DefaultPostForm("access_type", model.AccessPublic)
	allowedIPs := c.PostForm("allowed_ips")

	var parentIDVal interface{}
	if parentID != "" && parentID != "root" {
		parentIDVal = parentID
	}

	createdItems := make([]model.Item, 0)
	maxBytes := h.cfg.MaxSizeMB * 1024 * 1024

	for _, fileHeader := range files {
		if fileHeader.Size > maxBytes {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": fmt.Sprintf("文件 %s 超过大小限制 (%dMB)", fileHeader.Filename, h.cfg.MaxSizeMB),
			})
			return
		}

		fileID := generateShortID()
		// 安全生成磁盘存储名，根据哈希前缀分散子文件夹（如 uploads/a1/b2/...）
		subDir := filepath.Join(h.cfg.DataDir, "uploads", fileID[:2])
		if err := os.MkdirAll(subDir, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建上传目录失败"})
			return
		}

		ext := filepath.Ext(fileHeader.Filename)
		storedRelPath := filepath.Join("uploads", fileID[:2], fileID+ext)
		fullDstPath := filepath.Join(h.cfg.DataDir, storedRelPath)

		src, err := fileHeader.Open()
		if err != nil {
			continue
		}

		dst, err := os.Create(fullDstPath)
		if err != nil {
			src.Close()
			continue
		}

		written, err := io.Copy(dst, src)
		src.Close()
		dst.Close()
		if err != nil {
			os.Remove(fullDstPath)
			continue
		}

		mimeType := fileHeader.Header.Get("Content-Type")
		if mimeType == "" || mimeType == "application/octet-stream" {
			mimeType = detectMimeType(fileHeader.Filename)
		}

		cleanName := filepath.Base(fileHeader.Filename)

		_, err = h.db.Exec(`
			INSERT INTO items (id, parent_id, name, is_dir, size_bytes, mime_type, stored_path, access_type, allowed_ips)
			VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
		`, fileID, parentIDVal, cleanName, written, mimeType, storedRelPath, accessType, allowedIPs)

		if err == nil {
			createdItems = append(createdItems, model.Item{
				ID:         fileID,
				Name:       cleanName,
				IsDir:      false,
				SizeBytes:  written,
				MimeType:   mimeType,
				StoredPath: storedRelPath,
				AccessType: accessType,
				AllowedIPs: allowedIPs,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"uploaded": createdItems,
	})
}

// UpdateItem 修改文件名或 IP 权限设置
func (h *ItemsHandler) UpdateItem(c *gin.Context) {
	h.contentMu.Lock()
	defer h.contentMu.Unlock()
	id := c.Param("id")

	var req struct {
		Name       *string `json:"name"`
		AccessType *string `json:"access_type"`
		AllowedIPs *string `json:"allowed_ips"`
		ParentID   *string `json:"parent_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if req.Name != nil {
		cleanName := strings.TrimSpace(*req.Name)
		if cleanName != "" && !strings.ContainsAny(cleanName, `/\:*?"<>|`) {
			h.db.Exec("UPDATE items SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", cleanName, id)
		}
	}

	if req.AccessType != nil {
		h.db.Exec("UPDATE items SET access_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", *req.AccessType, id)
	}

	if req.AllowedIPs != nil {
		h.db.Exec("UPDATE items SET allowed_ips = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", *req.AllowedIPs, id)
	}

	if req.ParentID != nil {
		if *req.ParentID == "" || *req.ParentID == "root" {
			h.db.Exec("UPDATE items SET parent_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", id)
		} else {
			h.db.Exec("UPDATE items SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", *req.ParentID, id)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "更新成功"})
}

// DeleteItem 删除文件或文件夹（递归级联删除）
func (h *ItemsHandler) DeleteItem(c *gin.Context) {
	h.contentMu.Lock()
	defer h.contentMu.Unlock()
	id := c.Param("id")

	// 递归收集该 ID 下的所有文件路径与子项目 ID
	toDeleteIDs := make([]string, 0)
	toDeleteFiles := make([]string, 0)

	var collect func(currID string)
	collect = func(currID string) {
		toDeleteIDs = append(toDeleteIDs, currID)

		var isDir bool
		var storedPath string
		err := h.db.QueryRow("SELECT is_dir, stored_path FROM items WHERE id = ?", currID).Scan(&isDir, &storedPath)
		if err != nil {
			return
		}

		if !isDir && storedPath != "" {
			toDeleteFiles = append(toDeleteFiles, storedPath)
		} else if isDir {
			rows, err := h.db.Query("SELECT id FROM items WHERE parent_id = ?", currID)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var childID string
					if err := rows.Scan(&childID); err == nil {
						collect(childID)
					}
				}
			}
		}
	}

	collect(id)

	// 从磁盘删除文件
	for _, relPath := range toDeleteFiles {
		fullPath := filepath.Join(h.cfg.DataDir, relPath)
		os.Remove(fullPath)
	}

	// 从数据库批量删除
	for _, delID := range toDeleteIDs {
		h.db.Exec("DELETE FROM items WHERE id = ?", delID)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "删除成功",
		"deleted_count": len(toDeleteIDs),
	})
}

func generateShortID() string {
	u := strings.ReplaceAll(uuid.New().String(), "-", "")
	return u[:10]
}

func detectMimeType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mp3":
		return "audio/mpeg"
	case ".pdf":
		return "application/pdf"
	case ".zip":
		return "application/zip"
	case ".tar", ".gz":
		return "application/gzip"
	case ".txt", ".md":
		return "text/plain; charset=utf-8"
	case ".json":
		return "application/json"
	default:
		return "application/octet-stream"
	}
}
