package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"my-silo/internal/config"
	"my-silo/internal/ipfilter"
)

// SecurityHeaders 注入常见 Web 安全响应头
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}

// RateLimiter 针对登录接口的防爆破限制
type loginAttempt struct {
	count    int
	lastFail time.Time
}

var (
	loginLimiterMu sync.Mutex
	loginAttempts  = make(map[string]*loginAttempt)
)

func LoginRateLimiter(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := ipfilter.GetClientIP(c.Request, cfg.TrustedProxies)

		loginLimiterMu.Lock()
		attempt, exists := loginAttempts[ip]
		if exists {
			// 连续输错超过 5 次且在 15 分钟内，直接拦截
			if attempt.count >= 5 && time.Since(attempt.lastFail) < 15*time.Minute {
				loginLimiterMu.Unlock()
				c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
					"error": "登录失败次数过多，该 IP 已被锁定 15 分钟，请稍后再试",
				})
				return
			}
			// 超过 15 分钟重置计数
			if time.Since(attempt.lastFail) >= 15*time.Minute {
				attempt.count = 0
			}
		}
		loginLimiterMu.Unlock()

		c.Next()
	}
}

func RecordLoginFailure(ip string) {
	loginLimiterMu.Lock()
	defer loginLimiterMu.Unlock()
	attempt, exists := loginAttempts[ip]
	if !exists {
		loginAttempts[ip] = &loginAttempt{count: 1, lastFail: time.Now()}
	} else {
		attempt.count++
		attempt.lastFail = time.Now()
	}
}

func ResetLoginFailure(ip string) {
	loginLimiterMu.Lock()
	defer loginLimiterMu.Unlock()
	delete(loginAttempts, ip)
}

// RequireAuth 校验 JWT 或 API Key
func RequireAuth(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 优先检查 API Key（Header: X-API-Key）
		if apiKey := c.GetHeader("X-API-Key"); apiKey != "" && cfg.APIKey != "" {
			if subtle.ConstantTimeCompare([]byte(apiKey), []byte(cfg.APIKey)) == 1 {
				c.Set("user", "api_key_user")
				c.Next()
				return
			}
		}

		// 2. 检查 Authorization: Bearer <token>
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "需要登录凭证"})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "无效的 Token 格式"})
			return
		}

		tokenStr := parts[1]
		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录状态已失效，请重新登录"})
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Set("user", claims["user"])
		}

		c.Next()
	}
}
