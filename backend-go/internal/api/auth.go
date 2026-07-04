package api

import (
	"crypto/rand"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var JWTSecret []byte

func init() {
	secret := os.Getenv("JWT_SECRET")
	if secret != "" {
		JWTSecret = []byte(secret)
	} else {
		log.Println("JWT_SECRET not provided. Generating a random 32-byte secure key for this session.")
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			log.Fatalf("Failed to generate secure random key: %v", err)
		}
		JWTSecret = key
	}
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

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			username := claims["sub"].(string)
			var user models.User
			if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
				return
			}

			// Generate new access token
			newToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
				"sub":      user.Username,
				"exp":      time.Now().Add(time.Hour * 24).Unix(),
				"is_admin": user.IsAdmin,
			})
			newTokenString, _ := newToken.SignedString(JWTSecret)

			c.JSON(http.StatusOK, TokenResponse{
				AccessToken:  newTokenString,
				RefreshToken: req.RefreshToken,
				TokenType:    "bearer",
			})
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid claims"})
		}
	})

	auth.POST("/login", func(c *gin.Context) {
		var req LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
			return
		}

		var user models.User
		if err := database.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		// Verify password
		if err := bcrypt.CompareHashAndPassword([]byte(user.HashedPassword), []byte(req.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		// Generate JWT Token
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": user.Username,
			"exp": time.Now().Add(time.Hour * 24).Unix(),
			"is_admin": user.IsAdmin,
		})

		tokenString, err := token.SignedString(JWTSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
			return
		}
		
		// Generate Refresh Token
		refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": user.Username,
			"exp": time.Now().Add(time.Hour * 24 * 7).Unix(),
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
