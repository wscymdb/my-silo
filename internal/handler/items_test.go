package handler

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"my-silo/internal/config"
	"my-silo/internal/database"
)

func TestListItemsValidatesParentDirectory(t *testing.T) {
	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	db, err := database.InitDB(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec("INSERT INTO items (id, name, is_dir) VALUES ('folder', '空目录', 1), ('file', 'note.txt', 0), ('deleted', '已删除目录', 1)"); err != nil {
		t.Fatal(err)
	}
	handler := NewItemsHandler(db, &config.Config{DataDir: root})
	router := gin.New()
	router.GET("/api/items", handler.ListItems)
	router.DELETE("/api/items/:id", handler.DeleteItem)
	deleted := httptest.NewRecorder()
	router.ServeHTTP(deleted, httptest.NewRequest("DELETE", "/api/items/deleted", nil))
	if deleted.Code != 200 {
		t.Fatal(deleted.Code, deleted.Body.String())
	}
	for _, tc := range []struct {
		parent string
		status int
	}{
		{"", 200}, {"root", 200}, {"folder", 200},
		{"missing", 404}, {"file", 404}, {"deleted", 404},
	} {
		t.Run(tc.parent, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest("GET", "/api/items?parent_id="+tc.parent, nil))
			if response.Code != tc.status {
				t.Fatal(response.Code, response.Body.String())
			}
			if tc.parent == "folder" {
				var result struct {
					CurrentID   string            `json:"current_id"`
					Breadcrumbs []json.RawMessage `json:"breadcrumbs"`
					Items       []json.RawMessage `json:"items"`
				}
				if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if result.CurrentID != "folder" || len(result.Breadcrumbs) != 1 || len(result.Items) != 0 {
					t.Fatal(response.Body.String())
				}
			}
		})
	}
}
