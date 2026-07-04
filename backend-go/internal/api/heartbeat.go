package api

import (
	"net/http"

	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"github.com/gin-gonic/gin"
)

func RegisterHeartbeatRoutes(r *gin.RouterGroup) {
	hb := r.Group("/heartbeat")
	hb.Use(AuthMiddleware())

	// POST /api/v1/heartbeat/connect - called when user opens the web app
	hb.POST("/connect", func(c *gin.Context) {
		scraper.RegisterActiveUser()
		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"active_users": scraper.GetActiveUserCount(),
		})
	})

	// POST /api/v1/heartbeat/disconnect - called when user closes the web app
	hb.POST("/disconnect", func(c *gin.Context) {
		scraper.UnregisterActiveUser()
		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"active_users": scraper.GetActiveUserCount(),
		})
	})

	// GET /api/v1/heartbeat/status - check current scraper status
	hb.GET("/status", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"active_users": scraper.GetActiveUserCount(),
		})
	})
}
