package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func InitDB(dataDir string) (*sql.DB, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data dir: %w", err)
	}

	uploadsDir := filepath.Join(dataDir, "uploads")
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create uploads dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "silo.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite db: %w", err)
	}

	// 开启 WAL 模式提升并发读写性能
	if _, err := db.Exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;"); err != nil {
		return nil, fmt.Errorf("failed to set pragma: %w", err)
	}

	// 初始化 items 表（自关联目录树）
	schema := `
	CREATE TABLE IF NOT EXISTS items (
		id TEXT PRIMARY KEY,
		parent_id TEXT,
		name TEXT NOT NULL,
		is_dir BOOLEAN NOT NULL DEFAULT 0,
		size_bytes INTEGER NOT NULL DEFAULT 0,
		mime_type TEXT NOT NULL DEFAULT '',
		stored_path TEXT NOT NULL DEFAULT '',
		access_type TEXT NOT NULL DEFAULT 'public',
		allowed_ips TEXT NOT NULL DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_items_parent_id ON items(parent_id);

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("failed to create schema: %w", err)
	}

	return db, nil
}
