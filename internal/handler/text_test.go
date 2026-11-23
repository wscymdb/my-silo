package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
	"my-silo/internal/config"
	"my-silo/internal/database"
	"my-silo/internal/middleware"
)

type textFixture struct {
	handler *ItemsHandler
	router  *gin.Engine
	root    string
}

func newTextFixture(t *testing.T) *textFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	db, err := database.InitDB(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	cfg := &config.Config{DataDir: root, APIKey: "test-key", JWTSecret: "test-secret"}
	h := NewItemsHandler(db, cfg)
	router := gin.New()
	api := router.Group("/api", middleware.RequireAuth(cfg))
	api.GET("/items/:id/content", h.GetTextContent)
	api.PUT("/items/:id/content", h.SaveTextContent)
	router.GET("/f/:id", NewServeHandler(db, cfg).ServeView)
	return &textFixture{h, router, root}
}
func (f *textFixture) add(t *testing.T, id, name string, content []byte) string {
	t.Helper()
	rel := filepath.Join("uploads", id+filepath.Ext(name))
	if err := os.WriteFile(filepath.Join(f.root, rel), content, 0644); err != nil {
		t.Fatal(err)
	}
	_, err := f.handler.db.Exec("INSERT INTO items (id,name,is_dir,size_bytes,mime_type,stored_path,access_type,updated_at) VALUES (?,?,0,?,'text/plain',?,'public','2000-01-01 00:00:00')", id, name, len(content), rel)
	if err != nil {
		t.Fatal(err)
	}
	return rel
}
func (f *textFixture) request(method, path string, body any, auth bool) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if auth {
		req.Header.Set("X-API-Key", "test-key")
	}
	res := httptest.NewRecorder()
	f.router.ServeHTTP(res, req)
	return res
}
func decodedText(t *testing.T, res *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	if res.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
	var data map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	return data
}
func TestTextReadSavePreservesIdentityAndEmptyContent(t *testing.T) {
	f := newTextFixture(t)
	original := f.add(t, "doc", "说明.MD", []byte("# 原始\r\n正文"))
	if res := f.request("GET", "/api/items/doc/content", nil, false); res.Code != 401 {
		t.Fatalf("unauthenticated status=%d", res.Code)
	}
	res := f.request("GET", "/api/items/doc/content", nil, true)
	before := decodedText(t, res)
	if res.Header().Get("Cache-Control") != "no-store" || before["format"] != "markdown" {
		t.Fatal(before, res.Header())
	}
	content := "# 新版本\n中文与 emoji 🐈"
	after := decodedText(t, f.request("PUT", "/api/items/doc/content", map[string]any{"content": content, "version": before["version"]}, true))
	if after["content"] != content || after["version"] == before["version"] {
		t.Fatal(after)
	}
	var name, path, access, updated string
	var size int
	if err := f.handler.db.QueryRow("SELECT name,stored_path,size_bytes,access_type,updated_at FROM items WHERE id='doc'").Scan(&name, &path, &size, &access, &updated); err != nil {
		t.Fatal(err)
	}
	if name != "说明.MD" || access != "public" || size != len([]byte(content)) || path == original || strings.HasPrefix(updated, "2000") {
		t.Fatalf("name=%s path=%s size=%d access=%s updated=%s", name, path, size, access, updated)
	}
	if _, err := os.Stat(filepath.Join(f.root, original)); !os.IsNotExist(err) {
		t.Fatalf("old content not cleaned: %v", err)
	}
	public := f.request("GET", "/f/doc", nil, false)
	if public.Code != 200 || public.Body.String() != content || public.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(public.Code, public.Body.String(), public.Header())
	}
	empty := decodedText(t, f.request("PUT", "/api/items/doc/content", map[string]any{"content": "", "version": after["version"]}, true))
	if empty["content"] != "" || empty["size_bytes"] != float64(0) {
		t.Fatal(empty)
	}
}
func TestTextStaleAndConcurrentSaves(t *testing.T) {
	f := newTextFixture(t)
	f.add(t, "doc", "note.txt", []byte("original"))
	initial := decodedText(t, f.request("GET", "/api/items/doc/content", nil, true))
	results := make(chan int, 2)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for _, content := range []string{"one", "two"} {
		wg.Add(1)
		go func(content string) {
			defer wg.Done()
			<-start
			results <- f.request("PUT", "/api/items/doc/content", map[string]any{"content": content, "version": initial["version"]}, true).Code
		}(content)
	}
	close(start)
	wg.Wait()
	close(results)
	counts := map[int]int{}
	for status := range results {
		counts[status]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatal(counts)
	}
	saved := decodedText(t, f.request("GET", "/api/items/doc/content", nil, true))
	res := f.request("PUT", "/api/items/doc/content", map[string]any{"content": "stale overwrite", "version": initial["version"]}, true)
	if res.Code != 409 {
		t.Fatal(res.Code, res.Body.String())
	}
	latest := decodedText(t, f.request("GET", "/api/items/doc/content", nil, true))
	if saved["content"] != latest["content"] {
		t.Fatal("stale write replaced content")
	}
}
func TestTextRejectsUnsupportedAndOversizedFiles(t *testing.T) {
	f := newTextFixture(t)
	for _, tc := range []struct {
		id, name string
		content  []byte
		status   int
	}{
		{"binary", "image.png", []byte("text"), 415},
		{"encoding", "legacy.txt", []byte{0xff, 0xfe}, 415},
		{"nul", "binary.txt", []byte{'a', 0, 'b'}, 415},
		{"large", "large.md", bytes.Repeat([]byte("a"), maxTextBytes+1), 413},
	} {
		f.add(t, tc.id, tc.name, tc.content)
		if res := f.request("GET", "/api/items/"+tc.id+"/content", nil, true); res.Code != tc.status {
			t.Fatal(tc.id, res.Code, res.Body.String())
		}
	}
	f.add(t, "doc", "small.txt", []byte("original"))
	before := decodedText(t, f.request("GET", "/api/items/doc/content", nil, true))
	for _, tc := range []struct {
		body   any
		status int
	}{
		{map[string]any{"content": "missing version"}, 400},
		{map[string]any{"content": nil, "version": before["version"]}, 400},
		{map[string]any{"content": strings.Repeat("a", maxTextBytes+1), "version": before["version"]}, 413},
		{map[string]any{"content": "a\x00b", "version": before["version"]}, 415},
	} {
		if res := f.request("PUT", "/api/items/doc/content", tc.body, true); res.Code != tc.status {
			t.Fatal(res.Code, res.Body.String())
		}
	}
	if res := f.request("GET", "/api/items/missing/content", nil, true); res.Code != 404 {
		t.Fatal(res.Code)
	}
	if _, err := f.handler.db.Exec("INSERT INTO items (id,name,is_dir) VALUES ('folder','folder.txt',1)"); err != nil {
		t.Fatal(err)
	}
	if res := f.request("GET", "/api/items/folder/content", nil, true); res.Code != 404 {
		t.Fatal(res.Code)
	}
}
func TestTextFailedDatabaseUpdateKeepsOriginal(t *testing.T) {
	f := newTextFixture(t)
	original := f.add(t, "doc", "note.txt", []byte("original"))
	before := decodedText(t, f.request("GET", "/api/items/doc/content", nil, true))
	_, err := f.handler.db.Exec("CREATE TRIGGER fail_text BEFORE UPDATE OF stored_path ON items BEGIN SELECT RAISE(ABORT,'test failure'); END")
	if err != nil {
		t.Fatal(err)
	}
	res := f.request("PUT", "/api/items/doc/content", map[string]any{"content": "changed", "version": before["version"]}, true)
	if res.Code != 500 {
		t.Fatal(res.Code, res.Body.String())
	}
	data, err := os.ReadFile(filepath.Join(f.root, original))
	if err != nil || string(data) != "original" {
		t.Fatal(string(data), err)
	}
	entries, err := os.ReadDir(filepath.Join(f.root, "uploads"))
	if err != nil || len(entries) != 1 {
		t.Fatal(entries, err)
	}
}

func TestTextPublicLinkDoesNotRenderHTML(t *testing.T) {
	f := newTextFixture(t)
	for _, name := range []string{"document.md", "document.txt"} {
		f.add(t, name, name, []byte("<html><script>alert('unsafe')</script></html>"))
		response := f.request("GET", "/f/"+name, nil, false)
		if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "text/plain; charset=utf-8" {
			t.Fatal(response.Code, response.Header())
		}
	}
}

func TestTextRejectsStoragePathEscape(t *testing.T) {
	f := newTextFixture(t)
	f.add(t, "doc", "note.txt", []byte("inside"))
	outside := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outside, []byte("outside"), 0644); err != nil {
		t.Fatal(err)
	}
	rel, err := filepath.Rel(f.root, outside)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.handler.db.Exec("UPDATE items SET stored_path=? WHERE id='doc'", rel); err != nil {
		t.Fatal(err)
	}
	if res := f.request("GET", "/api/items/doc/content", nil, true); res.Code != 403 {
		t.Fatal(res.Code, res.Body.String())
	}
}
