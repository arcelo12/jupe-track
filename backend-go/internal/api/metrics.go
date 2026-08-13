package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"github.com/gin-gonic/gin"
)

type InterfaceHistoryResponse struct {
	InterfaceName string  `json:"interface_name"`
	InterfaceType string  `json:"interface_type"`
	Points        []Point `json:"points"`
}

type Point struct {
	Timestamp string `json:"timestamp"`
	BpsIn     int64  `json:"bps_in"`
	BpsOut    int64  `json:"bps_out"`
}

type PromResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Values [][]interface{}   `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

func RegisterMetricsRoutes(r *gin.RouterGroup) {
	metrics := r.Group("/metrics")
	metrics.Use(AuthAnyMiddleware())

	tsdbURL := os.Getenv("TSDB_URL")
	if tsdbURL == "" {
		tsdbURL = "http://jupetrack_victoriametrics:8428"
	}

	// Single wildcard handler that routes internally
	metrics.Any("/*path", func(c *gin.Context) {
		path := c.Param("path")
		method := c.Request.Method

		// API-key clients (service accounts) are restricted to read-only,
		// scope-gated endpoints. Generic TSDB proxy below stays JWT-only.
		if c.GetString("auth_type") == "api_key" {
			scoped := map[string]string{
				"/status":             ScopeReadMetrics,
				"/interfaces/names":   ScopeReadMetrics,
				"/bgp/peers":          ScopeReadMetrics,
				"/device/status":      ScopeReadDevice,
				"/interfaces/history": ScopeReadMetrics,
			}
			scope, ok := scoped[path]
			if !ok || method != "GET" {
				c.JSON(http.StatusForbidden, gin.H{"error": "endpoint not available for api keys"})
				return
			}
			if !apiKeyHasScope(c, scope) {
				c.JSON(http.StatusForbidden, gin.H{"error": "insufficient scope"})
				return
			}
		}

		switch {
		// ── Retention settings (GET / PUT) ──────────────────────────────────
		case path == "/retention" && method == "GET":
			handleGetRetention(c)
			return
		case path == "/retention" && method == "PUT":
			// SA-004: admin-only
			isAdmin, _ := c.Get("is_admin")
			if isAdmin != true {
				c.JSON(http.StatusForbidden, gin.H{"error": "Admin privileges required"})
				return
			}
			handlePutRetention(c)
			return

		// ── Scraper status ──────────────────────────────────────────────────
		case path == "/status" && method == "GET":
			handleGetStatus(c)
			return

		// ── Available interface names ────────────────────────────────────────
		case path == "/interfaces/names" && method == "GET":
			handleGetInterfaceNames(c)
			return

		// ── Available BGP peers ──────────────────────────────────────────────
		case path == "/bgp/peers" && method == "GET":
			handleGetBGPPeers(c)
			return

		// ── Device status ───────────────────────────────────────────────────
		case path == "/device/status" && method == "GET":
			handleGetDeviceStatus(c)
			return

		// ── Interface history (TSDB proxy) ──────────────────────────────────
		case path == "/interfaces/history" && method == "GET":
			handleGetInterfaceHistory(c, tsdbURL)
			return

		// ── BGP prefix history (TSDB proxy) ─────────────────────────────────
		case path == "/bgp/history" && method == "GET":
			handleGetBGPHistory(c, tsdbURL)
			return
		}

		// ── Generic TSDB reverse proxy (SA-016) ─────────────────────────────
		normPath := strings.TrimPrefix(path, "/api/v1")

		// Allowlist only read endpoints; reject write/admin/delete paths
		allowed := false
		switch {
		case normPath == "/query" || normPath == "/query_range" || normPath == "/series" || normPath == "/labels":
			allowed = true
		case strings.HasPrefix(normPath, "/label/") && strings.HasSuffix(normPath, "/values"):
			allowed = true
		}
		if !allowed {
			c.JSON(http.StatusForbidden, gin.H{"error": "TSDB endpoint not allowed"})
			return
		}
		if method != http.MethodGet {
			c.JSON(http.StatusMethodNotAllowed, gin.H{"error": "Only GET allowed on TSDB proxy"})
			return
		}

		targetURL := tsdbURL + "/api/v1" + normPath

		reqURL, _ := url.Parse(targetURL)
		reqURL.RawQuery = c.Request.URL.RawQuery

		req, err := http.NewRequest(method, reqURL.String(), c.Request.Body)
		if err != nil {
			log.Printf("[metrics] failed to build TSDB request: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}

		// Strip Authorization and hop-by-hop headers before forwarding
		hopByHop := map[string]bool{
			"Connection":          true,
			"Keep-Alive":          true,
			"Proxy-Authenticate":  true,
			"Proxy-Authorization": true,
			"Te":                  true,
			"Trailers":            true,
			"Transfer-Encoding":   true,
			"Upgrade":             true,
			"Authorization":       true,
		}
		for k, v := range c.Request.Header {
			if hopByHop[http.CanonicalHeaderKey(k)] {
				continue
			}
			req.Header[k] = v
		}

		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "TSDB unreachable"})
			return
		}
		defer resp.Body.Close()

		for k, v := range resp.Header {
			c.Header(k, v[0])
		}
		c.Status(resp.StatusCode)
		io.Copy(c.Writer, resp.Body)
	})
}

// ── Handler functions ───────────────────────────────────────────────────────

func handleGetRetention(c *gin.Context) {
	var settings models.ScraperSettings
	if database.DB != nil {
		database.DB.First(&settings)
	}

	c.JSON(http.StatusOK, gin.H{
		"retention_days_interface": settings.RetentionDaysInterface,
		"retention_days_bgp":       settings.RetentionDaysBGP,
		"scrape_interval_seconds":  int(settings.ScrapeInterval.Seconds()),
		"scrape_enabled":           settings.BackgroundScrape,
		"enable_bgp":               settings.EnableBGP,
		"enable_interfaces":        settings.EnableInterfaces,
		"scrape_interface_targets": settings.ScrapeInterfaceTargets,
		"scrape_bgp_targets":       settings.ScrapeBGPTargets,
	})
}

func handlePutRetention(c *gin.Context) {
	var payload struct {
		RetentionDaysInterface int    `json:"retention_days_interface"`
		RetentionDaysBGP       int    `json:"retention_days_bgp"`
		ScrapeIntervalSeconds  int    `json:"scrape_interval_seconds"`
		ScrapeEnabled          bool   `json:"scrape_enabled"`
		EnableBGP              bool   `json:"enable_bgp"`
		EnableInterfaces       bool   `json:"enable_interfaces"`
		ScrapeInterfaceTargets string `json:"scrape_interface_targets"`
		ScrapeBGPTargets       string `json:"scrape_bgp_targets"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	if database.DB != nil {
		var existing models.ScraperSettings
		database.DB.First(&existing)

		existing.RetentionDaysInterface = payload.RetentionDaysInterface
		existing.RetentionDaysBGP = payload.RetentionDaysBGP
		existing.ScrapeInterval = time.Duration(payload.ScrapeIntervalSeconds) * time.Second
		existing.BackgroundScrape = payload.ScrapeEnabled
		existing.EnableBGP = payload.EnableBGP
		existing.EnableInterfaces = payload.EnableInterfaces
		existing.ScrapeInterfaceTargets = payload.ScrapeInterfaceTargets
		existing.ScrapeBGPTargets = payload.ScrapeBGPTargets

		if existing.ID != 0 {
			database.DB.Save(&existing)
		} else {
			database.DB.Create(&existing)
		}
		scraper.UpdateSettings(&existing)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Retention settings saved and scraper rescheduled!"})
}

