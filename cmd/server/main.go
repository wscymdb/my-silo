package main

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	mysilo "my-silo"
	"my-silo/internal/config"
	"my-silo/internal/database"
	"my-silo/internal/handler"
	"my-silo/internal/middleware"
)

func main() {
	cfg := config.Load()

	// 初始化 SQLite 数据库
	db, err := database.InitDB(cfg.DataDir)
	if err != nil {
		log.Fatalf("初始化数据库失败: %v", err)
	}
	defer db.Close()

	// 命令行辅助工具：忘记密码时一键重置
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "reset-password":
			if len(os.Args) > 2 {
				newPass := os.Args[2]
				if len(newPass) < 6 {
					log.Fatal("新密码长度不能少于 6 位")
				}
				hash, err := bcrypt.GenerateFromPassword([]byte(newPass), bcrypt.DefaultCost)
				if err != nil {
					log.Fatalf("密码哈希生成失败: %v", err)
				}
				if _, err := db.Exec("INSERT INTO settings (key, value) VALUES ('admin_password_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", string(hash)); err != nil {
					log.Fatalf("密码重置失败: %v", err)
				}
				fmt.Println("✅ 密码已重置，新密码立即生效，无需重启服务")
			} else {
				if _, err := db.Exec("DELETE FROM settings WHERE key = 'admin_password_hash'"); err != nil {
					log.Fatalf("恢复环境变量密码失败: %v", err)
				}
				fmt.Println("✅ 已清除数据库密码，登录将使用服务环境变量 SILO_ADMIN_PASSWORD")
			}
			return
		}
	}

	// 持久化保存 JWT 密钥至数据库，避免每次重启服务重新生成随机密钥导致用户登录态失效 (401)
	if os.Getenv("SILO_JWT_SECRET") == "" {
		var dbJWTSecret string
		err := db.QueryRow("SELECT value FROM settings WHERE key = 'jwt_secret'").Scan(&dbJWTSecret)
		if err == nil && dbJWTSecret != "" {
			cfg.JWTSecret = dbJWTSecret
		} else {
			db.Exec("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", cfg.JWTSecret)
		}
	}

	r := gin.Default()

	// 全局安全响应头
	r.Use(middleware.SecurityHeaders())

	// 跨域支持（用于开发环境 Vite 独立运行时）
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, X-API-Key")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// 初始化 Handlers
	authHandler := handler.NewAuthHandler(db, cfg)
	itemsHandler := handler.NewItemsHandler(db, cfg)
	serveHandler := handler.NewServeHandler(db, cfg)
	settingsHandler := handler.NewSettingsHandler(db, cfg)

	// 1. 公开外链访问路由（直接访问与强制下载，内置 IP 校验）
	r.GET("/f/:id", serveHandler.ServeView)
	r.GET("/d/:id", serveHandler.ServeDownload)

	// 2. 鉴权相关接口
	api := r.Group("/api")
	{
		// 登录（带防爆破限流）
		api.POST("/auth/login", middleware.LoginRateLimiter(cfg), authHandler.Login)
		// 获取客户端当前 IP
		api.GET("/ip/current", authHandler.GetClientIPInfo)

		// 需要鉴权的管理接口（JWT 或 API Key）
		protected := api.Group("")
		protected.Use(middleware.RequireAuth(cfg))
		{
			protected.GET("/auth/me", authHandler.Me)
			protected.GET("/items", itemsHandler.ListItems)
			protected.POST("/items/folder", itemsHandler.CreateFolder)
			protected.POST("/items/upload", itemsHandler.UploadFiles)
			protected.PATCH("/items/:id", itemsHandler.UpdateItem)
			protected.DELETE("/items/:id", itemsHandler.DeleteItem)

			// 公共系统配置
			protected.GET("/settings", settingsHandler.GetSettings)
			protected.PATCH("/settings", settingsHandler.UpdateSettings)
			protected.POST("/settings/apikey/regenerate", settingsHandler.RegenerateAPIKey)
		}
	}

	// 3. 静态前端资源托管（支持 SPA 单页路由 fallback）
	serveFrontend(r)

	fmt.Printf(`
==================================================
  🚀 my-silo 资源管理服务已启动
  🌐 访问地址: http://localhost:%s
  📁 存储目录: %s
  🔑 管理账号: %s
==================================================
`, cfg.Port, cfg.DataDir, cfg.AdminUser)

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("启动失败: %v", err)
	}
}

func serveFrontend(r *gin.Engine) {
	// 尝试从内嵌资源提取 web/dist
	distFS, err := fs.Sub(mysilo.WebFS, "web/dist")
	if err == nil {
		// 检查是否有 index.html
		if _, statErr := distFS.Open("index.html"); statErr == nil {
			fileServer := http.FileServer(http.FS(distFS))
			r.NoRoute(func(c *gin.Context) {
				path := c.Request.URL.Path
				if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/f/") || strings.HasPrefix(path, "/d/") {
					c.Status(http.StatusNotFound)
					return
				}
				// 检查文件是否存在于静态资源中，若不存在则回退至 index.html (SPA 支持)
				f, err := distFS.Open(strings.TrimPrefix(path, "/"))
				if err == nil {
					f.Close()
					fileServer.ServeHTTP(c.Writer, c.Request)
				} else {
					c.Request.URL.Path = "/"
					fileServer.ServeHTTP(c.Writer, c.Request)
				}
			})
			return
		}
	}

	// 降级：如果未打包前端，显示引导页面
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/f/") || strings.HasPrefix(path, "/d/") {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(`
			<!DOCTYPE html>
			<html>
			<head><title>my-silo</title><meta charset="utf-8"></head>
			<body style="font-family: system-ui, sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; background:#f4f4f5;">
				<div style="background:#fff; padding:32px 48px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.08); text-align:center;">
					<h2 style="margin:0 0 12px; color:#18181b;">🚀 my-silo 后端运行正常</h2>
					<p style="color:#71717a; margin:0 0 20px;">前端正在构建中，或者请启动前端开发服务器。</p>
				</div>
			</body>
			</html>
		`))
	})
}
