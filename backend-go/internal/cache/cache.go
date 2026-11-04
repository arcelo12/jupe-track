package cache

import (
	"strings"
	"sync"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/metrics"
)

// Define basic metric structures for the cache
type BGPPeer struct {
	PeerAddress        string `json:"peer_address"`
	PeerAS             string `json:"peer_as"`
	State              string `json:"state"`
	Description        string `json:"description"`
	Uptime             string `json:"uptime"`
	ActivePrefixes     int    `json:"active_prefixes"`
	ReceivedPrefixes   int    `json:"received_prefixes"`
	AcceptedPrefixes   int    `json:"accepted_prefixes"`
	AdvertisedPrefixes int    `json:"advertised_prefixes"`
	Afi                string `json:"afi"`
	RouterId           string `json:"router_id"`
}

type InterfaceStat struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IfIndex     string `json:"if_index"`
	Type        string `json:"type"`
	AdminStatus string `json:"admin_status"`
	OperStatus  string `json:"oper_status"`
	BpsIn       int64  `json:"bps_in"`
	BpsOut      int64  `json:"bps_out"`
}

type DeviceStatus struct {
	CPUUsage          float64 `json:"cpu_usage"`
	CPUIdle           float64 `json:"cpu_idle"`
	MemoryUtilization float64 `json:"memory_utilization"`
	RETemperature     float64 `json:"re_temperature"`
	UptimeSeconds     int64   `json:"uptime_seconds"`
	HWModel           string  `json:"hw_model"`
}

type StateCache struct {
	mu            sync.RWMutex
	bgpPeers      map[string][]BGPPeer
	interfaces    []InterfaceStat
	deviceStatus  *DeviceStatus
	firewall      map[string][]FirewallFilter
	policerLimits map[string][]PolicerLimitInfo
}

// Global cache instance
var GlobalCache = &StateCache{
	bgpPeers:   make(map[string][]BGPPeer),
	interfaces: make([]InterfaceStat, 0),
}

// Setters
func (c *StateCache) SetBGP(system string, peers []BGPPeer) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.bgpPeers == nil {
		c.bgpPeers = make(map[string][]BGPPeer)
	}
	if system == "" {
		system = "global"
	}
	c.bgpPeers[system] = peers
}

func (c *StateCache) SetInterfaces(ifaces []InterfaceStat) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.interfaces = ifaces
}

// Getters
func (c *StateCache) GetBGP(system string) []BGPPeer {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if system == "" {
		system = "global"
	}

	// Track cache hits/misses for BGP
	metrics.SetCacheMetrics(len(c.bgpPeers), len(c.interfaces), 0)

	if c.bgpPeers == nil || c.bgpPeers[system] == nil {
		metrics.IncrementCacheMisses()
		return []BGPPeer{}
	}

	metrics.IncrementCacheHits()
	peers := make([]BGPPeer, len(c.bgpPeers[system]))
	copy(peers, c.bgpPeers[system])
	return peers
}

// Systems returns every logical system currently held in the BGP cache.
func (c *StateCache) Systems() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	systems := make([]string, 0, len(c.bgpPeers))
	for system := range c.bgpPeers {
		systems = append(systems, system)
	}
	return systems
}

func (c *StateCache) GetInterfaces() []InterfaceStat {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Track cache hits/misses for interfaces
	metrics.SetCacheMetrics(len(c.bgpPeers), len(c.interfaces), 0)

	if len(c.interfaces) == 0 {
		metrics.IncrementCacheMisses()
		return []InterfaceStat{}
	}

	metrics.IncrementCacheHits()
	ifaces := make([]InterfaceStat, len(c.interfaces))
	copy(ifaces, c.interfaces)
	return ifaces
}

func (c *StateCache) SetDeviceStatus(status *DeviceStatus) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.deviceStatus = status
}

func (c *StateCache) GetDeviceStatus() *DeviceStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.deviceStatus
}

// FirewallCounter is a single counter entry of a firewall filter term.
type FirewallCounter struct {
	Name    string `json:"name"`
	Bytes   uint64 `json:"bytes"`
	Packets uint64 `json:"packets"`
}

// FirewallPolicer is a single policer entry with drop statistics.
type FirewallPolicer struct {
	Name           string `json:"name"`
	BytesDropped   uint64 `json:"bytes_dropped"`
	PacketsDropped uint64 `json:"packets_dropped"`
}

// FirewallFilter is a snapshot of one firewall filter with its counters and policers.
type FirewallFilter struct {
	Name          string            `json:"name"`
	LogicalSystem string            `json:"logical_system"`
	Counters      []FirewallCounter `json:"counters"`
	Policers      []FirewallPolicer `json:"policers"`
	Timestamp     time.Time         `json:"timestamp"`
}

// SetFirewall stores the latest firewall filter snapshot per logical system.
func (c *StateCache) SetFirewall(system string, filters []FirewallFilter) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.firewall == nil {
		c.firewall = make(map[string][]FirewallFilter)
	}
	if system == "" {
		system = "global"
	}
	c.firewall[system] = filters
}

// GetFirewall returns the latest firewall snapshot for a logical system.
func (c *StateCache) GetFirewall(system string) []FirewallFilter {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if system == "" {
		system = "global"
	}
	filters := c.firewall[system]
	out := make([]FirewallFilter, len(filters))
	copy(out, filters)
	return out
}

// PolicerLimitInfo carries the configured bandwidth limit of a policer.
type PolicerLimitInfo struct {
	Name         string `json:"name"`
	BandwidthBps uint64 `json:"bandwidth_bps"`
}

// SetPolicerLimits stores the policer bandwidth limits per logical system.
func (c *StateCache) SetPolicerLimits(system string, limits []PolicerLimitInfo) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.policerLimits == nil {
		c.policerLimits = make(map[string][]PolicerLimitInfo)
	}
	if system == "" {
		system = "global"
	}
	c.policerLimits[system] = limits
}

// GetPolicerLimits returns policer bandwidth limits for a logical system.
func (c *StateCache) GetPolicerLimits(system string) []PolicerLimitInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if system == "" {
		system = "global"
	}
	out := c.policerLimits[system]
	res := make([]PolicerLimitInfo, len(out))
	copy(res, out)
	return res
}

// GetPolicerLimit finds the configured bandwidth of one policer by name.
// Matched by exact name, or by suffix: filter-scoped policer names in the
// output are prefixed with the filter path (e.g. __EXCH/FILTER/POLICER),
// while config names are bare.
func (c *StateCache) GetPolicerLimit(system, name string) (uint64, bool) {
	for _, l := range c.GetPolicerLimits(system) {
		if l.Name == name {
			return l.BandwidthBps, true
		}
	}
	// suffix match: config "POLICER-X" matches live "__EXCH/FILTER/POLICER-X"
	for _, l := range c.GetPolicerLimits(system) {
		if strings.HasSuffix(name, "/"+l.Name) {
			return l.BandwidthBps, true
		}
	}
	return 0, false
}
