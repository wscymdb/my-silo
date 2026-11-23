package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port           string
	DataDir        string
	AdminUser      string
	AdminPassword  string
	JWTSecret      string
	APIKey         string
	TrustedProxies []string
	MaxSizeMB      int64
}

func Load() *Config {
	loadEnvFile(".env", "deploy/.env", "../deploy/.env")

	port := getEnv("SILO_PORT", "8989")
	dataDir := getEnv("SILO_DATA_DIR", "./data")
	adminUser := getEnv("SILO_ADMIN_USER", "admin")
	adminPass := getEnv("SILO_ADMIN_PASSWORD", "admin123")
	jwtSecret := getEnv("SILO_JWT_SECRET", "")
	apiKey := getEnv("SILO_API_KEY", "")
	trustedProxiesStr := getEnv("SILO_TRUSTED_PROXIES", "127.0.0.1,::1")
	maxSizeMBStr := getEnv("SILO_MAX_SIZE_MB", "500")

	if jwtSecret == "" {
		// 生成随机密钥
		bytes := make([]byte, 32)
		if _, err := rand.Read(bytes); err == nil {
			jwtSecret = hex.EncodeToString(bytes)
		} else {
			jwtSecret = "silo_default_super_secret_jwt_key_9988"
		}
	}

	maxSizeMB, err := strconv.ParseInt(maxSizeMBStr, 10, 64)
	if err != nil || maxSizeMB <= 0 {
		maxSizeMB = 500
	}

	var trustedProxies []string
	for _, p := range strings.Split(trustedProxiesStr, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			trustedProxies = append(trustedProxies, p)
		}
	}

	return &Config{
		Port:           port,
		DataDir:        dataDir,
		AdminUser:      adminUser,
		AdminPassword:  adminPass,
		JWTSecret:      jwtSecret,
		APIKey:         apiKey,
		TrustedProxies: trustedProxies,
		MaxSizeMB:      maxSizeMB,
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func loadEnvFile(paths ...string) {
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				k := strings.TrimSpace(parts[0])
				v := strings.TrimSpace(parts[1])
				// 去除行内注释 (例如: val # 这是注释)
				if idx := strings.Index(v, " #"); idx != -1 {
					v = strings.TrimSpace(v[:idx])
				} else if idx := strings.Index(v, "\t#"); idx != -1 {
					v = strings.TrimSpace(v[:idx])
				}
				v = strings.Trim(v, `"'`)
				if os.Getenv(k) == "" {
					os.Setenv(k, v)
				}
			}
		}
	}
}
