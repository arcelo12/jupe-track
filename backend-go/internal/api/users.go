package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func userPublic(u *models.User) gin.H {
	return gin.H{
		"id":         u.ID,
		"username":   u.Username,
		"email":      u.Email,
		"is_admin":   u.IsAdmin,
		"is_active":  u.IsActive,
		"created_at": u.CreatedAt,
		"last_login": u.LastLogin,
	}
}

// RegisterUserRoutes registers admin-only user management endpoints.
// Both middlewares run so JWT context (is_admin) is populated before the
// admin check; AdminMiddleware alone would 403 even valid admins.
func RegisterUserRoutes(rg *gin.RouterGroup) {
	users := rg.Group("/users")
	users.Use(AuthMiddleware(), AdminMiddleware())

	users.GET("", func(c *gin.Context) {
		var list []models.User
		if err := database.DB.Order("id ASC").Find(&list).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list users"})
			return
		}
		out := make([]gin.H, 0, len(list))
		for i := range list {
			out = append(out, userPublic(&list[i]))
		}
		c.JSON(http.StatusOK, gin.H{"users": out, "count": len(out)})
	})

	users.POST("", func(c *gin.Context) {
		var req struct {
			Username string `json:"username" binding:"required"`
			Email    string `json:"email"`
			Password string `json:"password" binding:"required"`
			IsAdmin  bool   `json:"is_admin"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
			return
		}
		req.Username = strings.TrimSpace(req.Username)
		if req.Username == "" || len(req.Username) > 64 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Username must be 1-64 characters"})
			return
		}
		if err := validatePassword(req.Password); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var count int64
		database.DB.Model(&models.User{}).Where("username = ?", req.Username).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "Username already exists"})
			return
		}

		hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}

		user := models.User{
			Username:       req.Username,
			Email:          req.Email,
			HashedPassword: string(hashed),
			IsAdmin:        req.IsAdmin,
			IsActive:       true,
		}
		if err := database.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
			return
		}
		c.JSON(http.StatusCreated, userPublic(&user))
	})

	users.PATCH("/:id", func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user id"})
			return
		}

		var user models.User
		if err := database.DB.First(&user, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		var req struct {
			IsAdmin  *bool  `json:"is_admin"`
			IsActive *bool  `json:"is_active"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
			return
		}

		// Prevent locking yourself out: cannot demote or disable own account.
		username, _ := c.Get("username")
		if username == user.Username {
			if (req.IsAdmin != nil && !*req.IsAdmin) || (req.IsActive != nil && !*req.IsActive) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot demote or disable your own account"})
				return
			}
		}

		updates := map[string]interface{}{}
		if req.IsAdmin != nil {
			updates["is_admin"] = *req.IsAdmin
		}
		if req.IsActive != nil {
			updates["is_active"] = *req.IsActive
		}
		if req.Password != "" {
			if err := validatePassword(req.Password); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
				return
			}
			updates["hashed_password"] = string(hashed)
		}
		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nothing to update"})
			return
		}
		if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
			return
		}
		database.DB.First(&user, id)
		c.JSON(http.StatusOK, userPublic(&user))
	})
}
