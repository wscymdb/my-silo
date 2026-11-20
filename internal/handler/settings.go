package handler

import (
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
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

// ChangePassword 修改管理员密码
func (h *SettingsHandler) ChangePassword(c *gin.Context) {
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}

	if len(req.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码长度不能少于 6 位"})
		return
	}

	// 校验当前密码
	currentPassHash := h.getSetting("admin_password_hash")
	valid := false
	if currentPassHash != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(currentPassHash), []byte(req.OldPassword)); err == nil {
			valid = true
		}
	} else {
		// 校验环境变量中的初始密码
		if subtle.ConstantTimeCompare([]byte(req.OldPassword), []byte(h.cfg.AdminPassword)) == 1 {
			valid = true
		}
	}

	if !valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "原密码不正确"})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "加密密码失败"})
		return
	}

	h.setSetting("admin_password_hash", string(newHash))
	c.JSON(http.StatusOK, gin.H{"message": "密码修改成功，新密码即刻生效"})
}

func (h *SettingsHandler) getSetting(key string) string {
	var val string
	h.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&val)
	return val
}

func (h *SettingsHandler) setSetting(key, val string) {
	h.db.Exec(`
		INSERT INTO settings (key, value, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
	`, key, val)
}
