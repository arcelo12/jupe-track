package cache

import (
	"sync"
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
	if c.bgpPeers == nil {
		return []BGPPeer{}
	}
	peers, ok := c.bgpPeers[system]
	if !ok {
		return []BGPPeer{}
	}
	res := make([]BGPPeer, len(peers))
	copy(res, peers)
	return res
}

func (c *StateCache) GetInterfaces() []InterfaceStat {
	c.mu.RLock()
	defer c.mu.RUnlock()
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
