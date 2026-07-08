package database

import (
	"crypto/rand"
	"log"
	"math/big"
	"os"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"golang.org/x/crypto/bcrypt"
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

	// Migrate models
	err = database.AutoMigrate(
		&models.ScraperSettings{},
		&models.User{},
		&models.ASMapping{},
	)
	if err != nil {
		log.Printf("Migration failed: %v", err)
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
