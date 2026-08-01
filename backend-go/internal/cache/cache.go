package cache

import (
	"sync"

	"github.com/arcelo12/jupe-track/backend-go/internal/metrics"
)

// Define basic metric structures for the cache
type BGPPeer struct {
	PeerAddress      string `json:"peer_address"`
	PeerAS           string `json:"peer_as"`
	State            string `json:"state"`
	Description      string `json:"description"`
	Uptime           string `json:"uptime"`
	ActivePrefixes   int    `json:"active_prefixes"`
	ReceivedPrefixes int    `json:"received_prefixes"`
	AcceptedPrefixes    int    `json:"accepted_prefixes"`
	AdvertisedPrefixes  int    `json:"advertised_prefixes"`
	Afi                 string `json:"afi"`
	RouterId            string `json:"router_id"`
}

type InterfaceStat struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"`
	AdminStatus string `json:"admin_status"`
	OperStatus  string `json:"oper_status"`
	BpsIn       int64  `json:"bps_in"`
	BpsOut      int64  `json:"bps_out"`
}

type DeviceStatus struct {
	CPUUsage           float64 `json:"cpu_usage"`
	CPUIdle            float64 `json:"cpu_idle"`
	MemoryUtilization  float64 `json:"memory_utilization"`
	RETemperature      float64 `json:"re_temperature"`
	UptimeSeconds      int64   `json:"uptime_seconds"`
	HWModel            string  `json:"hw_model"`
}

type StateCache struct {
	mu           sync.RWMutex
	bgpPeers     map[string][]BGPPeer
	interfaces   []InterfaceStat
	deviceStatus *DeviceStatus
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
