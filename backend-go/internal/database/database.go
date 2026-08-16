package database

import (
	"crypto/rand"
	"log"
	"math/big"
	"os"

	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var DB *gorm.DB

func generateRandomPassword(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
	b := make([]byte, length)
	for i := range b {
		num, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[num.Int64()]
	}
	return string(b)
}

// fixLegacyUsersTable membangun ulang tabel `users` warisan backend Python
// lama ke schema yang cocok dengan model GORM (email diisi placeholder unik
// bila NULL, plus unique index). Migrator glebarez/sqlite gagal melakukan
// rebuild ini sendiri pada schema lama, jadi dilakukan manual sekali.
func fixLegacyUsersTable(db *gorm.DB) {
	db.Exec("DROP TABLE IF EXISTS users__temp")
	db.Exec(`UPDATE users SET email = 'user-' || id || '@legacy.local' WHERE email IS NULL OR email = ''`)

	// Skip rebuild bila unique index email sudah ada (migrasi sudah pernah jalan).
	var idxCount int64
	db.Raw(`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='users' AND name='idx_users_email'`).Scan(&idxCount)
	if idxCount > 0 {
		return
	}

	// NB: DDL satu baris tanpa tab — parser DDL glebarez/sqlite memperlakukan
	// tab sebagai pemisah identifier, sehingga kolom gagal terbaca dan migrasi
	// berikutnya rusak.
	tx := db.Begin()
	stmts := []string{
		`CREATE TABLE users__new (id INTEGER PRIMARY KEY AUTOINCREMENT, username VARCHAR(64) NOT NULL, email VARCHAR(255), hashed_password VARCHAR(255) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT 1, is_admin BOOLEAN NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, last_login DATETIME)`,
		`INSERT INTO users__new (id, username, email, hashed_password, is_active, is_admin, created_at, last_login) SELECT id, username, email, hashed_password, is_active, is_admin, created_at, last_login FROM users`,
		`DROP TABLE users`,
		`ALTER TABLE users__new RENAME TO users`,
		`CREATE UNIQUE INDEX idx_users_username ON users (username)`,
		`CREATE UNIQUE INDEX idx_users_email ON users (email)`,
	}
	for _, s := range stmts {
		if err := tx.Exec(s).Error; err != nil {
			tx.Rollback()
			log.Printf("Legacy users table rebuild skipped: %v", err)
			return
		}
	}
	if err := tx.Commit().Error; err != nil {
		log.Printf("Legacy users table rebuild commit failed: %v", err)
		return
	}
	log.Println("Legacy users table rebuilt to current schema")
}

func Connect() {
	// Fallback path logic: inside docker it's /app/data/jupetrack.db
	// outside docker (local execution) it's likely ../backend/data/jupetrack.db
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		if _, err := os.Stat("/app/data"); !os.IsNotExist(err) {
			dbPath = "/app/data/jupetrack.db"
		} else {
			dbPath = "../backend/data/jupetrack.db"
		}
	}

	database, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database at %s: %v", dbPath, err)
	}

	log.Printf("Successfully connected to database at %s\n", dbPath)

	fixLegacyUsersTable(database)

	// Migrate models. APIKey ditaruh terpisah: kegagalan migrasi tabel
	// legacy (mis. `users` dari backend Python lama) tidak boleh menggagalkan
	// pembuatan tabel api_keys.
	err = database.AutoMigrate(
		&models.ScraperSettings{},
		&models.User{},
		&models.ASMapping{},
	)
	if err != nil {
		log.Printf("Migration warning (legacy tables): %v", err)
	}
	if err := database.AutoMigrate(&models.APIKey{}); err != nil {
		log.Printf("Migration failed (api_keys): %v", err)
	}

	// Create default settings row if table is empty
	var count int64
	database.Model(&models.ScraperSettings{}).Count(&count)
	if count == 0 {
		database.Create(&models.ScraperSettings{
			EnableBGP:              true,
			EnableInterfaces:       true,
			ScrapeInterval:         30000000000, // 30 seconds
			RetentionDaysInterface: 30,
			RetentionDaysBGP:       30,
		})
	} else {
		// Auto-migrate old default 60s to 30s
		database.Model(&models.ScraperSettings{}).
			Where("scrape_interval = ?", 60000000000).
			Update("scrape_interval", 30000000000)
	}

	var userCount int64
	database.Model(&models.User{}).Count(&userCount)
	if userCount == 0 {
		// Create default admin user with random password
		randPass := generateRandomPassword(16)
		hashed, _ := bcrypt.GenerateFromPassword([]byte(randPass), bcrypt.DefaultCost)
		database.Create(&models.User{
			Username:       "admin",
			Email:          "admin@jupetrack.local",
			HashedPassword: string(hashed),
			IsAdmin:        true,
			IsActive:       true,
		})
		log.Println("================================================================")
		log.Println("DEFAULT ADMIN ACCOUNT CREATED")
		log.Printf("Username: admin\n")
		log.Printf("Password: %s\n", randPass)
		log.Println("Please login and change this password immediately.")
		log.Println("================================================================")
	}

	DB = database
}
