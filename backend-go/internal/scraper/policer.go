package scraper

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/arcelo12/jupe-track/backend-go/internal/utils"
)

// PolicerLimit is the configured bandwidth limit of one policer, in bps.
// BandwidthPerPolicer mirrors firewall policer inheritance: logical-system
// policers live under configuration>logical-systems>firewall>policer.
type PolicerLimit struct {
	Name          string `json:"name"`
	LogicalSystem string `json:"logical_system"`
	BandwidthBps  uint64 `json:"bandwidth_bps"`
}

// FetchPolicerLimits reads every configured policer's bandwidth-limit.
// `show firewall policer` output does not include limits, so the
// configuration tree is queried via CLI `| display set` (compact, no XML
// nesting pitfalls) and parsed line by line.
func FetchPolicerLimits(logicalSystem string) ([]PolicerLimit, error) {
	if logicalSystem == "" {
		logicalSystem = "global"
	}
	sanitized, err := utils.SanitizeJunosInput(logicalSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid logical_system: %v", err)
	}

	cmd := "show configuration firewall policer | display set"
	if sanitized != "global" {
		cmd = fmt.Sprintf("show configuration logical-systems %s firewall policer | display set", sanitized)
	}
	out, err := junos.RunCLICommand(cmd)
	if err != nil {
		return nil, fmt.Errorf("policer config fetch failed: %v", err)
	}
	return parsePolicerSetOutput(out, sanitized), nil
}

// parsePolicerSetOutput parses lines like:
//
//	set firewall policer LIMIT-1G bandwidth-limit 1g
//	set firewall policer LIMIT-1G burst-size-limit 15k
//	set logical-systems EXCH firewall policer P1 bandwidth-limit 100m
//
// into PolicerLimit entries (bandwidth-limit only, converted to bps).
func parsePolicerSetOutput(out, logicalSystem string) []PolicerLimit {
	limits := make([]PolicerLimit, 0)
	seen := make(map[string]bool)

	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, "bandwidth-limit") {
			continue
		}
		fields := strings.Fields(line)
		// Skip logical-systems tree when parsing the global config: entries
		// there belong to a logical system, not the global instance.
		hasLS := false
		for _, f := range fields {
			if f == "logical-systems" {
				hasLS = true
				break
			}
		}
		if hasLS {
			continue
		}
		// locate "policer <name>" and "bandwidth-limit <value>"
		var name, value string
		for i, f := range fields {
			if f == "policer" && i+1 < len(fields) {
				name = fields[i+1]
			}
			if f == "bandwidth-limit" && i+1 < len(fields) {
				value = fields[i+1]
			}
		}
		if name == "" || value == "" {
			continue
		}
		key := logicalSystem + "/" + name
		if seen[key] {
			continue
		}
		seen[key] = true
		limits = append(limits, PolicerLimit{
			Name:          name,
			LogicalSystem: logicalSystem,
			BandwidthBps:  parseJunosBandwidth(value),
		})
	}
	return limits
}

// parseJunosBandwidth converts Junos bandwidth strings ("1g", "100m", "10k",
// "500000000") into bps. 0 when unparseable.
func parseJunosBandwidth(s string) uint64 {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return 0
	}
	mult := uint64(1)
	switch {
	case strings.HasSuffix(s, "g"):
		mult = 1_000_000_000
		s = strings.TrimSuffix(s, "g")
	case strings.HasSuffix(s, "m"):
		mult = 1_000_000
		s = strings.TrimSuffix(s, "m")
	case strings.HasSuffix(s, "k"):
		mult = 1_000
		s = strings.TrimSuffix(s, "k")
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return uint64(v * float64(mult))
}
