package metrics

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// SetupRoutes adds Prometheus metrics endpoints to the router
func SetupRoutes(router *gin.Engine) {
	// Prometheus scrape endpoint
	router.GET("/metrics", prometheusHandler())

	// Health check endpoint that includes metric info (optional)
	router.GET("/api/v1/metrics", metricsInfoHandler)
}

// prometheusHandler returns a HandlerFunc that serves Prometheus metrics
func prometheusHandler() gin.HandlerFunc {
	handler := promhttp.Handler()

	return func(c *gin.Context) {
		handler.ServeHTTP(c.Writer, c.Request)
	}
}

// metricsInfoHandler returns basic information about available metrics
func metricsInfoHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"metrics_endpoint": "/metrics",
		"format":           "text/plain; version=0.0.4",
		"total_metrics":    23,
		"subsystems":       []string{"scraper", "bgp", "interfaces", "database", "api", "cache"},
		"description":      "Prometheus-compatible metrics for JupeTrack monitoring",
	})
}
