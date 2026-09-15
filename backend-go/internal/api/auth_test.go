package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{"empty", "", true},
		{"too short", "short", true},
		{"just under min", "01234567890", true}, // 11 chars
		{"exactly min", "012345678901", false},  // 12 chars
		{"comfortable", "correcthorsebatterystaple", false},
		{"at bcrypt max", string(make([]byte, 72)), false},
		{"over bcrypt max", string(make([]byte, 73)), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePassword(tt.password)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validatePassword(%q) err = %v, wantErr = %v", tt.name, err, tt.wantErr)
			}
		})
	}
}

func setupAuthTestEnv(t *testing.T) (*gorm.DB, *gin.Engine) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dbName := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dbName), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to open test db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatalf("Failed to migrate test db: %v", err)
	}

	database.DB = db
	JWTSecret = []byte("test-secret-key-32-chars-long!!")
	accessTokenTTL = 60 * time.Minute

	router := gin.New()
	apiGroup := router.Group("/api/v1")
	RegisterAuthRoutes(apiGroup)

	return db, router
}

func createTestUser(t *testing.T, db *gorm.DB, username string, preset, mode string, isAdmin bool) models.User {
	t.Helper()
	u := models.User{
		Username:    username,
		Email:       username + "@test.local",
		IsActive:    true,
		IsAdmin:     isAdmin,
		ThemePreset: preset,
		ColorMode:   mode,
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatalf("Failed to create user %q: %v", username, err)
	}
	return u
}

func makeTestToken(username string, isAdmin bool) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":      username,
		"exp":      time.Now().Add(accessTokenTTL).Unix(),
		"is_admin": isAdmin,
		"type":     "access",
	})
	tokenStr, _ := token.SignedString(JWTSecret)
	return tokenStr
}

func TestAuthMe_Authorization(t *testing.T) {
	_, router := setupAuthTestEnv(t)

	// GET without token -> 401
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("GET /auth/me unauthenticated = %d; want 401", w.Code)
	}

	// PATCH without token -> 401
	body := bytes.NewBufferString(`{"theme_preset":"network-teal","color_mode":"light"}`)
	req, _ = http.NewRequest(http.MethodPatch, "/api/v1/auth/me", body)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("PATCH /auth/me unauthenticated = %d; want 401", w.Code)
	}

	// PATCH with invalid token -> 401
	req, _ = http.NewRequest(http.MethodPatch, "/api/v1/auth/me", bytes.NewBufferString(`{"theme_preset":"network-teal","color_mode":"light"}`))
	req.Header.Set("Authorization", "Bearer invalid-token-string")
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("PATCH /auth/me invalid token = %d; want 401", w.Code)
	}
}

func TestAuthMe_Get(t *testing.T) {
	db, router := setupAuthTestEnv(t)
	user := createTestUser(t, db, "testuser", models.ThemePresetSignalBlue, models.ColorModeLight, false)
	token := makeTestToken(user.Username, false)

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /auth/me status = %d; want 200, body: %s", w.Code, w.Body.String())
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}
	if res["username"] != "testuser" {
		t.Errorf("username = %v; want testuser", res["username"])
	}
	if res["theme_preset"] != models.ThemePresetSignalBlue {
		t.Errorf("theme_preset = %v; want %s", res["theme_preset"], models.ThemePresetSignalBlue)
	}
	if res["color_mode"] != models.ColorModeLight {
		t.Errorf("color_mode = %v; want %s", res["color_mode"], models.ColorModeLight)
	}

	// Canonical fallback check: user with blank theme fields
	rawUser := models.User{
		Username: "blankuser",
		Email:    "blank@test.local",
		IsActive: true,
	}
	if err := db.Create(&rawUser).Error; err != nil {
		t.Fatalf("Failed to create blank user: %v", err)
	}
	// Force blank values in DB
	db.Model(&rawUser).Updates(map[string]interface{}{
		"theme_preset": "",
		"color_mode":   "",
	})

	blankToken := makeTestToken("blankuser", false)
	req, _ = http.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+blankToken)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /auth/me for blank user status = %d; want 200", w.Code)
	}
	var blankRes map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &blankRes)
	if blankRes["theme_preset"] != models.DefaultThemePreset {
		t.Errorf("theme_preset fallback = %v; want %s", blankRes["theme_preset"], models.DefaultThemePreset)
	}
	if blankRes["color_mode"] != models.DefaultColorMode {
		t.Errorf("color_mode fallback = %v; want %s", blankRes["color_mode"], models.DefaultColorMode)
	}

	// User not in DB -> 404
	missingToken := makeTestToken("nonexistent", false)
	req, _ = http.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+missingToken)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("GET /auth/me for nonexistent user = %d; want 404", w.Code)
	}
}

