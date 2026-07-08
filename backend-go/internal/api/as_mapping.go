package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
)

func RegisterASMappingRoutes(r *gin.RouterGroup) {
	group := r.Group("/as-mapping")
	
	// Get all mappings
	group.GET("", func(c *gin.Context) {
		var mappings []models.ASMapping
		if err := database.DB.Find(&mappings).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch mappings"})
			return
		}
		c.JSON(http.StatusOK, mappings)
	})

	// Upsert a mapping
	group.POST("", func(c *gin.Context) {
		var input models.ASMapping
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
			return
		}
		
		if input.ASN == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ASN is required"})
			return
		}

		// Update or Create
		var existing models.ASMapping
		result := database.DB.Where("asn = ?", input.ASN).First(&existing)
		if result.Error == nil {
			// Update
			existing.Name = input.Name
			existing.Type = input.Type
			if err := database.DB.Save(&existing).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update mapping"})
				return
			}
			c.JSON(http.StatusOK, existing)
			return
		}

		// Create
		if err := database.DB.Create(&input).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create mapping"})
			return
		}

		c.JSON(http.StatusCreated, input)
	})

	// Delete a mapping
	group.DELETE("/:asn", func(c *gin.Context) {
		asn := c.Param("asn")
		if err := database.DB.Where("asn = ?", asn).Delete(&models.ASMapping{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete mapping"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
}
