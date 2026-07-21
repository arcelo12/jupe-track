package models

import (
	"strings"
	"time"
)

type APIKey struct {
	ID         uint       `gorm:"primaryKey;autoIncrement" json:"id"`
	Name       string     `gorm:"size:128;not null" json:"name"`
	Prefix     string     `gorm:"size:16;not null;uniqueIndex" json:"prefix"`
	KeyHash    string     `gorm:"size:64;not null;uniqueIndex" json:"-"`
	Scopes     string     `gorm:"type:text" json:"scopes"`
	IsActive   bool       `gorm:"default:true;not null" json:"is_active"`
	ExpiresAt  *time.Time `json:"expires_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
	CreatedBy  string     `gorm:"size:64" json:"created_by"`
	CreatedAt  time.Time  `gorm:"autoCreateTime;not null" json:"created_at"`
	UpdatedAt  time.Time  `gorm:"autoUpdateTime;not null" json:"updated_at"`
}

// TableName overrides the table name used by APIKey to `api_keys`
func (APIKey) TableName() string {
	return "api_keys"
}

// ScopeList returns the scopes as a slice, splitting the stored comma-separated value
func (k *APIKey) ScopeList() []string {
	if k.Scopes == "" {
		return []string{}
	}
	parts := strings.Split(k.Scopes, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// HasScope reports whether the key carries the given scope
func (k *APIKey) HasScope(scope string) bool {
	for _, s := range k.ScopeList() {
		if s == scope {
			return true
		}
	}
	return false
}
