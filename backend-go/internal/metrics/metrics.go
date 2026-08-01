package metrics

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// Scraper metrics
	scrapeDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Namespace: "jupetrack",
		Subsystem: "scraper",
		Name:      "scrape_duration_seconds",
		Help:      "Time spent scraping data from Juniper devices",
		Buckets:   prometheus.DefBuckets, // 0.005s to 32s
	})

	scrapeTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "jupetrack",
			Subsystem: "scraper",
			Name:      "scrape_total",
			Help:      "Total number of scrape operations by result",
		},
		[]string{"status"}, // success, error, timeout
	)

	bgpPeerCount = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: "jupetrack",
			Subsystem: "bgp",
			Name:      "peer_count",
			Help:      "Number of BGP peers per logical system",
		},
		[]string{"logical_system"},
	)

	interfaceCount = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: "jupetrack",
			Subsystem: "interfaces",
			Name:      "count",
			Help:      "Number of network interfaces tracked",
		},
		[]string{"logical_system"},
	)

	// Database metrics
	dbQueryDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: "jupetrack",
			Subsystem: "database",
			Name:      "query_duration_seconds",
			Help:      "Database query duration",
			Buckets:   []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1},
		},
		[]string{"operation"}, // select, insert, update, delete
	)

	dbConnections = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "jupetrack",
			Subsystem: "database",
			Name:      "connections",
			Help:      "Current number of active database connections",
		},
	)

	// API metrics
	apiRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: "jupetrack",
			Subsystem: "api",
			Name:      "request_duration_seconds",
			Help:      "HTTP request duration",
			Buckets:   prometheus.DefBuckets,
		},
		[]string{"endpoint", "method", "status"},
	)

	apiRequestTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "jupetrack",
			Subsystem: "api",
			Name:      "requests_total",
			Help:      "Total HTTP requests by endpoint",
		},
		[]string{"endpoint", "method"},
	)

	apiActiveRequests = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "jupetrack",
			Subsystem: "api",
			Name:      "active_requests",
			Help:      "Currently active HTTP requests",
		},
	)

	// Cache metrics
	cacheHits = promauto.NewCounter(
		prometheus.CounterOpts{
			Namespace: "jupetrack",
			Name:      "cache_hits_total",
			Help:      "Total cache hits",
		},
	)

	cacheMisses = promauto.NewCounter(
		prometheus.CounterOpts{
			Namespace: "jupetrack",
			Name:      "cache_misses_total",
			Help:      "Total cache misses",
		},
	)

	cacheSize = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: "jupetrack",
			Name:      "cache_size",
			Help:      "Current number of cached items by key type",
		},
		[]string{"key_type"}, // bgp_summary, interface_stat, settings
	)

	// User/Session metrics
	activeSessions = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "jupetrack",
			Name:      "active_sessions",
			Help:      "Currently active WebSocket/API sessions",
		},
	)

	systemUptime = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: "jupetrack",
			Name:      "system_uptime_seconds",
			Help:      "System uptime in seconds since start",
		},
		[]string{"component"}, // server, scraper
	)
)

// RecordScrapeDuration records the time taken for a scrape operation
func RecordScrapeDuration(duration float64) {
	scrapeDuration.Observe(duration)
}

// RecordScrapeResult records whether a scrape was successful or failed
func RecordScrapeResult(success bool) {
	status := "error"
	if success {
		status = "success"
	}
	scrapeTotal.WithLabelValues(status).Inc()
}

// UpdateBGPPeers updates BGP peer count metrics for a logical system
func UpdateBGPPeers(logicalSystem string, totalCount, establishedCount int) {
	bgpPeerCount.WithLabelValues(logicalSystem).Set(float64(totalCount))
	
	// You can add additional BGP state metrics here if needed
}

// UpdateInterfaceCount updates interface count metric
func UpdateInterfaceCount(logicalSystem string, count int) {
	interfaceCount.WithLabelValues(logicalSystem).Set(float64(count))
}

// RecordDBQuery records a database query duration
func RecordDBQuery(operation string, duration time.Duration) {
	dbQueryDuration.WithLabelValues(operation).Observe(duration.Seconds())
}

// SetDBConnections sets the current database connection count
func SetDBConnections(count int) {
	dbConnections.Set(float64(count))
}

// RecordAPIRequest records an API request's performance
func RecordAPIRequest(endpoint, method string, statusCode int, duration time.Duration) {
	apiRequestTotal.WithLabelValues(endpoint, method).Inc()
	
	status := "success"
	if statusCode >= 400 && statusCode < 500 {
		status = "client_error"
	} else if statusCode >= 500 {
		status = "server_error"
	}
	
	apiRequestDuration.WithLabelValues(endpoint, method, status).Observe(duration.Seconds())
}

// SetCacheMetrics sets current cache sizes
func SetCacheMetrics(bgpSize, ifaceSize, settingsSize int) {
	cacheSize.WithLabelValues("bgp_summary").Set(float64(bgpSize))
	cacheSize.WithLabelValues("interface_stat").Set(float64(ifaceSize))
	cacheSize.WithLabelValues("settings").Set(float64(settingsSize))
}

// IncrementCacheHits increments cache hit counter
func IncrementCacheHits() {
	cacheHits.Inc()
}

// IncrementCacheMisses increments cache miss counter
func IncrementCacheMisses() {
	cacheMisses.Inc()
}

// SetActiveSessions sets the current number of active sessions
func SetActiveSessions(count int) {
	activeSessions.Set(float64(count))
}

// SetUptime sets the system uptime gauge
func SetUptime(component string, uptime time.Duration) {
	systemUptime.WithLabelValues(component).Set(uptime.Seconds())
}
