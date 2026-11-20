package handler

import (
	"database/sql"
	"net/http"
	"os/exec"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type PortItem struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"` // TCP / UDP
	Type     string `json:"type"`     // docker / system
	Name     string `json:"name"`     // 容器名称或系统进程名
	Detail   string `json:"detail"`   // 镜像名称或 PID 信息
	Status   string `json:"status"`   // 运行状态
	Note     string `json:"note"`     // 用户自定义备忘录
}

type PortsHandler struct {
	db *sql.DB
}

func NewPortsHandler(db *sql.DB) *PortsHandler {
	return &PortsHandler{db: db}
}

// GetPorts 获取服务器端口占用总览
func (h *PortsHandler) GetPorts(c *gin.Context) {
	portMap := make(map[int]*PortItem)

	// 1. 尝试探测 Docker 容器端口
	detectDockerPorts(portMap)

	// 2. 探测底层系统监听端口 (兼容 Linux 与 macOS)
	detectSystemPorts(portMap)

	// 3. 读取用户自定义备忘录
	notesMap := make(map[int]string)
	rows, err := h.db.Query("SELECT port, note FROM port_notes")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p int
			var n string
			if err := rows.Scan(&p, &n); err == nil {
				notesMap[p] = n
			}
		}
	}

	// 合并备忘录并转为数组
	list := make([]PortItem, 0, len(portMap))
	occupiedPorts := make(map[int]bool)

	for p, item := range portMap {
		if note, ok := notesMap[p]; ok {
			item.Note = note
		}
		list = append(list, *item)
		occupiedPorts[p] = true
	}

	// 按端口从小到大排序
	sort.Slice(list, func(i, j int) bool {
		return list[i].Port < list[j].Port
	})

	// 4. 推荐一组常用的安全空闲端口 (在 8000 ~ 9999 常用应用区间寻找)
	recommendedFreePorts := make([]int, 0)
	candidateRanges := []int{8990, 8991, 8992, 9000, 9001, 9002, 9090, 9091, 3000, 3001, 5000, 5001, 8000, 8081}
	for _, cand := range candidateRanges {
		if !occupiedPorts[cand] {
			recommendedFreePorts = append(recommendedFreePorts, cand)
			if len(recommendedFreePorts) >= 6 {
				break
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"ports":             list,
		"recommended_ports": recommendedFreePorts,
		"platform":          runtime.GOOS,
	})
}

// UpdatePortNote 更新端口备忘备注
func (h *PortsHandler) UpdatePortNote(c *gin.Context) {
	portStr := c.Param("port")
	port, err := strconv.Atoi(portStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的端口号"})
		return
	}

	var req struct {
		Note string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	_, err = h.db.Exec(`
		INSERT INTO port_notes (port, note, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(port) DO UPDATE SET note = excluded.note, updated_at = CURRENT_TIMESTAMP
	`, port, strings.TrimSpace(req.Note))

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存备注失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "备忘录已更新"})
}

// detectDockerPorts 通过 docker ps 探测容器占用的端口与容器真实名称
func detectDockerPorts(portMap map[int]*PortItem) {
	cmd := exec.Command("docker", "ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Ports}}\t{{.Image}}\t{{.Status}}")
	out, err := cmd.Output()
	if err != nil {
		return
	}

	lines := strings.Split(string(out), "\n")
	// 匹配类似: 0.0.0.0:8080->80/tcp 或 :::8080->80/tcp
	portRegex := regexp.MustCompile(`(?::|0\.0\.0\.0:)(\d+)->\d+/(tcp|udp)`)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 5 {
			continue
		}
		names := parts[1]
		portsStr := parts[2]
		image := parts[3]
		status := parts[4]

		matches := portRegex.FindAllStringSubmatch(portsStr, -1)
		for _, m := range matches {
			if len(m) >= 3 {
				p, err := strconv.Atoi(m[1])
				if err == nil {
					proto := strings.ToUpper(m[2])
					portMap[p] = &PortItem{
						Port:     p,
						Protocol: proto,
						Type:     "docker",
						Name:     names,
						Detail:   image,
						Status:   status,
					}
				}
			}
		}
	}
}

// detectSystemPorts 探测系统底层被监听的端口
func detectSystemPorts(portMap map[int]*PortItem) {
	if runtime.GOOS == "darwin" {
		detectDarwinPorts(portMap)
	} else {
		detectLinuxPorts(portMap)
	}
}

// detectDarwinPorts macOS 下使用 lsof 探测
func detectDarwinPorts(portMap map[int]*PortItem) {
	cmd := exec.Command("lsof", "-nP", "-iTCP", "-sTCP:LISTEN")
	out, err := cmd.Output()
	if err != nil {
		return
	}

	lines := strings.Split(string(out), "\n")
	// 匹配类似: :8989 (LISTEN) 或 127.0.0.1:8989
	re := regexp.MustCompile(`:(\d+)\s+\(LISTEN\)`)

	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}
		command := fields[0]
		match := re.FindStringSubmatch(line)
		if len(match) >= 2 {
			p, err := strconv.Atoi(match[1])
			if err == nil {
				// 如果该端口已经被 Docker 解析出真实容器名，保留 Docker 的友好展示
				if existing, ok := portMap[p]; ok && existing.Type == "docker" {
					continue
				}
				portMap[p] = &PortItem{
					Port:     p,
					Protocol: "TCP",
					Type:     "system",
					Name:     command,
					Detail:   "PID: " + fields[1],
					Status:   "LISTEN",
				}
			}
		}
	}
}

// detectLinuxPorts Linux 下优先使用 ss，其次降级到 netstat
func detectLinuxPorts(portMap map[int]*PortItem) {
	cmd := exec.Command("ss", "-tulpn")
	out, err := cmd.Output()
	if err != nil {
		// 尝试 netstat
		cmd = exec.Command("netstat", "-tulpn")
		out, err = cmd.Output()
		if err != nil {
			return
		}
	}

	lines := strings.Split(string(out), "\n")
	// 匹配端口与进程名
	re := regexp.MustCompile(`:(\d+)\s+.*(?:users:\(\("([^"]+)"|([a-zA-Z0-9_\-\.]+)/)`)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		match := re.FindStringSubmatch(line)
		if len(match) >= 2 {
			p, err := strconv.Atoi(match[1])
			if err == nil {
				if existing, ok := portMap[p]; ok && existing.Type == "docker" {
					continue
				}

				name := "未知进程"
				if len(match) >= 3 && match[2] != "" {
					name = match[2]
				} else if len(match) >= 4 && match[3] != "" {
					name = match[3]
				}

				proto := "TCP"
				if strings.HasPrefix(strings.ToLower(line), "udp") {
					proto = "UDP"
				}

				portMap[p] = &PortItem{
					Port:     p,
					Protocol: proto,
					Type:     "system",
					Name:     name,
					Detail:   "系统原生进程",
					Status:   "LISTEN",
				}
			}
		}
	}
}