func handleGetStatus(c *gin.Context) {
	var settings models.ScraperSettings
	if database.DB != nil {
		database.DB.First(&settings)
	}

	c.JSON(http.StatusOK, gin.H{
		"enabled":                 settings.BackgroundScrape,
		"last_scrape_interface":   settings.LastScrapeInterface,
		"last_scrape_bgp":         settings.LastScrapeBGP,
		"next_run":                nil,
		"total_interface_records": settings.TotalInterfaceRecords,
		"total_bgp_records":       settings.TotalBGPRecords,
	})
}

func handleGetInterfaceNames(c *gin.Context) {
	ifaces := cache.GlobalCache.GetInterfaces()
	names := []string{}
	for _, iface := range ifaces {
		if iface.Type == "physical" {
			names = append(names, iface.Name)
		}
	}
	c.JSON(http.StatusOK, names)
}

func handleGetBGPPeers(c *gin.Context) {
	systems := GetActiveLogicalSystems()
	peerSet := make(map[string]bool)
	for _, sys := range systems {
		peers := cache.GlobalCache.GetBGP(sys)
		for _, p := range peers {
			peerSet[p.PeerAddress] = true
		}
	}
	result := make([]string, 0, len(peerSet))
	for addr := range peerSet {
		result = append(result, addr)
	}
	c.JSON(http.StatusOK, result)
}

