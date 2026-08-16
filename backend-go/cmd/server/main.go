package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/api"
	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/metrics"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"github.com/gin-gonic/gin"
)

func main() {
	startTime := time.Now()

	// Initialize Database Connection (SQLite)
	database.Connect()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// SA-031: limit request body to 1MB to mitigate DoS
	r.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
		c.Next()
	})

	// External API support: CORS (ALLOWED_ORIGINS env) + global rate limit
	r.Use(api.CORSMiddleware())
	r.Use(api.GlobalRateLimitMiddleware())

	// Health check endpoint with Prometheus integration
	metrics.SetUptime("server", time.Since(startTime))

	health := func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
	r.GET("/health", health)
	r.GET("/api/v1/health", health) // alias supaya probe bisa pakai prefix konsisten

	// Setup Prometheus metrics endpoints
	metrics.SetupRoutes(r)

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

	// Graceful shutdown handling
	go handleShutdown(startTime)

	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}

// handleShutdown handles graceful shutdown signals
func handleShutdown(startTime time.Time) {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan // Wait for signal

	log.Println("Received shutdown signal, performing graceful shutdown...")

	// Record final metrics before shutdown
	metrics.SetUptime("server", time.Since(startTime))
	metrics.SetUptime("scraper", 0) // Scraper stops during shutdown

	// Let existing requests finish (optional timeout)
	time.Sleep(5 * time.Second)

	log.Println("Shutdown complete")
	os.Exit(0)
}
