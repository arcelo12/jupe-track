package api

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORSMiddleware returns a Gin handler applying CORS headers. Allowed origins come
// from the ALLOWED_ORIGINS env var (comma-separated). Empty or "*" allows any
// origin; otherwise only a matching Origin header is reflected, with Vary: Origin.
func CORSMiddleware() gin.HandlerFunc {
	raw := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	allowAll := raw == "" || raw == "*"

	var allowed []string
	if !allowAll {
		for _, o := range strings.Split(raw, ",") {
			if o = strings.TrimSpace(o); o != "" {
				allowed = append(allowed, o)
			}
		}
		if len(allowed) == 0 {
			allowAll = true
		}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		if allowAll {
			c.Header("Access-Control-Allow-Origin", "*")
		} else if origin != "" {
			for _, o := range allowed {
				if o == origin {
					c.Header("Access-Control-Allow-Origin", origin)
					c.Header("Vary", "Origin")
					break
				}
			}
		}

		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, X-API-Key")
		c.Header("Access-Control-Max-Age", "3600")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
