package models

import (
	"errors"
	"time"
)

const (
	ThemePresetGraphiteMono   = "graphite-mono"
	ThemePresetSignalBlue     = "signal-blue"
	ThemePresetNetworkTeal    = "network-teal"
	ThemePresetMidnightIndigo = "midnight-indigo"

	DefaultThemePreset = ThemePresetGraphiteMono

	ColorModeDark  = "dark"
	ColorModeLight = "light"

	DefaultColorMode = ColorModeDark
)

var (
	ErrInvalidThemePreset = errors.New("invalid theme preset")
	ErrInvalidColorMode   = errors.New("invalid color mode")
)

// IsValidThemePreset reports whether the given preset is one of the supported theme presets.
func IsValidThemePreset(preset string) bool {
	switch preset {
	case ThemePresetGraphiteMono, ThemePresetSignalBlue, ThemePresetNetworkTeal, ThemePresetMidnightIndigo:
		return true
	default:
		return false
	}
}

// IsValidColorMode reports whether the given mode is one of the supported color modes.
func IsValidColorMode(mode string) bool {
	switch mode {
	case ColorModeDark, ColorModeLight:
		return true
	default:
		return false
	}
}

// NormalizeThemePreset returns preset if valid, otherwise returns DefaultThemePreset.
func NormalizeThemePreset(preset string) string {
	if IsValidThemePreset(preset) {
		return preset
	}
	return DefaultThemePreset
}

// NormalizeColorMode returns mode if valid, otherwise returns DefaultColorMode.
func NormalizeColorMode(mode string) string {
	if IsValidColorMode(mode) {
		return mode
	}
	return DefaultColorMode
}

// ValidateThemePreset validates that the given preset is valid.
func ValidateThemePreset(preset string) error {
	if !IsValidThemePreset(preset) {
		return ErrInvalidThemePreset
	}
	return nil
}

// ValidateColorMode validates that the given mode is valid.
func ValidateColorMode(mode string) error {
	if !IsValidColorMode(mode) {
		return ErrInvalidColorMode
	}
	return nil
}

type User struct {
	ID             uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	Username       string     `gorm:"size:64;uniqueIndex;not null" json:"username"`
	Email          string     `gorm:"size:255;uniqueIndex" json:"email"`
	HashedPassword string     `gorm:"size:255;not null" json:"-"`
	IsActive       bool       `gorm:"default:true;not null" json:"is_active"`
	IsAdmin        bool       `gorm:"default:false;not null" json:"is_admin"`
	ThemePreset    string     `gorm:"size:32;default:'graphite-mono';not null" json:"theme_preset"`
	ColorMode      string     `gorm:"size:16;default:'dark';not null" json:"color_mode"`
	CreatedAt      time.Time  `gorm:"autoCreateTime;not null" json:"created_at"`
	LastLogin      *time.Time `json:"last_login"`
}

// TableName overrides the table name used by User to `users`
func (User) TableName() string {
	return "users"
}
