package api

// API key authentication for the JupeTrack backend.
//
// INTEGRATION NOTES (for whoever wires this up):
//
//  1. APIKeyMiddleware must run BEFORE AuthMiddleware on any route shared by
//     JWT and API-key clients, so the API-key path can claim the request
//     before the JWT path rejects it for a missing Authorization header.
//
//  2. Simplest correct wiring: use AuthAnyMiddleware() in place of
//     AuthMiddleware() on shared routes. It dispatches to the API-key path
//     when the X-API-Key header is present, otherwise falls back to the
//     standard JWT path.
//
//  3. Add &models.APIKey{} to the AutoMigrate list in
//     internal/database/database.go (integration step, not done here).
//
//  4. RegisterAPIKeyRoutes expects an already-authenticated group (e.g.
//     protected := r.Group("/api/v1", AuthMiddleware())) and applies
//     AdminMiddleware() itself to every key-management route.
//
//  5. Per-endpoint authorization: wrap handlers with RequireScope("read:bgp")
//     etc. RequireScope is a no-op for JWT-authenticated requests.

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/gin-gonic/gin"
)

// Valid API key scopes
const (
	ScopeReadBGP          = "read:bgp"
	ScopeReadInterfaces   = "read:interfaces"
	ScopeReadMetrics      = "read:metrics"
	ScopeReadDevice       = "read:device"
	ScopeReadLookup       = "read:lookup"
	ScopeReadAll          = "read:*" // wildcard: semua scope read:*
	ScopeExecLookingGlass = "exec:looking-glass"
)

// ValidScopes returns the whitelist of assignable API key scopes
func ValidScopes() []string {
	return []string{
		ScopeReadBGP,
		ScopeReadInterfaces,
		ScopeReadMetrics,
		ScopeReadDevice,
		ScopeReadLookup,
		ScopeReadAll,
		ScopeExecLookingGlass,
	}
}

func isValidScope(scope string) bool {
	for _, s := range ValidScopes() {
		if s == scope {
			return true
		}
	}
	return false
}

// GenerateAPIKey creates a new API key. plain is returned to the caller once,
// prefix identifies the key in listings, hash is what gets stored.
func GenerateAPIKey() (plain string, prefix string, hash string, err error) {
	raw := make([]byte, 20) // 40 hex chars
	if _, err = rand.Read(raw); err != nil {
		return "", "", "", err
	}
	plain = "jpt_" + hex.EncodeToString(raw)
	if len(plain) >= 12 {
		prefix = plain[:12]
	} else {
		prefix = plain
	}
	sum := sha256.Sum256([]byte(plain))
	hash = hex.EncodeToString(sum[:])
	return plain, prefix, hash, nil
}

func hashAPIKey(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}

// apiKeyMetadata is the safe public representation of an API key (no hash)
func apiKeyMetadata(k *models.APIKey) gin.H {
	return gin.H{
		"id":           k.ID,
		"name":         k.Name,
		"prefix":       k.Prefix,
		"scopes":       k.ScopeList(),
		"is_active":    k.IsActive,
		"expires_at":   k.ExpiresAt,
		"last_used_at": k.LastUsedAt,
		"created_by":   k.CreatedBy,
		"created_at":   k.CreatedAt,
	}
}

