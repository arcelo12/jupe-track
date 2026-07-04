package scraper

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"gorm.io/gorm"
)

// activeUsers tracks the number of active web sessions
var activeUsers int64

// mu protects worker state
var mu sync.Mutex
var workerRunning bool
var workerStop chan struct{}
var currentSettings *models.ScraperSettings

// Callbacks to break circular dependency with api package
var OnBGPUpdate func(string, []cache.BGPPeer)
var OnInterfaceUpdate func([]cache.InterfaceStat)
var GetActiveLogicalSystems func() []string

// RegisterActiveUser increments the active user count and starts scraping if needed
func RegisterActiveUser() {
	atomic.AddInt64(&activeUsers, 1)
	count := atomic.LoadInt64(&activeUsers)
	log.Printf("Worker: Active user connected (total: %d)", count)
	ensureWorkerRunning()
}

// UnregisterActiveUser decrements the active user count
func UnregisterActiveUser() {
	val := atomic.AddInt64(&activeUsers, -1)
	if val < 0 {
		atomic.StoreInt64(&activeUsers, 0)
	}
	count := atomic.LoadInt64(&activeUsers)
	log.Printf("Worker: Active user disconnected (total: %d)", count)
}

// GetActiveUserCount returns the current active user count
func GetActiveUserCount() int64 {
	return atomic.LoadInt64(&activeUsers)
}

func ensureWorkerRunning() {
	mu.Lock()
	defer mu.Unlock()
	if !workerRunning && currentSettings != nil {
		startWorkerLoop()
	}
}

var updateTickerChan = make(chan time.Duration, 1)

func startWorkerLoop() {
	workerRunning = true
	workerStop = make(chan struct{})
	settings := currentSettings

	log.Printf("Worker: Starting scrape loop (Interval: %v, Background: %v)", settings.ScrapeInterval, settings.BackgroundScrape)

	go func() {
		ticker := time.NewTicker(settings.ScrapeInterval)
		defer ticker.Stop()
		defer func() {
			mu.Lock()
			workerRunning = false
			mu.Unlock()
			log.Println("Worker: Scrape loop stopped")
		}()

		for {
			select {
			case <-workerStop:
				return
			case newInterval := <-updateTickerChan:
				if newInterval > 0 {
					ticker.Reset(newInterval)
					log.Printf("Worker: Scrape ticker reset to %v", newInterval)
				}
			case <-ticker.C:
				users := atomic.LoadInt64(&activeUsers)
				mu.Lock()
				bgScrape := currentSettings.BackgroundScrape
				enableBGP := currentSettings.EnableBGP
				enableInterfaces := currentSettings.EnableInterfaces
				mu.Unlock()

				// If BackgroundScrape is disabled and no active users, skip this cycle
				if !bgScrape && users == 0 {
					log.Println("Worker: No active users, skipping scrape cycle")
					continue
				}

				log.Println("Worker: Beginning unified scrape cycle...")

				var allBgpData []cache.BGPPeer
				var ifaceData []cache.InterfaceStat
				var err error

				systems := []string{"global"}
				if GetActiveLogicalSystems != nil {
					systems = GetActiveLogicalSystems()
				}

				for _, sys := range systems {
					bgpData, err := FetchBGP(sys)
					if err == nil {
						cache.GlobalCache.SetBGP(sys, bgpData)
						if OnBGPUpdate != nil {
							OnBGPUpdate(sys, bgpData)
						}
						allBgpData = append(allBgpData, bgpData...)
					} else {
						log.Printf("Worker: BGP fetch error for system %s: %v\n", sys, err)
					}
				}

				ifaceData, err = FetchInterfaces()
				if err == nil {
					cache.GlobalCache.SetInterfaces(ifaceData)
					if OnInterfaceUpdate != nil {
						OnInterfaceUpdate(ifaceData)
					}
				} else {
					log.Printf("Worker: Interface fetch error: %v\n", err)
				}

				// Fetch Device Status
				devStatus, err := FetchDeviceStatus()
				if err == nil {
					cache.GlobalCache.SetDeviceStatus(devStatus)
				} else {
					log.Printf("Worker: Device status fetch error: %v\n", err)
				}

				// Filter targets if specified
				targetIfaces := currentSettings.ScrapeInterfaceTargets
				targetBgp := currentSettings.ScrapeBGPTargets

				filteredBgpData := allBgpData
				if targetBgp != "" {
					allowed := make(map[string]bool)
					for _, t := range strings.Split(targetBgp, ",") {
						if t != "" {
							allowed[strings.TrimSpace(t)] = true
						}
					}
					filteredBgpData = nil
					for _, p := range allBgpData {
						if allowed[p.PeerAddress] {
							filteredBgpData = append(filteredBgpData, p)
						}
					}
				}

				filteredIfaceData := ifaceData
				if targetIfaces != "" {
					allowed := make(map[string]bool)
					for _, t := range strings.Split(targetIfaces, ",") {
						if t != "" {
							allowed[strings.TrimSpace(t)] = true
						}
					}
					filteredIfaceData = nil
					for _, i := range ifaceData {
						if allowed[i.Name] {
							filteredIfaceData = append(filteredIfaceData, i)
						}
					}
				}

				if !enableBGP {
					filteredBgpData = nil
				}
				if !enableInterfaces {
					filteredIfaceData = nil
				}

				// Push to TSDB (only if we scraped anything)
				if len(filteredBgpData) > 0 || len(filteredIfaceData) > 0 {
					PushToVictoriaMetrics(filteredBgpData, filteredIfaceData)
				}

				// Update last scrape timestamps in DB
				if database.DB != nil {
					now := time.Now()
					updates := make(map[string]interface{})
					if enableBGP && len(allBgpData) > 0 {
						updates["last_scrape_bgp"] = now
					}
					if len(filteredBgpData) > 0 {
						updates["total_bgp_records"] = gorm.Expr("total_bgp_records + ?", len(filteredBgpData))
					}
					if enableInterfaces && len(ifaceData) > 0 {
						updates["last_scrape_interface"] = now
					}
					if len(filteredIfaceData) > 0 {
						updates["total_interface_records"] = gorm.Expr("total_interface_records + ?", len(filteredIfaceData))
					}
					if len(updates) > 0 {
						database.DB.Model(&models.ScraperSettings{}).Where("1 = 1").Updates(updates)
					}
				}

				log.Println("Worker: Scrape cycle completed.")
			}
		}
	}()
}