func handleGetDeviceStatus(c *gin.Context) {
	status := cache.GlobalCache.GetDeviceStatus()
	if status == nil {
		c.JSON(http.StatusOK, gin.H{
			"cpu_usage":          0,
			"memory_utilization": 0,
			"re_temperature":     0,
			"uptime_seconds":     0,
			"hw_model":           "MX204",
		})
		return
	}
	c.JSON(http.StatusOK, status)
}

func handleGetInterfaceHistory(c *gin.Context, tsdbURL string) {
	hours := c.DefaultQuery("hours", "24")
	ifaceName := c.DefaultQuery("interface_name", "")
	startParam := c.Query("start")
	endParam := c.Query("end")

	// SA-015: validate ifaceName against cached interface names to prevent PromQL injection
	if ifaceName != "" {
		valid := false
		for _, iface := range cache.GlobalCache.GetInterfaces() {
			if iface.Name == ifaceName {
				valid = true
				break
			}
		}
		if !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown interface_name"})
			return
		}
	}

	queryIn := `jupetrack_interface_bps_in`
	queryOut := `jupetrack_interface_bps_out`
	if ifaceName != "" {
		queryIn = `jupetrack_interface_bps_in{interface="` + ifaceName + `"}`
		queryOut = `jupetrack_interface_bps_out{interface="` + ifaceName + `"}`
	}

	var start, end, step string
	if startParam != "" && endParam != "" {
		start = startParam
		end = endParam
		// Parse dates to calculate a reasonable step (e.g., ~300 points max)
		startTime, err1 := time.Parse(time.RFC3339, startParam)
		endTime, err2 := time.Parse(time.RFC3339, endParam)
		if err1 == nil && err2 == nil {
			dur := endTime.Sub(startTime)
			stepSecs := int(dur.Seconds() / 300)
			if stepSecs < 60 {
				stepSecs = 60
			}
			step = fmt.Sprintf("%ds", stepSecs)
		} else {
			step = "5m" // Fallback
		}
	} else {
		step = calculateStep(hours)
		start = "now-" + hours + "h"
		end = "now"
	}

	// Helper to fetch from VM
	fetchProm := func(q string) (*PromResponse, error) {
		reqURL, _ := url.Parse(tsdbURL + "/api/v1/query_range")
		qry := reqURL.Query()
		qry.Set("query", q)
		qry.Set("start", start)
		qry.Set("end", end)
		qry.Set("step", step)
		reqURL.RawQuery = qry.Encode()

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Get(reqURL.String())
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		var pr PromResponse
		if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
			return nil, err
		}
		return &pr, nil
	}

	resIn, errIn := fetchProm(queryIn)
	resOut, errOut := fetchProm(queryOut)

	if errIn != nil || errOut != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch from TSDB"})
		return
	}

	// Merge results
	type pointData struct {
		In  int64
		Out int64
	}
	// interface -> timestamp -> pointData
	merged := make(map[string]map[int64]*pointData)
	ifaceTypes := make(map[string]string)

	for _, res := range resIn.Data.Result {
		iface := res.Metric["interface"]
		ifaceTypes[iface] = res.Metric["type"]
		if merged[iface] == nil {
			merged[iface] = make(map[int64]*pointData)
		}
		for _, v := range res.Values {
			if len(v) != 2 {
				continue
			}
			tsFloat, _ := v[0].(float64)
			ts := int64(tsFloat)

			valStr, _ := v[1].(string)
			var val int64
			fmt.Sscanf(valStr, "%d", &val)

			if merged[iface][ts] == nil {
				merged[iface][ts] = &pointData{}
			}
			merged[iface][ts].In = val
		}
	}

	for _, res := range resOut.Data.Result {
		iface := res.Metric["interface"]
		ifaceTypes[iface] = res.Metric["type"]
		if merged[iface] == nil {
			merged[iface] = make(map[int64]*pointData)
		}
		for _, v := range res.Values {
			if len(v) != 2 {
				continue
			}
			tsFloat, _ := v[0].(float64)
			ts := int64(tsFloat)

			valStr, _ := v[1].(string)
			var val int64
			fmt.Sscanf(valStr, "%d", &val)

			if merged[iface][ts] == nil {
				merged[iface][ts] = &pointData{}
			}
			merged[iface][ts].Out = val
		}
	}

	var response []InterfaceHistoryResponse
	for iface, pts := range merged {
		var points []Point
		for ts, data := range pts {
			// Convert timestamp to ISO8601 string (UTC)
			t := time.Unix(ts, 0).UTC()
			points = append(points, Point{
				Timestamp: t.Format("2006-01-02T15:04:05Z"),
				BpsIn:     data.In,
				BpsOut:    data.Out,
			})
		}
		// Sort points by time
		// We could sort using a slice but maps are unordered
		// so let's just sort the slice now
		// Actually time format strings are sortable alphabetically
		// but let's leave it as is or sort it if needed.
		// It's better to sort:

		response = append(response, InterfaceHistoryResponse{
			InterfaceName: iface,
			InterfaceType: ifaceTypes[iface],
			Points:        points,
		})
	}

	// We need to sort the points for each interface
	for i := range response {
		pts := response[i].Points
		for j := 0; j < len(pts)-1; j++ {
			for k := j + 1; k < len(pts); k++ {
				if pts[j].Timestamp > pts[k].Timestamp {
					pts[j], pts[k] = pts[k], pts[j]
				}
			}
		}
	}

	c.JSON(http.StatusOK, response)
}

