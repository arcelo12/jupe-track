package database_test

import (
	"strings"
	"testing"

	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory sqlite: %v", err)
	}

	if err := db.Exec(`CREATE TABLE users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username VARCHAR(64) NOT NULL,
		email VARCHAR(255),
		hashed_password VARCHAR(255) NOT NULL,
		is_active BOOLEAN NOT NULL DEFAULT 1,
		is_admin BOOLEAN NOT NULL DEFAULT 0,
		theme_preset VARCHAR(32) NOT NULL DEFAULT 'graphite-mono',
		color_mode VARCHAR(16) NOT NULL DEFAULT 'dark',
		created_at DATETIME NOT NULL,
		last_login DATETIME
	)`).Error; err != nil {
		t.Fatalf("failed to create users table: %v", err)
	}

	return db
}

func TestBackfillUserThemesSuccess(t *testing.T) {
	db := setupTestDB(t)

	// User 1: empty string values
	if err := db.Exec(`INSERT INTO users (username, email, hashed_password, is_active, is_admin, theme_preset, color_mode, created_at)
		VALUES ('legacy1', 'l1@test.local', 'hash', 1, 0, '', '', datetime('now'))`).Error; err != nil {
		t.Fatalf("failed to insert legacy1: %v", err)
	}

	// User 2: existing valid preferences
	if err := db.Exec(`INSERT INTO users (username, email, hashed_password, is_active, is_admin, theme_preset, color_mode, created_at)
		VALUES ('modern', 'm@test.local', 'hash', 1, 0, 'network-teal', 'light', datetime('now'))`).Error; err != nil {
		t.Fatalf("failed to insert modern: %v", err)
	}

	if err := database.BackfillUserThemes(db); err != nil {
		t.Fatalf("BackfillUserThemes failed: %v", err)
	}

	var legacy1, modern models.User
	if err := db.Where("username = ?", "legacy1").First(&legacy1).Error; err != nil {
		t.Fatalf("failed to query legacy1: %v", err)
	}
	if legacy1.ThemePreset != models.DefaultThemePreset {
		t.Fatalf("legacy1 ThemePreset = %q, want %q", legacy1.ThemePreset, models.DefaultThemePreset)
	}
	if legacy1.ColorMode != models.DefaultColorMode {
		t.Fatalf("legacy1 ColorMode = %q, want %q", legacy1.ColorMode, models.DefaultColorMode)
	}

	if err := db.Where("username = ?", "modern").First(&modern).Error; err != nil {
		t.Fatalf("failed to query modern: %v", err)
	}
	if modern.ThemePreset != "network-teal" {
		t.Fatalf("modern ThemePreset = %q, want network-teal", modern.ThemePreset)
	}
	if modern.ColorMode != "light" {
		t.Fatalf("modern ColorMode = %q, want light", modern.ColorMode)
	}
}

func TestBackfillUserThemesAtomicRollback(t *testing.T) {
	db := setupTestDB(t)

	// User with empty theme fields
	if err := db.Exec(`INSERT INTO users (username, email, hashed_password, is_active, is_admin, theme_preset, color_mode, created_at)
		VALUES ('atomic_test', 'atomic@test.local', 'hash', 1, 0, '', '', datetime('now'))`).Error; err != nil {
		t.Fatalf("failed to insert user: %v", err)
	}

	// Create trigger that fails when color_mode is updated
	if err := db.Exec(`CREATE TRIGGER fail_mode_update BEFORE UPDATE OF color_mode ON users
		BEGIN
			SELECT RAISE(ABORT, 'simulated color_mode failure');
		END;`).Error; err != nil {
		t.Fatalf("failed to create trigger: %v", err)
	}

	err := database.BackfillUserThemes(db)
	if err == nil {
		t.Fatalf("expected error from trigger, got nil")
	}
	if !strings.Contains(err.Error(), "failed to backfill color_mode") {
		t.Fatalf("expected wrapped error containing 'failed to backfill color_mode', got %v", err)
	}

	// Verify rollback: theme_preset must still be empty string, not DefaultThemePreset
	var user models.User
	if err := db.Where("username = ?", "atomic_test").First(&user).Error; err != nil {
		t.Fatalf("failed to query user: %v", err)
	}
	if user.ThemePreset != "" {
		t.Fatalf("expected theme_preset to roll back to empty string, got %q", user.ThemePreset)
	}
}
