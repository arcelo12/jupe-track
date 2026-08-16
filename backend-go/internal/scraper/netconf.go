package scraper

import (
	"encoding/xml"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/arcelo12/jupe-track/backend-go/internal/utils"
)

// Helper to determine if an interface is internal
func isInternalInterface(name string) bool {
	prefixes := []string{"fxp", "em", "lo", "pip", "gre", "ipip", "lsi", "mtun", "pimd", "pime", "tap", "dsc", "bme", "demux", "cbp", "jsrv"}
	for _, p := range prefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

// removeXMLNamespaces strips xmlns attributes to make Go xml.Unmarshal work reliably without namespace issues
func removeXMLNamespaces(xmlStr string) string {
	re := regexp.MustCompile(`\sxmlns(:[a-zA-Z0-9_-]+)?="[^"]*"`)
	return re.ReplaceAllString(xmlStr, "")
}

// FetchBGP fetches BGP summary from the Junos device via native NETCONF XML RPC
func FetchBGP(logicalSystem string) ([]cache.BGPPeer, error) {
	lsStr := ""
	if logicalSystem != "" && logicalSystem != "global" {
		// SA-002: sanitize + escape before interpolating into RPC XML
		sanitized, err := utils.SanitizeJunosInput(logicalSystem)
		if err != nil {
			return nil, fmt.Errorf("invalid logical_system: %v", err)
		}
		lsStr = fmt.Sprintf("<logical-system>%s</logical-system>", utils.EscapeXML(sanitized))
	}
	rpcXML := fmt.Sprintf("<get-bgp-summary-information>%s</get-bgp-summary-information>", lsStr)
	replyXML, err := junos.RunNetconfRPC(rpcXML)
	if err != nil {
		return nil, fmt.Errorf("BGP NETCONF RPC failed: %v", err)
	}

	replyXML = removeXMLNamespaces(replyXML)

	var resp struct {
		XMLName xml.Name `xml:"rpc-reply"`
		Peers   []struct {
			PeerAddress string `xml:"peer-address"`
			PeerAS      string `xml:"peer-as"`
			PeerState   string `xml:"peer-state"`
			ElapsedTime string `xml:"elapsed-time"`
			Description string `xml:"description"`
			PeerID      string `xml:"peer-id"`
			BgpRibs     []struct {
				Name               string `xml:"name"`
				ActivePrefixes     int    `xml:"active-prefix-count"`
				ReceivedPrefixes   int    `xml:"received-prefix-count"`
				AcceptedPrefixes   int    `xml:"accepted-prefix-count"`
				AdvertisedPrefixes int    `xml:"advertised-prefix-count"`
			} `xml:"bgp-rib"`
		} `xml:"bgp-information>bgp-peer"`
	}

	if err := xml.Unmarshal([]byte(replyXML), &resp); err != nil {
		log.Printf("Worker: BGP XML parse error: %v", err)
		return nil, fmt.Errorf("failed to parse BGP XML: %v", err)
	}

	var peers []cache.BGPPeer
	for _, p := range resp.Peers {
		state := strings.TrimSpace(p.PeerState)
		if state == "" {
			state = "Idle"
		}

		var active, recv, acc, adv int
		for _, rib := range p.BgpRibs {
			active += rib.ActivePrefixes
			recv += rib.ReceivedPrefixes
			acc += rib.AcceptedPrefixes
			adv += rib.AdvertisedPrefixes
		}

		peer := cache.BGPPeer{
			PeerAddress:        strings.TrimSpace(p.PeerAddress),
			RouterId:           strings.TrimSpace(p.PeerID),
			PeerAS:             strings.TrimSpace(p.PeerAS),
			State:              state,
			Description:        strings.TrimSpace(p.Description),
			Uptime:             strings.TrimSpace(p.ElapsedTime),
			ActivePrefixes:     active,
			ReceivedPrefixes:   recv,
			AcceptedPrefixes:   acc,
			AdvertisedPrefixes: adv,
			Afi:                "ipv4",
		}
		if strings.Contains(peer.PeerAddress, ":") {
			peer.Afi = "ipv6"
		}
		peers = append(peers, peer)
	}

	log.Printf("Worker: Fetched %d BGP peers via NETCONF", len(peers))
	return peers, nil
}

// FetchDeviceStatus fetches device routing engine status via native NETCONF XML RPC
func FetchDeviceStatus() (*cache.DeviceStatus, error) {
	rpcXML := `<get-route-engine-information/>`
	replyXML, err := junos.RunNetconfRPC(rpcXML)
	if err != nil {
		return nil, fmt.Errorf("RE NETCONF RPC failed: %v", err)
	}

	var resp struct {
		XMLName     xml.Name `xml:"rpc-reply"`
		RouteEngine []struct {
			Temperature       string `xml:"temperature"`
			CPUIdle           string `xml:"cpu-idle"`
			MemoryUtilization string `xml:"memory-buffer-utilization"`
			Uptime            string `xml:"up-time"`
		} `xml:"route-engine-information>route-engine"`
	}

	if err := xml.Unmarshal([]byte(replyXML), &resp); err != nil {
		// Log the raw XML for debugging if unmarshal fails
		log.Printf("RE XML Parse Error. Raw: %s", replyXML)
		return nil, fmt.Errorf("failed to parse RE XML: %v", err)
	}

	if len(resp.RouteEngine) == 0 {
		return nil, fmt.Errorf("no route engine data found")
	}

	re := resp.RouteEngine[0]

	// Helper to extract numbers from string that might contain other things (e.g. "35 degrees C")
	extractFloat := func(s string) float64 {
		s = strings.TrimSpace(s)
		if s == "" {
			return 0
		}
		// Try parsing directly
		if val, err := strconv.ParseFloat(s, 64); err == nil {
			return val
		}
		// If it has non-numeric characters, try to scan the first number
		var val float64
		fmt.Sscanf(s, "%f", &val)
		return val
	}

	cpuIdle := extractFloat(re.CPUIdle)

	status := &cache.DeviceStatus{
		CPUUsage:          100.0 - cpuIdle,
		CPUIdle:           cpuIdle,
		MemoryUtilization: extractFloat(re.MemoryUtilization),
		RETemperature:     extractFloat(re.Temperature),
		UptimeSeconds:     0,
		HWModel:           "MX204", // Hardcoded for now
	}

	// Simple parse for uptime string "X days, Y hours, Z minutes, W seconds"
	parts := strings.Split(re.Uptime, ",")
	var totalSeconds float64
	for _, p := range parts {
		p = strings.TrimSpace(p)
		var val float64
		var unit string
		fmt.Sscanf(p, "%f %s", &val, &unit)
		if strings.HasPrefix(unit, "day") {
			totalSeconds += val * 86400
		} else if strings.HasPrefix(unit, "hour") {
			totalSeconds += val * 3600
		} else if strings.HasPrefix(unit, "minute") {
			totalSeconds += val * 60
		} else if strings.HasPrefix(unit, "second") {
			totalSeconds += val
		}
	}
	status.UptimeSeconds = int64(totalSeconds)

	return status, nil
}

// FetchInterfaces fetches interface statistics from the Junos device via native NETCONF XML RPC
func FetchInterfaces() ([]cache.InterfaceStat, error) {
	rpcXML := `<get-interface-information><statistics/><detail/></get-interface-information>`
	replyXML, err := junos.RunNetconfRPC(rpcXML)
	if err != nil {
		return nil, fmt.Errorf("Interfaces NETCONF RPC failed: %v", err)
	}

	replyXML = removeXMLNamespaces(replyXML)

	var resp struct {
		XMLName    xml.Name `xml:"rpc-reply"`
		Interfaces []struct {
			Name        string `xml:"name"`
			Description string `xml:"description"`
			AdminStatus string `xml:"admin-status"`
			OperStatus  string `xml:"oper-status"`
			BpsIn       int64  `xml:"traffic-statistics>input-bps"`
			BpsOut      int64  `xml:"traffic-statistics>output-bps"`
			Logicals    []struct {
				Name        string `xml:"name"`
				Description string `xml:"description"`
				AdminStatus string `xml:"admin-status"`
				OperStatus  string `xml:"oper-status"`
				BpsIn       int64  `xml:"transit-traffic-statistics>input-bps"`
				BpsOut      int64  `xml:"transit-traffic-statistics>output-bps"`
			} `xml:"logical-interface"`
		} `xml:"interface-information>physical-interface"`
	}

	if err := xml.Unmarshal([]byte(replyXML), &resp); err != nil {
		log.Printf("Worker: Interfaces XML parse error: %v", err)
		return nil, fmt.Errorf("failed to parse Interfaces XML: %v", err)
	}

	var ifaces []cache.InterfaceStat
	for _, i := range resp.Interfaces {
		name := strings.TrimSpace(i.Name)

		// Only allow physical interfaces starting with 'ge', 'et' or 'xe'
		if !strings.HasPrefix(name, "ge") && !strings.HasPrefix(name, "et") && !strings.HasPrefix(name, "xe") {
			continue
		}

		iface := cache.InterfaceStat{
			Name:        name,
			Description: strings.TrimSpace(i.Description),
			AdminStatus: strings.TrimSpace(i.AdminStatus),
			OperStatus:  strings.TrimSpace(i.OperStatus),
			BpsIn:       i.BpsIn,
			BpsOut:      i.BpsOut,
			Type:        "physical",
		}
		ifaces = append(ifaces, iface)

		for _, li := range i.Logicals {
			liName := strings.TrimSpace(li.Name)
			liAdmin := strings.TrimSpace(li.AdminStatus)
			if liAdmin == "" {
				liAdmin = iface.AdminStatus
			}
			liOper := strings.TrimSpace(li.OperStatus)
			if liOper == "" {
				liOper = iface.OperStatus
			}

			logicalIface := cache.InterfaceStat{
				Name:        liName,
				Description: strings.TrimSpace(li.Description),
				AdminStatus: liAdmin,
				OperStatus:  liOper,
				BpsIn:       li.BpsIn,
				BpsOut:      li.BpsOut,
				Type:        "logical",
			}
			ifaces = append(ifaces, logicalIface)
		}
	}

	log.Printf("Worker: Fetched %d interfaces via NETCONF", len(ifaces))
	return ifaces, nil
}
