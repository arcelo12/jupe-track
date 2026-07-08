package api

import (
	"github.com/gin-gonic/gin"
	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"net/http"
)

// SetupRoutes registers all API endpoints
func SetupRoutes(r *gin.Engine) {
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

	// Live Data Endpoints (Instant response from memory)
	live := api.Group("/live")
	
	live.GET("/bgp", func(c *gin.Context) {
		sys := c.DefaultQuery("logical_system", "global")
		peers := cache.GlobalCache.GetBGP(sys)
		c.JSON(http.StatusOK, peers)
	})
	
	live.GET("/interfaces", func(c *gin.Context) {
		ifaces := cache.GlobalCache.GetInterfaces()
		c.JSON(http.StatusOK, ifaces)
	})

	live.POST("/refresh", func(c *gin.Context) {
		scraper.TriggerScrape()
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Manual scrape triggered"})
	})

	api.GET("/diagnose", func(c *gin.Context) {
		config := junos.GetDeviceConfig()
		
		// Test raw NETCONF RPC first
		rawOut, err := junos.RunNetconfRPC(`<get-software-information/>`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"stage":   "NETCONF RPC get-software-information",
				"error":   err.Error(),
				"config": gin.H{
					"host": config.Host,
					"user": config.User,
					"port": config.Port,
				},
			})
			return
		}

		// Test CLI Command wrapper
		cliOut, err := junos.RunCLICommand("show version")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"stage":   "CLI command wrapper (show version)",
				"error":   err.Error(),
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

	api.GET("/test-bgp", func(c *gin.Context) {
		rawXml, err := junos.RunNetconfRPC("<get-bgp-summary-information/>")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"raw_xml": rawXml})
	})

	api.GET("/test-iface", func(c *gin.Context) {
		iface, err := scraper.FetchInterfaces()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"interfaces": iface})
	})
}