// PushToVictoriaMetrics converts stats to Prometheus text format and POSTs to TSDB
func PushToVictoriaMetrics(bgp []cache.BGPPeer, ifaces []cache.InterfaceStat) {
	var buffer bytes.Buffer

	for _, p := range bgp {
		buffer.WriteString(fmt.Sprintf("jupetrack_bgp_active_prefixes{peer=\"%s\", as=\"%s\"} %d\n", p.PeerAddress, p.PeerAS, p.ActivePrefixes))
		buffer.WriteString(fmt.Sprintf("jupetrack_bgp_received_prefixes{peer=\"%s\", as=\"%s\"} %d\n", p.PeerAddress, p.PeerAS, p.ReceivedPrefixes))
	}

	for _, i := range ifaces {
		buffer.WriteString(fmt.Sprintf("jupetrack_interface_bps_in{interface=\"%s\", type=\"%s\"} %d\n", i.Name, i.Type, i.BpsIn))
		buffer.WriteString(fmt.Sprintf("jupetrack_interface_bps_out{interface=\"%s\", type=\"%s\"} %d\n", i.Name, i.Type, i.BpsOut))
	}

	if buffer.Len() == 0 {
		return
	}

	resp, err := http.Post("http://victoriametrics:8428/api/v1/import/prometheus", "text/plain", &buffer)
	if err != nil {
		log.Printf("Failed to push to TSDB: %v\n", err)
		return
	}
	defer resp.Body.Close()
}

// StartWorker initiates the background scraping loop
func StartWorker(settings *models.ScraperSettings) {
	mu.Lock()
	currentSettings = settings
	mu.Unlock()

	if settings.BackgroundScrape {
		// If background scrape is enabled, always run the worker
		log.Println("Worker: Background scraping enabled, starting immediately")
		mu.Lock()
		startWorkerLoop()
		mu.Unlock()
	} else {
		log.Println("Worker: On-demand scraping mode, waiting for active users")
	}
}

// UpdateSettings updates the running scraper settings dynamically
func UpdateSettings(newSettings *models.ScraperSettings) {
	mu.Lock()
	defer mu.Unlock()

	if currentSettings == nil {
		currentSettings = newSettings
		return
	}

	oldInterval := currentSettings.ScrapeInterval
	currentSettings = newSettings

	// If interval is 0, stop worker
	if newSettings.ScrapeInterval <= 0 {
		if workerRunning {
			close(workerStop)
			workerRunning = false
		}
		return
	}

	// If worker is not running, and we should run (background scrape or active users)
	if !workerRunning {
		users := atomic.LoadInt64(&activeUsers)
		if newSettings.BackgroundScrape || users > 0 {
			startWorkerLoop()
		}
		return
	}

	// If worker is running and interval changed, reset ticker
	if oldInterval != newSettings.ScrapeInterval {
		select {
		case updateTickerChan <- newSettings.ScrapeInterval:
		default:
		}
	}
}

// TriggerScrape runs a scrape cycle immediately in the background
func TriggerScrape() {
	go func() {
		mu.Lock()
		if currentSettings == nil {
			mu.Unlock()
			return
		}
		enableBGP := currentSettings.EnableBGP
		enableInterfaces := currentSettings.EnableInterfaces
		mu.Unlock()

		log.Println("Worker: Manual/on-demand scrape cycle triggered...")

		var allBgpData []cache.BGPPeer
		var ifaceData []cache.InterfaceStat
		var err error

		systems := []string{"global"}
		if GetActiveLogicalSystems != nil {
			systems = GetActiveLogicalSystems()
		}

		for _, sys := range systems {
			if enableBGP {
				bgpData, err := FetchBGP(sys)
				if err == nil {
					cache.GlobalCache.SetBGP(sys, bgpData)
					if OnBGPUpdate != nil {
						OnBGPUpdate(sys, bgpData)
					}
					allBgpData = append(allBgpData, bgpData...)
				} else {
					log.Printf("Worker: Manual BGP fetch error for system %s: %v\n", sys, err)
				}
			}
		}

		if enableInterfaces {
			ifaceData, err = FetchInterfaces()
			if err == nil {
				cache.GlobalCache.SetInterfaces(ifaceData)
				if OnInterfaceUpdate != nil {
					OnInterfaceUpdate(ifaceData)
				}
			} else {
				log.Printf("Worker: Manual Interface fetch error: %v\n", err)
			}
		}

		if (enableBGP && len(allBgpData) > 0) || (enableInterfaces && len(ifaceData) > 0) {
			PushToVictoriaMetrics(allBgpData, ifaceData)
		}

		log.Println("Worker: Manual scrape cycle completed.")
	}()
}