func TestAuthMe_Patch_SuccessAndIsolation(t *testing.T) {
	db, router := setupAuthTestEnv(t)
	userA := createTestUser(t, db, "alice", models.ThemePresetGraphiteMono, models.ColorModeDark, false)
	userB := createTestUser(t, db, "bob", models.ThemePresetGraphiteMono, models.ColorModeDark, false)

	tokenA := makeTestToken(userA.Username, false)
	tokenB := makeTestToken(userB.Username, false)

	// Valid PATCH by User A
	patchBody := []byte(`{"theme_preset":"network-teal","color_mode":"light"}`)
	req, _ := http.NewRequest(http.MethodPatch, "/api/v1/auth/me", bytes.NewBuffer(patchBody))
	req.Header.Set("Authorization", "Bearer "+tokenA)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("PATCH /auth/me status = %d; want 200, body: %s", w.Code, w.Body.String())
	}

	var resA map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resA); err != nil {
		t.Fatalf("Failed to parse PATCH response: %v", err)
	}
	if resA["theme_preset"] != "network-teal" || resA["color_mode"] != "light" {
		t.Fatalf("PATCH response wrong preferences: %v", resA)
	}
	if resA["username"] != "alice" {
		t.Errorf("username = %v; want alice", resA["username"])
	}
	if resA["is_admin"] != false {
		t.Errorf("is_admin modified: %v", resA["is_admin"])
	}

	// Verify DB persistence for User A
	var dbUserA models.User
	db.Where("username = ?", "alice").First(&dbUserA)
	if dbUserA.ThemePreset != "network-teal" || dbUserA.ColorMode != "light" {
		t.Fatalf("DB userA not updated: preset=%s mode=%s", dbUserA.ThemePreset, dbUserA.ColorMode)
	}

	// Verify account isolation: User B must remain unchanged in DB and in GET /me
	var dbUserB models.User
	db.Where("username = ?", "bob").First(&dbUserB)
	if dbUserB.ThemePreset != models.ThemePresetGraphiteMono || dbUserB.ColorMode != models.ColorModeDark {
		t.Fatalf("DB userB mutated: preset=%s mode=%s", dbUserB.ThemePreset, dbUserB.ColorMode)
	}

	req, _ = http.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokenB)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /auth/me User B status = %d; want 200", w.Code)
	}
	var resB map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resB)
	if resB["theme_preset"] != "graphite-mono" || resB["color_mode"] != "dark" {
		t.Fatalf("User B GET /me preferences altered: %v", resB)
	}
}

func TestAuthMe_Patch_Validation(t *testing.T) {
	db, router := setupAuthTestEnv(t)
	user := createTestUser(t, db, "charlie", models.ThemePresetGraphiteMono, models.ColorModeDark, false)
	token := makeTestToken(user.Username, false)

	cases := []struct {
		name    string
		payload string
	}{
		{"empty payload", `{}`},
		{"malformed json", `{"theme_preset":`},
		{"missing theme_preset", `{"color_mode":"light"}`},
		{"missing color_mode", `{"theme_preset":"signal-blue"}`},
		{"empty theme_preset", `{"theme_preset":"","color_mode":"light"}`},
		{"empty color_mode", `{"theme_preset":"signal-blue","color_mode":""}`},
		{"invalid theme_preset", `{"theme_preset":"unknown-preset","color_mode":"dark"}`},
		{"invalid color_mode", `{"theme_preset":"signal-blue","color_mode":"sepia"}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodPatch, "/api/v1/auth/me", bytes.NewBufferString(tc.payload))
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("PATCH payload %q code = %d; want 400, body: %s", tc.payload, w.Code, w.Body.String())
			}
		})
	}
}

func TestAuthMe_Patch_NotFound(t *testing.T) {
	_, router := setupAuthTestEnv(t)
	token := makeTestToken("ghost", false)

	req, _ := http.NewRequest(http.MethodPatch, "/api/v1/auth/me", bytes.NewBufferString(`{"theme_preset":"signal-blue","color_mode":"dark"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("PATCH for non-existent user code = %d; want 404", w.Code)
	}
}

func TestAuthMe_Patch_DBError(t *testing.T) {
	db, router := setupAuthTestEnv(t)
	user := createTestUser(t, db, "dave", models.ThemePresetGraphiteMono, models.ColorModeDark, false)
	token := makeTestToken(user.Username, false)

	// Create a SQLite trigger that aborts any UPDATE on users
	if err := db.Exec(`CREATE TRIGGER fail_user_update BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, 'forced update error'); END;`).Error; err != nil {
		t.Fatalf("Failed to create test trigger: %v", err)
	}

	req, _ := http.NewRequest(http.MethodPatch, "/api/v1/auth/me", bytes.NewBufferString(`{"theme_preset":"signal-blue","color_mode":"dark"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("PATCH with DB error code = %d; want 500, body: %s", w.Code, w.Body.String())
	}
}
