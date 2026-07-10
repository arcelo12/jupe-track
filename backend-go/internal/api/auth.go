package api

import (
	"crypto/rand"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	JWTSecret        []byte
	accessTokenTTL   time.Duration
	refreshTokenTTL  time.Duration
	loginRateLimiter = newLoginLimiter()
)

func init() {
	// SA-005: Read JWT_SECRET first, fall back to SECRET_KEY for back-compat
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = os.Getenv("SECRET_KEY")
	}
	if secret != "" {
		JWTSecret = []byte(secret)
	} else {
		log.Println("WARNING: JWT_SECRET and SECRET_KEY not provided. Generating a random ephemeral key for this session — all tokens invalidate on restart.")
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			log.Fatalf("Failed to generate secure random key: %v", err)
		}
		JWTSecret = key
	}

	// SA-005 / SA-033: honor env-configured token lifetimes
	accessMins := 60
	if v := os.Getenv("ACCESS_TOKEN_EXPIRE_MINUTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			accessMins = n
		}
	}
	accessTokenTTL = time.Duration(accessMins) * time.Minute

	refreshDays := 7
	if v := os.Getenv("REFRESH_TOKEN_EXPIRE_DAYS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			refreshDays = n
		}
	}
	refreshTokenTTL = time.Duration(refreshDays) * 24 * time.Hour
}

// loginLimiter is a simple in-memory per-IP failed-attempt rate limiter (SA-018)
type loginLimiter struct {
	mu       sync.Mutex
	failures map[string][]time.Time
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{failures: make(map[string][]time.Time)}
}

const (
	loginMaxFailures   = 5
	loginWindow        = 5 * time.Minute
	loginLockoutWindow = 5 * time.Minute
)

func (l *loginLimiter) locked(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-loginLockoutWindow)
	attempts := l.failures[ip]
	pruned := attempts[:0]
	for _, t := range attempts {
		if t.After(cutoff) {
			pruned = append(pruned, t)
		}
	}
	l.failures[ip] = pruned
	return len(pruned) >= loginMaxFailures
}

func (l *loginLimiter) recordFailure(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-loginWindow)
	pruned := l.failures[ip][:0]
	for _, t := range l.failures[ip] {
		if t.After(cutoff) {
			pruned = append(pruned, t)
		}
	}
	pruned = append(pruned, now)
	l.failures[ip] = pruned
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func RegisterAuthRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")

	auth.POST("/refresh", func(c *gin.Context) {
		var req RefreshRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
			return
		}

		token, err := jwt.Parse(req.RefreshToken, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return JWTSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
			return
		}

		// SA-006: require type == "refresh"
		if t, _ := claims["type"].(string); t != "refresh" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token is not a refresh token"})
			return
		}

		// SA-034: use comma-ok form to avoid panic on bad claims
		username, ok := claims["sub"].(string)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
			return
		}

		var user models.User
		if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			return
		}

		// Generate new access token (SA-006: add type=access, SA-005/SA-033: env-configured TTL)
		newToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":      user.Username,
			"exp":      time.Now().Add(accessTokenTTL).Unix(),
			"is_admin": user.IsAdmin,
			"type":     "access",
		})
		newTokenString, _ := newToken.SignedString(JWTSecret)

		c.JSON(http.StatusOK, TokenResponse{
			AccessToken:  newTokenString,
			RefreshToken: req.RefreshToken,
			TokenType:    "bearer",
		})
	})

	auth.POST("/login", func(c *gin.Context) {
		// SA-018: per-IP rate limit on failed logins
		ip := c.ClientIP()
		if loginRateLimiter.locked(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many failed login attempts. Try again later."})
			return
		}

		var req LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
			return
		}

		var user models.User
		if err := database.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
			loginRateLimiter.recordFailure(ip)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		// Verify password
		if err := bcrypt.CompareHashAndPassword([]byte(user.HashedPassword), []byte(req.Password)); err != nil {
			loginRateLimiter.recordFailure(ip)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		// Generate JWT Token (SA-006: type=access; SA-005/SA-033: env-configured TTL)
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":      user.Username,
			"exp":      time.Now().Add(accessTokenTTL).Unix(),
			"is_admin": user.IsAdmin,
			"type":     "access",
		})

		tokenString, err := token.SignedString(JWTSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
			return
		}

		// Generate Refresh Token (SA-005: env-configured TTL)
		refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":  user.Username,
			"exp":  time.Now().Add(refreshTokenTTL).Unix(),
			"type": "refresh",
		})
		refreshTokenString, _ := refreshToken.SignedString(JWTSecret)

		// Update last login
		now := time.Now()
		database.DB.Model(&user).Update("last_login", &now)

		c.JSON(http.StatusOK, TokenResponse{
			AccessToken:  tokenString,
			RefreshToken: refreshTokenString,
			TokenType:    "bearer",
		})
	})

	// Protected Routes
	protected := r.Group("/auth")
	protected.Use(AuthMiddleware())

	protected.POST("/change-password", func(c *gin.Context) {
		var req struct {
			CurrentPassword string `json:"current_password" binding:"required"`
			NewPassword     string `json:"new_password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
			return
		}

		username, _ := c.Get("username")
		var user models.User
		if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.HashedPassword), []byte(req.CurrentPassword)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Incorrect current password"})
			return
		}

		hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash new password"})
			return
		}

		database.DB.Model(&user).Update("hashed_password", string(hashed))
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Password updated successfully"})
	})

	protected.GET("/me", func(c *gin.Context) {
		username, _ := c.Get("username")
		var user models.User
		if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"id":         user.ID,
			"username":   user.Username,
			"email":      user.Email,
			"is_active":  user.IsActive,
			"is_admin":   user.IsAdmin,
			"created_at": user.CreatedAt,
			"last_login": user.LastLogin,
		})
	})
}
