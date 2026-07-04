package api

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/gin-gonic/gin"
)

func RegisterSettingsRoutes(r *gin.RouterGroup) {
	settings := r.Group("/settings")
	settings.Use(AuthMiddleware())

	settings.GET("/device", func(c *gin.Context) {
		config := junos.GetDeviceConfig()
		
		maskedPass := ""
		if config.Password != "" {
			maskedPass = "********"
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"config": gin.H{
				"host": config.Host,
				"user": config.User,
				"port": config.Port,
				"password": maskedPass, // Mask password instead of exposing plaintext
			},
		})
	})

	settings.POST("/device", func(c *gin.Context) {
		var req junos.DeviceConfig
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
			return
		}

		// Read existing to keep password if empty
		existing := junos.GetDeviceConfig()
		if req.Password == "" || req.Password == "********" {
			req.Password = existing.Password
		}
		if req.Port == "" {
			req.Port = "830"
		}

		var configPath string
		if _, err := os.Stat("/app/data"); !os.IsNotExist(err) {
			configPath = "/app/data/device_config.json"
		} else {
			configPath = "../backend/data/device_config.json"
		}

		data, _ := json.MarshalIndent(req, "", "    ")
		if err := os.WriteFile(configPath, data, 0600); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save config"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Device configuration saved successfully",
		})
	})
}
