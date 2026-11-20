package handler

import (
	"crypto/subtle"
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"my-silo/internal/config"
	"my-silo/internal/ipfilter"
	"my-silo/internal/middleware"
)

type AuthHandler struct {
	db  *sql.DB
	cfg *config.Config
}

func NewAuthHandler(db *sql.DB, cfg *config.Config) *AuthHandler {
	return &AuthHandler{db: db, cfg: cfg}
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	clientIP := ipfilter.GetClientIP(c.Request, h.cfg.TrustedProxies)

	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// 检查用户名
	userMatch := subtle.ConstantTimeCompare([]byte(req.Username), []byte(h.cfg.AdminUser)) == 1

	// 检查密码：优先比对数据库中修改后的密码哈希，若无则比对环境变量初始密码
	var storedPassHash string
	h.db.QueryRow("SELECT value FROM settings WHERE key = 'admin_password_hash'").Scan(&storedPassHash)

	passMatch := false
	if storedPassHash != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(storedPassHash), []byte(req.Password)); err == nil {
			passMatch = true
		}
	} else {
		passMatch = subtle.ConstantTimeCompare([]byte(req.Password), []byte(h.cfg.AdminPassword)) == 1
	}

	if !userMatch || !passMatch {
		middleware.RecordLoginFailure(clientIP)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	middleware.ResetLoginFailure(clientIP)

	// 签发 7 天有效期的 JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user": req.Username,
		"exp":  time.Now().Add(7 * 24 * time.Hour).Unix(),
	})

	tokenString, err := token.SignedString([]byte(h.cfg.JWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成 Token 失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":    tokenString,
		"username": req.Username,
	})
}

// Me 检查当前登录状态
func (h *AuthHandler) Me(c *gin.Context) {
	user, _ := c.Get("user")
	c.JSON(http.StatusOK, gin.H{
		"user": user,
	})
}

// GetClientIPInfo 方便前端一键获取当前用户的公网 IP
func (h *AuthHandler) GetClientIPInfo(c *gin.Context) {
	ip := ipfilter.GetClientIP(c.Request, h.cfg.TrustedProxies)
	c.JSON(http.StatusOK, gin.H{"ip": ip})
}
