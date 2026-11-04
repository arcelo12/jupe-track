package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/gin-gonic/gin"
)

// getPolicerLimit resolves a policer bandwidth limit: try the requested
// logical system first, then the LS embedded in live names ("__EXCH/...").
func getPolicerLimit(sys, liveName string) (uint64, bool) {
	if bw, ok := cache.GlobalCache.GetPolicerLimit(sys, liveName); ok {
		return bw, true
	}
	if strings.HasPrefix(liveName, "__") {
		if i := strings.Index(liveName, "/"); i > 2 {
			ls := liveName[2:i]
			if ls != sys {
				return cache.GlobalCache.GetPolicerLimit(ls, liveName)
			}
		}
	}
	return 0, false
}

// RegisterFirewallRoutes exposes the QoS/firewall analytics endpoints.
func RegisterFirewallRoutes(r *gin.RouterGroup) {
	fw := r.Group("/firewall")
	fw.Use(AuthAnyMiddleware())

	// GET /api/v1/firewall/filters?logical_system=global|EXCH
	fw.GET("/filters", RequireScope(ScopeReadFirewall), func(c *gin.Context) {
		sys := c.DefaultQuery("logical_system", "global")
		filters := cache.GlobalCache.GetFirewall(sys)
		c.JSON(http.StatusOK, gin.H{
			"logical_system": sys,
			"filters":        filters,
			"count":          len(filters),
		})
	})

	// GET /api/v1/firewall/policers?logical_system=global
	// Live policer status with configured bandwidth limit when known.
	fw.GET("/policers", RequireScope(ScopeReadFirewall), func(c *gin.Context) {
		sys := c.DefaultQuery("logical_system", "global")
		type PolicerStatus struct {
			Filter         string `json:"filter"`
			Policer        string `json:"policer"`
			BytesDropped   uint64 `json:"bytes_dropped"`
			PacketsDropped uint64 `json:"packets_dropped"`
			IsDropping     bool   `json:"is_dropping"`
			BandwidthBps   uint64 `json:"bandwidth_bps,omitempty"`
			BandwidthHuman string `json:"bandwidth_human,omitempty"`
		}
		statuses := make([]PolicerStatus, 0)
		for _, f := range cache.GlobalCache.GetFirewall(sys) {
			for _, p := range f.Policers {
				ps := PolicerStatus{
					Filter:         f.Name,
					Policer:        p.Name,
					BytesDropped:   p.BytesDropped,
					PacketsDropped: p.PacketsDropped,
					IsDropping:     p.PacketsDropped > 0,
				}
				if bw, ok := getPolicerLimit(sys, p.Name); ok && bw > 0 {
					ps.BandwidthBps = bw
					ps.BandwidthHuman = humanBps(bw)
				}
				statuses = append(statuses, ps)
			}
		}
		c.JSON(http.StatusOK, gin.H{"logical_system": sys, "policers": statuses})
	})

	// GET /api/v1/firewall/traffic?logical_system=global&filter=X&counter=Y&hours=1
	// Returns a clean bps time-series for Recharts from VictoriaMetrics.
	fw.GET("/traffic", RequireScope(ScopeReadFirewall), func(c *gin.Context) {
		sys := c.DefaultQuery("logical_system", "global")
		filterName := c.Query("filter")
		term := c.Query("counter")
		if filterName == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "filter is required"})
			return
		}
		hours := 1.0
		if h := c.Query("hours"); h != "" {
			if v, err := strconv.ParseFloat(h, 64); err == nil && v > 0 && v <= 24*30 {
				hours = v
			}
		}

		tsdbURL := os.Getenv("TSDB_URL")
		if tsdbURL == "" {
			tsdbURL = "http://jupetrack_victoriametrics:8428"
		}

		// Live policer bandwidth limit when known, else fallback query param.
		var limitBps uint64
		if pName := c.Query("policer"); pName != "" {
			if bw, ok := getPolicerLimit(sys, pName); ok {
				limitBps = bw
			}
		}
		if limitBps == 0 {
			if v, err := strconv.ParseUint(c.Query("limit_bps"), 10, 64); err == nil {
				limitBps = v
			}
		}

		// rate() over counter -> bytes/s; *8 -> bits/s. 5m lookbehind keeps
		// the rate stable even with slow scrape intervals.
		query := fmt.Sprintf(
			`rate(jupetrack_firewall_counter_bytes_total{logical_system="%s",filter="%s",term="%s"}[5m]) * 8`,
			sanitizePromLabel(sys), sanitizePromLabel(filterName), sanitizePromLabel(term),
		)

		step := c.DefaultQuery("step", "60s")
		end := time.Now()
		start := end.Add(-time.Duration(hours * float64(time.Hour)))

		q := fmt.Sprintf("%s/api/v1/query_range", tsdbURL)
		params := url.Values{}
		params.Set("query", query)
		params.Set("start", strconv.FormatInt(start.Unix(), 10))
		params.Set("end", strconv.FormatInt(end.Unix(), 10))
		params.Set("step", step)
		body, err := promFetch(q + "?" + params.Encode())
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to query TSDB"})
			return
		}

		var pr PromResponse
		if err := json.Unmarshal(body, &pr); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "failed to parse TSDB response"})
			return
		}

		type TrafficPoint struct {
			Timestamp string  `json:"timestamp"`
			Bps       float64 `json:"bps"`
		}
		series := pr.Data.Result

		points := make([]TrafficPoint, 0)
		for _, s := range series {
			for _, v := range s.Values {
				tsF, _ := v[0].(float64)
				valStr, _ := v[1].(string)
				val, _ := strconv.ParseFloat(valStr, 64)
				points = append(points, TrafficPoint{
					Timestamp: time.Unix(int64(tsF), 0).UTC().Format("2006-01-02T15:04:05Z"),
					Bps:       val,
				})
			}
		}
		sort.Slice(points, func(i, j int) bool { return points[i].Timestamp < points[j].Timestamp })

		c.JSON(http.StatusOK, gin.H{
			"logical_system": sys,
			"filter":         filterName,
			"counter":        term,
			"limit_bps":      limitBps,
			"points":         points,
		})
	})
}

// humanBps formats bits per second for display ("1.0 Gbps", "100 Mbps").
func humanBps(bps uint64) string {
	switch {
	case bps >= 1_000_000_000:
		return fmt.Sprintf("%.1f Gbps", float64(bps)/1_000_000_000)
	case bps >= 1_000_000:
		return fmt.Sprintf("%.0f Mbps", float64(bps)/1_000_000)
	case bps >= 1_000:
		return fmt.Sprintf("%.0f kbps", float64(bps)/1_000)
	default:
		return fmt.Sprintf("%d bps", bps)
	}
}

// sanitizePromLabel escapes a value for use inside a PromQL label matcher.
func sanitizePromLabel(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		switch b := s[i]; b {
		case '\\', '"':
			out = append(out, '\\', b)
		case '\n':
			out = append(out, '\\', 'n')
		default:
			out = append(out, b)
		}
	}
	return string(out)
}

func promFetch(url string) ([]byte, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(tmp)
		buf = append(buf, tmp[:n]...)
		if err != nil {
			break
		}
	}
	return buf, nil
}
