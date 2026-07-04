package main

import (
	"log"
	"time"
	"net/http"

	"github.com/arcelo12/jupe-track/backend-go/internal/api"
	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Database Connection (SQLite)
	database.Connect()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Go backend is running via Gin"})
	})

	api.SetupRoutes(r)

	// Fetch Settings from DB
	var settings models.ScraperSettings
	if database.DB != nil {
		database.DB.First(&settings)
	}

	if settings.ID == 0 {
		// Fallback defaults if DB fails
		settings = models.ScraperSettings{
			EnableBGP:        true,
			EnableInterfaces: true,
			ScrapeInterval:   30 * time.Second,
		}
	}
	
	// Start scraper worker with settings
	scraper.StartWorker(&settings)

	log.Println("Starting Gin server on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}
