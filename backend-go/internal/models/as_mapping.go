package models

import (
	"time"
)

type ASMapping struct {
	ASN       string    `gorm:"primaryKey" json:"asn"`
	Name      string    `json:"name"`
	Type      string    `json:"type"` // "Transit", "IX", "Customer", "Peer", etc.
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