func handleGetBGPHistory(c *gin.Context, tsdbURL string) {
	peer := c.Query("peer")
	if peer == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "peer is required"})
		return
	}
	if net.ParseIP(peer) == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "peer harus alamat IP yang valid"})
		return
	}

	activeSystems := make(map[string]bool)
	for _, sys := range GetActiveLogicalSystems() {
		activeSystems[sys] = true
	}
	for _, sys := range cache.GlobalCache.Systems() {
		activeSystems[sys] = true
	}
	valid := false
	for sys := range activeSystems {
		for _, cachedPeer := range cache.GlobalCache.GetBGP(sys) {
			if cachedPeer.PeerAddress == peer {
				valid = true
				break
			}
		}
		if valid {
			break
		}
	}
	if !valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown peer"})
		return
	}

	hours := c.DefaultQuery("hours", "1")
	start := "now-" + hours + "h"
	step := calculateStep(hours)

	fetch := func(metric string) (*PromResponse, error) {
		reqURL, _ := url.Parse(tsdbURL + "/api/v1/query_range")
		query := reqURL.Query()
		query.Set("query", metric+`{peer="`+peer+`"}`)
		query.Set("start", start)
		query.Set("end", "now")
		query.Set("step", step)
		reqURL.RawQuery = query.Encode()

		resp, err := (&http.Client{Timeout: 10 * time.Second}).Get(reqURL.String())
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		var result PromResponse
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return nil, err
		}
		return &result, nil
	}

	active, activeErr := fetch("jupetrack_bgp_active_prefixes")
	received, receivedErr := fetch("jupetrack_bgp_received_prefixes")
	if activeErr != nil || receivedErr != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "TSDB unreachable"})
		return
	}

	type prefixPoint struct {
		Timestamp        string `json:"timestamp"`
		State            string `json:"state"`
		ActivePrefixes   int64  `json:"active_prefixes"`
		ReceivedPrefixes int64  `json:"received_prefixes"`
	}
	points := make(map[int64]*prefixPoint)
	merge := func(response *PromResponse, activeMetric bool) {
		for _, series := range response.Data.Result {
			for _, value := range series.Values {
				if len(value) != 2 {
					continue
				}
				timestamp, ok := value[0].(float64)
				if !ok {
					continue
				}
				var count int64
				fmt.Sscanf(fmt.Sprint(value[1]), "%d", &count)
				key := int64(timestamp)
				if points[key] == nil {
					points[key] = &prefixPoint{Timestamp: time.Unix(key, 0).UTC().Format(time.RFC3339), State: "Established"}
				}
				if activeMetric {
					points[key].ActivePrefixes = count
				} else {
					points[key].ReceivedPrefixes = count
				}
			}
		}
	}
	merge(active, true)
	merge(received, false)

	result := make([]prefixPoint, 0, len(points))
	for _, point := range points {
		result = append(result, *point)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Timestamp < result[j].Timestamp })
	c.JSON(http.StatusOK, result)
}

func calculateStep(hours string) string {
	switch hours {
	case "1":
		return "60s"
	case "6":
		return "5m"
	case "24":
		return "15m"
	case "48":
		return "30m"
	case "168":
		return "1h"
	default:
		return "15m"
	}
}
