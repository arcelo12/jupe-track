package models

import (
	"time"
)

type User struct {
	ID             uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Username       string    `gorm:"size:64;uniqueIndex;not null" json:"username"`
	Email          string    `gorm:"size:255;uniqueIndex" json:"email"`
	HashedPassword string    `gorm:"size:255;not null" json:"-"`
	IsActive       bool      `gorm:"default:true;not null" json:"is_active"`
	IsAdmin        bool      `gorm:"default:false;not null" json:"is_admin"`
	CreatedAt      time.Time `gorm:"autoCreateTime;not null" json:"created_at"`
	LastLogin      *time.Time `json:"last_login"`
}

// TableName overrides the table name used by User to `users`
func (User) TableName() string {
	return "users"
}
