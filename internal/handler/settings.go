package handler

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"my-silo/internal/config"
	"my-silo/internal/ipfilter"
)

type SettingsHandler struct {
	db  *sql.DB
	cfg *config.Config
}

func NewSettingsHandler(db *sql.DB, cfg *config.Config) *SettingsHandler {
	return &SettingsHandler{db: db, cfg: cfg}
}

// GetSettings 获取全局配置与系统状态
func (h *SettingsHandler) GetSettings(c *gin.Context) {
	settingsMap := make(map[string]string)
	rows, err := h.db.Query("SELECT key, value FROM settings")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				settingsMap[k] = v
			}
		}
	}

	// 环境变量作为默认回退
	customDomain := settingsMap["custom_domain"]
	defaultAccess := settingsMap["default_access_type"]
	if defaultAccess == "" {
		defaultAccess = "public"
	}
	globalAllowedIPs := settingsMap["global_allowed_ips"]
	globalBlockedIPs := settingsMap["global_blocked_ips"]

	apiKey := settingsMap["api_key"]
	if apiKey == "" {
		apiKey = h.cfg.APIKey
	}

	// 统计数据
	var totalFiles, totalFolders int
	var totalSizeBytes int64
	h.db.QueryRow("SELECT COUNT(*) FROM items WHERE is_dir = 0").Scan(&totalFiles)
	h.db.QueryRow("SELECT COUNT(*) FROM items WHERE is_dir = 1").Scan(&totalFolders)
	h.db.QueryRow("SELECT COALESCE(SUM(size_bytes), 0) FROM items WHERE is_dir = 0").Scan(&totalSizeBytes)

	// 统计图片数量
	var totalImages int
	h.db.QueryRow("SELECT COUNT(*) FROM items WHERE is_dir = 0 AND mime_type LIKE 'image/%'").Scan(&totalImages)

	clientIP := ipfilter.GetClientIP(c.Request, h.cfg.TrustedProxies)

	c.JSON(http.StatusOK, gin.H{
		"settings": gin.H{
			"custom_domain":        customDomain,
			"default_access_type": defaultAccess,
			"global_allowed_ips":  globalAllowedIPs,
			"global_blocked_ips":  globalBlockedIPs,
			"api_key":             apiKey,
		},
		"stats": gin.H{
			"total_files":      totalFiles,
			"total_folders":    totalFolders,
			"total_images":     totalImages,
			"total_size_bytes": totalSizeBytes,
			"client_ip":        clientIP,
		},
	})
}

// UpdateSettings 更新基础公共配置
func (h *SettingsHandler) UpdateSettings(c *gin.Context) {
	var req struct {
		CustomDomain      *string `json:"custom_domain"`
		DefaultAccessType *string `json:"default_access_type"`
		GlobalAllowedIPs  *string `json:"global_allowed_ips"`
		GlobalBlockedIPs  *string `json:"global_blocked_ips"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
		return
	}

	if req.CustomDomain != nil {
		h.setSetting("custom_domain", strings.TrimRight(strings.TrimSpace(*req.CustomDomain), "/"))
	}
	if req.DefaultAccessType != nil {
		h.setSetting("default_access_type", *req.DefaultAccessType)
	}
	if req.GlobalAllowedIPs != nil {
		h.setSetting("global_allowed_ips", strings.TrimSpace(*req.GlobalAllowedIPs))
	}
	if req.GlobalBlockedIPs != nil {
		h.setSetting("global_blocked_ips", strings.TrimSpace(*req.GlobalBlockedIPs))
	}

	c.JSON(http.StatusOK, gin.H{"message": "配置更新成功"})
}

// RegenerateAPIKey 生成新的 32 位安全 API 密钥
func (h *SettingsHandler) RegenerateAPIKey(c *gin.Context) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成密钥失败"})
		return
	}
	newKey := "silo_" + hex.EncodeToString(bytes)
	h.setSetting("api_key", newKey)

	c.JSON(http.StatusOK, gin.H{
		"api_key": newKey,
		"message": "API Key 已重置",
	})
}

func (h *SettingsHandler) setSetting(key, val string) {
	h.db.Exec(`
		INSERT INTO settings (key, value, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
	`, key, val)
}