// RegisterAPIKeyRoutes registers admin-only API key management endpoints.
// rg must already be protected by AuthMiddleware (JWT); AdminMiddleware is
// applied here to every key-management route.
func RegisterAPIKeyRoutes(rg *gin.RouterGroup) {
	keys := rg.Group("/api-keys")
	keys.Use(AdminMiddleware())

	keys.POST("", func(c *gin.Context) {
		var req struct {
			Name          string   `json:"name" binding:"required"`
			Scopes        []string `json:"scopes"`
			ExpiresInDays int      `json:"expires_in_days"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
			return
		}

		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" || len(req.Name) > 128 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid name"})
			return
		}

		for _, s := range req.Scopes {
			if !isValidScope(s) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scope: " + s})
				return
			}
		}

		plain, prefix, hash, err := GenerateAPIKey()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate key"})
			return
		}

		var expiresAt *time.Time
		if req.ExpiresInDays > 0 {
			t := time.Now().Add(time.Duration(req.ExpiresInDays) * 24 * time.Hour)
			expiresAt = &t
		}

		createdBy, _ := c.Get("username")
		createdByStr, _ := createdBy.(string)

		key := models.APIKey{
			Name:      req.Name,
			Prefix:    prefix,
			KeyHash:   hash,
			Scopes:    strings.Join(req.Scopes, ","),
			IsActive:  true,
			ExpiresAt: expiresAt,
			CreatedBy: createdByStr,
		}
		if err := database.DB.Create(&key).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create api key"})
			return
		}

		resp := apiKeyMetadata(&key)
		resp["key"] = plain // returned exactly once, never stored
		c.JSON(http.StatusCreated, resp)
	})

	keys.GET("", func(c *gin.Context) {
		var list []models.APIKey
		if err := database.DB.Find(&list).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list api keys"})
			return
		}
		out := make([]gin.H, 0, len(list))
		for i := range list {
			out = append(out, apiKeyMetadata(&list[i]))
		}
		c.JSON(http.StatusOK, out)
	})

	keys.DELETE("/:id", func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
			return
		}
		result := database.DB.Delete(&models.APIKey{}, id)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete api key"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
			return
		}
		c.Status(http.StatusNoContent)
	})

	keys.PATCH("/:id", func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
			return
		}

		var key models.APIKey
		if err := database.DB.First(&key, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
			return
		}

		var req struct {
			IsActive *bool    `json:"is_active"`
			Scopes   []string `json:"scopes"`
			Name     *string  `json:"name"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
			return
		}

		updates := map[string]interface{}{}
		if req.IsActive != nil {
			updates["is_active"] = *req.IsActive
		}
		if req.Scopes != nil {
			for _, s := range req.Scopes {
				if !isValidScope(s) {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scope: " + s})
					return
				}
			}
			updates["scopes"] = strings.Join(req.Scopes, ",")
		}
		if req.Name != nil {
			name := strings.TrimSpace(*req.Name)
			if name == "" || len(name) > 128 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid name"})
				return
			}
			updates["name"] = name
		}

		if len(updates) > 0 {
			if err := database.DB.Model(&key).Updates(updates).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update api key"})
				return
			}
			database.DB.First(&key, id)
		}

		c.JSON(http.StatusOK, apiKeyMetadata(&key))
	})
}

// APIKeyMiddleware validates the X-API-Key header. Empty header falls through
// (c.Next) so JWT auth can still claim the request on shared routes.
func APIKeyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		plain := c.GetHeader("X-API-Key")
		if plain == "" {
			c.Next()
			return
		}

		hash := hashAPIKey(plain)

		var key models.APIKey
		err := database.DB.
			Where("key_hash = ? AND is_active = ? AND (expires_at IS NULL OR expires_at > ?)", hash, true, time.Now()).
			First(&key).Error
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired api key"})
			c.Abort()
			return
		}

		// Update last_used_at asynchronously; failure is non-fatal
		go func(id uint) {
			now := time.Now()
			database.DB.Model(&models.APIKey{}).Where("id = ?", id).Update("last_used_at", &now)
		}(key.ID)

		c.Set("auth_type", "api_key")
		c.Set("api_key_name", key.Name)
		c.Set("api_key_scopes", key.ScopeList())
		c.Next()
	}
}

// scopeGranted reports whether the held scopes satisfy the required scope.
// A key holding "read:*" satisfies any "read:<x>" requirement; exact match
// covers the rest. Wildcard never grants exec:* scopes.
func scopeGranted(held []string, required string) bool {
	for _, s := range held {
		if s == required {
			return true
		}
		if s == ScopeReadAll && strings.HasPrefix(required, "read:") {
			return true
		}
	}
	return false
}

// RequireScope enforces a scope for API-key-authenticated requests.
// JWT-authenticated requests pass through unconditionally.
func RequireScope(scope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authType, _ := c.Get("auth_type")
		if authType != "api_key" {
			c.Next()
			return
		}

		scopesVal, _ := c.Get("api_key_scopes")
		scopes, _ := scopesVal.([]string)
		if scopeGranted(scopes, scope) {
			c.Next()
			return
		}

		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient scope"})
		c.Abort()
	}
}

// apiKeyHasScope reports whether the current request was authenticated with an
// API key that carries the given scope. Non-API-key requests return true so
// JWT flows are never restricted by it.
func apiKeyHasScope(c *gin.Context, scope string) bool {
	if c.GetString("auth_type") != "api_key" {
		return true
	}
	scopesVal, _ := c.Get("api_key_scopes")
	scopes, _ := scopesVal.([]string)
	return scopeGranted(scopes, scope)
}

// AuthAnyMiddleware dispatches between API key auth and JWT auth:
// X-API-Key header present -> API key path; otherwise -> JWT path.
// Use this instead of AuthMiddleware on routes that accept both.
func AuthAnyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("X-API-Key") != "" {
			APIKeyMiddleware()(c)
			return
		}
		AuthMiddleware()(c)
	}
}
