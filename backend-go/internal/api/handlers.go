package api

import (
	"log"
	"net/http"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/arcelo12/jupe-track/backend-go/internal/metrics"
	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"github.com/gin-gonic/gin"
)

// SetupRoutes registers all API endpoints
func SetupRoutes(r *gin.Engine) {
	// Add request timing middleware to all routes for metrics
	r.Use(func(c *gin.Context) {
		start := time.Now()
		c.Next()

		duration := time.Since(start)
		endpoint := c.FullPath()
		if endpoint == "" {
			endpoint = "/unknown"
		}

		metrics.RecordAPIRequest(endpoint, c.Request.Method, c.Writer.Status(), duration)
	})

	api := r.Group("/api/v1") // Using v1 to match Python convention

	RegisterAuthRoutes(api)
	RegisterLookingGlassRoutes(api)
	RegisterBGPRoutes(api)
	RegisterSettingsRoutes(api)
	RegisterInterfacesRoutes(api)
	RegisterMetricsRoutes(api)
	RegisterHeartbeatRoutes(api)
	RegisterWebSocketRoutes(api)
	RegisterLookupRoutes(api)
	RegisterASMappingRoutes(api)
	RegisterAPIKeyRoutes(api) // enforces JWT + admin internally
	RegisterUserRoutes(api)   // enforces JWT + admin internally

	// Live Data Endpoints (Instant response from memory) — SA-001: require auth
	live := api.Group("/live")
	live.Use(AuthAnyMiddleware())

	live.GET("/bgp", RequireScope(ScopeReadBGP), func(c *gin.Context) {
		sys := c.DefaultQuery("logical_system", "global")
		peers := cache.GlobalCache.GetBGP(sys)
		c.JSON(http.StatusOK, peers)
	})

	live.GET("/interfaces", RequireScope(ScopeReadInterfaces), func(c *gin.Context) {
		ifaces := cache.GlobalCache.GetInterfaces()
		c.JSON(http.StatusOK, ifaces)
	})

	// Manual scrape trigger hits the router over NETCONF — admin only
	live.POST("/refresh", AdminMiddleware(), func(c *gin.Context) {
		scraper.TriggerScrape()
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Manual scrape triggered"})
	})

	// SA-001: gate diagnostic/test endpoints behind auth (admin)
	protected := api.Group("/")
	protected.Use(AuthMiddleware())
	protected.Use(AdminMiddleware())

	protected.GET("/diagnose", func(c *gin.Context) {
		config := junos.GetDeviceConfig()

		// Test raw NETCONF RPC first
		rawOut, err := junos.RunNetconfRPC(`<get-software-information/>`)
		if err != nil {
			// SA-020: log detail server-side, return generic to client
			log.Printf("[diagnose] NETCONF RPC get-software-information failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"stage":   "NETCONF RPC get-software-information",
				"error":   "internal error",
			})
			return
		}

		// Test CLI Command wrapper
		cliOut, err := junos.RunCLICommand("show version")
		if err != nil {
			log.Printf("[diagnose] CLI command wrapper (show version) failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"stage":   "CLI command wrapper (show version)",
				"error":   "internal error",
				"raw_xml": rawOut,
				"config": gin.H{
					"host": config.Host,
					"user": config.User,
					"port": config.Port,
				},
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"cli_output":  cliOut,
			"raw_netconf": rawOut,
			"config": gin.H{
				"host": config.Host,
				"user": config.User,
				"port": config.Port,
			},
		})
	})

	protected.GET("/test-bgp", func(c *gin.Context) {
		rawXml, err := junos.RunNetconfRPC("<get-bgp-summary-information/>")
		if err != nil {
			log.Printf("[test-bgp] RPC failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"raw_xml": rawXml})
	})

	protected.GET("/test-iface", func(c *gin.Context) {
		iface, err := scraper.FetchInterfaces()
		if err != nil {
			log.Printf("[test-iface] fetch failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"interfaces": iface})
	})
}
