package scraper

import (
	"encoding/xml"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/arcelo12/jupe-track/backend-go/internal/utils"
)

// FetchFirewall collects firewall filter counters and policer drop stats.
// Uses the CLI (`show firewall`) over NETCONF: Junos rejects the native
// get-firewall-filter-information RPC without a filtername, so text output
// is the reliable path for a full listing (verified on MX204).
func FetchFirewall(logicalSystem string) ([]cache.FirewallFilter, error) {
	if logicalSystem == "" {
		logicalSystem = "global"
	}
	sanitized, err := utils.SanitizeJunosInput(logicalSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid logical_system: %v", err)
	}

	cmd := "show firewall"
	if sanitized != "global" {
		cmd = fmt.Sprintf("show firewall logical-system %s", sanitized)
	}
	out, err := junos.RunCLICommand(cmd)
	if err != nil {
		return nil, fmt.Errorf("firewall CLI fetch failed: %v", err)
	}
	return parseFirewallText(out, sanitized), nil
}

// lsToStr converts a CLI-style prefix into an RPC child element.
func lsToStr(prefix string) string {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		return ""
	}
	// "logical-system EXCH " -> "<logical-system>EXCH</logical-system>"
	parts := strings.Fields(prefix)
	if len(parts) >= 2 {
		return fmt.Sprintf("<logical-system>%s</logical-system>", parts[1])
	}
	return ""
}

// parseFirewallXML parses get-firewall-filter-information output.
func parseFirewallXML(reply, logicalSystem string) []cache.FirewallFilter {
	var resp struct {
		Filters []struct {
			Name     string `xml:"filter-name"`
			Counters []struct {
				Name    string `xml:"counter-name"`
				Bytes   string `xml:"byte-count"`
				Packets string `xml:"packet-count"`
			} `xml:"counter"`
			Policers []struct {
				Name    string `xml:"policer-name"`
				Bytes   string `xml:"byte-count"`
				Packets string `xml:"packet-count"`
			} `xml:"policer"`
		} `xml:"filter-information>filter"` // hierarchical on most releases
		FlatFilters []struct {
			Name     string `xml:"filter-name"`
			Counters []struct {
				Name    string `xml:"counter-name"`
				Bytes   string `xml:"byte-count"`
				Packets string `xml:"packet-count"`
			} `xml:"counter"`
			Policers []struct {
				Name    string `xml:"policer-name"`
				Bytes   string `xml:"byte-count"`
				Packets string `xml:"packet-count"`
			} `xml:"policer"`
		} `xml:"filter"` // flat on some releases
	}
	if err := xml.Unmarshal([]byte(reply), &resp); err != nil {
		log.Printf("Firewall XML parse error: %v", err)
		return nil
	}

	filters := make([]cache.FirewallFilter, 0)
	appendFilter := func(name string, cs []struct {
		Name    string `xml:"counter-name"`
		Bytes   string `xml:"byte-count"`
		Packets string `xml:"packet-count"`
	}, ps []struct {
		Name    string `xml:"policer-name"`
		Bytes   string `xml:"byte-count"`
		Packets string `xml:"packet-count"`
	}) {
		if strings.TrimSpace(name) == "" {
			return
		}
		f := cache.FirewallFilter{
			Name:          strings.TrimSpace(name),
			LogicalSystem: logicalSystem,
			Counters:      make([]cache.FirewallCounter, 0, len(cs)),
			Policers:      make([]cache.FirewallPolicer, 0, len(ps)),
			Timestamp:     time.Now(),
		}
		for _, c := range cs {
			f.Counters = append(f.Counters, cache.FirewallCounter{
				Name:    strings.TrimSpace(c.Name),
				Bytes:   parseJunosUint(c.Bytes),
				Packets: parseJunosUint(c.Packets),
			})
		}
		for _, p := range ps {
			f.Policers = append(f.Policers, cache.FirewallPolicer{
				Name:           strings.TrimSpace(p.Name),
				BytesDropped:   parseJunosUint(p.Bytes),
				PacketsDropped: parseJunosUint(p.Packets),
			})
		}
		filters = append(filters, f)
	}

	for _, fl := range resp.Filters {
		appendFilter(fl.Name, fl.Counters, fl.Policers)
	}
	for _, fl := range resp.FlatFilters {
		appendFilter(fl.Name, fl.Counters, fl.Policers)
	}
	return filters
}

var junosNumRe = regexp.MustCompile(`^[0-9,]+$`)

// parseJunosUint converts "1,234,567" or "1234567" into uint64; 0 when unparseable.
func parseJunosUint(s string) uint64 {
	s = strings.TrimSpace(s)
	if !junosNumRe.MatchString(s) {
		return 0
	}
	s = strings.ReplaceAll(s, ",", "")
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0
	}
	return v
}

// parseFirewallText parses `show firewall` CLI text output:
//
// Filter: LIMIT-1G-IN
// Counters:
//
//	Name                Bytes              Packets
//	NARA-DOWN      123456789012        1234567890
//
// Policers:
//
//	Name                Bytes              Packets
//	LIMIT-...-DOWN 1234567        1234
func parseFirewallText(out, logicalSystem string) []cache.FirewallFilter {
	filters := make([]cache.FirewallFilter, 0)
	var cur *cache.FirewallFilter
	section := "" // "counters" | "policers"

	flush := func() {
		if cur != nil && (len(cur.Counters) > 0 || len(cur.Policers) > 0) {
			filters = append(filters, *cur)
		}
		cur = nil
		section = ""
	}

	for _, line := range strings.Split(out, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "Filter:") {
			flush()
			cur = &cache.FirewallFilter{
				Name:          strings.TrimSpace(strings.TrimPrefix(trimmed, "Filter:")),
				LogicalSystem: logicalSystem,
				Timestamp:     time.Now(),
			}
			continue
		}
		if cur == nil {
			continue
		}
		switch strings.ToLower(trimmed) {
		case "counters:", "counters":
			section = "counters"
			continue
		case "policers:", "policers":
			section = "policers"
			continue
		}
		if section == "" {
			continue
		}
		// Skip header rows
		low := strings.ToLower(trimmed)
		if strings.HasPrefix(low, "name ") || trimmed == "Name Bytes Packets" {
			continue
		}
		fields := strings.Fields(trimmed)
		// Last two fields are numbers; the rest is the (possibly spaced) name.
		if len(fields) < 3 {
			continue
		}
		bytesV := parseJunosUint(fields[len(fields)-2])
		pktV := parseJunosUint(fields[len(fields)-1])
		name := strings.Join(fields[:len(fields)-2], " ")
		if bytesV == 0 && pktV == 0 && !junosNumRe.MatchString(fields[len(fields)-2]) {
			continue
		}
		if section == "counters" {
			cur.Counters = append(cur.Counters, cache.FirewallCounter{Name: name, Bytes: bytesV, Packets: pktV})
		} else {
			cur.Policers = append(cur.Policers, cache.FirewallPolicer{Name: name, BytesDropped: bytesV, PacketsDropped: pktV})
		}
	}
	flush()
	return filters
}
