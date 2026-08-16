package models

import (
	"gorm.io/gorm"
	"time"
)

type ScraperSettings struct {
	gorm.Model
	EnableBGP              bool          `json:"enable_bgp" gorm:"default:true"`
	EnableInterfaces       bool          `json:"enable_interfaces" gorm:"default:true"`
	ScrapeInterval         time.Duration `json:"scrape_interval" gorm:"default:30000000000"` // Default 30s
	BackgroundScrape       bool          `json:"background_scrape" gorm:"default:false"`     // Only scrape when web users are active
	RetentionDaysInterface int           `json:"retention_days_interface" gorm:"default:30"`
	RetentionDaysBGP       int           `json:"retention_days_bgp" gorm:"default:30"`
	ScrapeInterfaceTargets string        `json:"scrape_interface_targets" gorm:"default:''"`
	ScrapeBGPTargets       string        `json:"scrape_bgp_targets" gorm:"default:''"`
	LastScrapeInterface    *time.Time    `json:"last_scrape_interface"`
	LastScrapeBGP          *time.Time    `json:"last_scrape_bgp"`
	TotalInterfaceRecords  int64         `json:"total_interface_records" gorm:"default:0"`
	TotalBGPRecords        int64         `json:"total_bgp_records" gorm:"default:0"`
}
