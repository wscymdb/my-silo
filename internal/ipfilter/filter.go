package ipfilter

import (
	"net"
	"net/http"
	"strings"
)

// GetClientIP 安全提取客户端真实 IP（防伪造）
func GetClientIP(r *http.Request, trustedProxies []string) string {
	remoteIP, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remoteIP = r.RemoteAddr
	}

	// 判断当前连接方是否为受信任的反向代理
	isTrusted := false
	parsedRemote := net.ParseIP(remoteIP)
	if parsedRemote != nil {
		for _, proxy := range trustedProxies {
			if proxy == remoteIP {
				isTrusted = true
				break
			}
			// 支持 CIDR 网段，如 127.0.0.0/8
			if _, cidr, err := net.ParseCIDR(proxy); err == nil && cidr.Contains(parsedRemote) {
				isTrusted = true
				break
			}
		}
	}

	// 仅当直连来源是受信任代理时，才信任代理请求头
	if isTrusted {
		// 1. 优先 Cloudflare
		if cfIP := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); cfIP != "" {
			if net.ParseIP(cfIP) != nil {
				return cfIP
			}
		}
		// 2. 检查 X-Real-IP
		if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
			if net.ParseIP(realIP) != nil {
				return realIP
			}
		}
		// 3. 检查 X-Forwarded-For（取最左侧有效 IP）
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if net.ParseIP(p) != nil {
					return p
				}
			}
		}
	}

	return remoteIP
}

// CheckIPAllowed 校验客户端 IP 是否匹配允许列表（支持单个 IP 及 CIDR 网段）
func CheckIPAllowed(clientIPStr string, allowedIPsConfig string) bool {
	clientIP := net.ParseIP(strings.TrimSpace(clientIPStr))
	if clientIP == nil {
		return false
	}

	rawRules := strings.Split(allowedIPsConfig, ",")
	for _, rule := range rawRules {
		rule = strings.TrimSpace(rule)
		if rule == "" {
			continue
		}

		// 1. 如果是 CIDR（包含斜杠，例如 192.168.1.0/24）
		if strings.Contains(rule, "/") {
			_, cidr, err := net.ParseCIDR(rule)
			if err == nil && cidr.Contains(clientIP) {
				return true
			}
			continue
		}

		// 2. 如果是具体单个 IP
		targetIP := net.ParseIP(rule)
		if targetIP != nil && targetIP.Equal(clientIP) {
			return true
		}
	}

	return false
}
