package model

import "time"

// AccessType 定义访问控制类型
const (
	AccessPublic       = "public"        // 所有人均可访问
	AccessIPWhitelist  = "ip_whitelist"  // 仅指定 IP/CIDR 可访问
	AccessPrivate      = "private"       // 仅管理员登录后可访问
)

// Item 代表一个文件或文件夹（虚拟目录树节点）
type Item struct {
	ID         string     `json:"id"`
	ParentID   *string    `json:"parent_id"`   // 上级目录ID，根目录为 nil
	Name       string     `json:"name"`        // 文件或文件夹显示名称
	IsDir      bool       `json:"is_dir"`      // 是否是文件夹
	SizeBytes  int64      `json:"size_bytes"`  // 文件大小（字节）
	MimeType   string     `json:"mime_type"`   // MIME类型
	StoredPath string     `json:"stored_path"` // 实际磁盘存储的相对路径（文件夹为空）
	AccessType string     `json:"access_type"` // public / ip_whitelist / private
	AllowedIPs string     `json:"allowed_ips"` // 逗号分隔的 IP 或 CIDR 网段
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// Breadcrumb 表示前端面包屑导航的一项
type Breadcrumb struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
