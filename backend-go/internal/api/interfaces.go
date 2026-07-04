package api

import (
	"net/http"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/gin-gonic/gin"
)

func RegisterInterfacesRoutes(r *gin.RouterGroup) {
	interfaces := r.Group("/interfaces")
	interfaces.Use(AuthMiddleware())

	interfaces.GET("/traffic/:logical_system", func(c *gin.Context) {
		// Serve from cache
		c.JSON(http.StatusOK, cache.GlobalCache.GetInterfaces())
	})
}
