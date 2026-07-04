package api

import (
	"net/http"

	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"github.com/gin-gonic/gin"
)

// RegisterLiveRoutes registers endpoints for triggering live actions
func RegisterLiveRoutes(r *gin.RouterGroup) {
	live := r.Group("/live")
	live.Use(AuthMiddleware())

	live.POST("/refresh", func(c *gin.Context) {
		scraper.TriggerScrape()
		c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Manual scrape triggered"})
	})
}
