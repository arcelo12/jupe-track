package scraper

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/arcelo12/jupe-track/backend-go/internal/utils"
)

// PolicerLimit is the configured bandwidth limit of one policer, in bps.
type PolicerLimit struct {
	Name          string `json:"name"`
	LogicalSystem string `json:"logical_system"`
	BandwidthBps  uint64 `json:"bandwidth_bps"`
}

// FetchPolicerLimits reads every configured policer's bandwidth-limit.
//
// Verified live on MX204 (Junos 22.2R3):
//   - `show configuration firewall policer | display xml` fails with
//     'syntax error' over NETCONF <command> (both set and xml variants).
//   - `show configuration [logical-systems LS] firewall` (plain braces,
//     no pipe) works and contains the full policer blocks.
//
// The braces output is parsed line by line; one command per logical system.
func FetchPolicerLimits(logicalSystem string) ([]PolicerLimit, error) {
	if logicalSystem == "" {
		logicalSystem = "global"
	}
	sanitized, err := utils.SanitizeJunosInput(logicalSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid logical_system: %v", err)
	}

	cmd := "show configuration firewall"
	if sanitized != "global" {
		cmd = fmt.Sprintf("show configuration logical-systems %s firewall", sanitized)
	}
	out, err := junos.RunCLICommand(cmd)
	if err != nil {
		return nil, fmt.Errorf("policer config fetch failed: %v", err)
	}
	return parsePolicerBraces(out, sanitized), nil
}

// parsePolicerBraces parses Junos braces-config output:
//
//	policer LIMIT-1G {
//	    if-exceeding {
//	        bandwidth-limit 900m;
//	        burst-size-limit 4m;
//	    }
//	    then discard;
//	}
//
// Tracks nesting depth so "bandwidth-limit" lines are only accepted inside
// a policer's if-exceeding block, and returns one entry per policer.
func parsePolicerBraces(out, logicalSystem string) []PolicerLimit {
	limits := make([]PolicerLimit, 0)

	var curName string
	inPolicer := false
	inIfExceeding := false
	depth := 0

	for _, raw := range strings.Split(out, "\n") {
		line := strings.TrimSpace(raw)
		line = strings.TrimSuffix(line, ";")

		switch {
		case strings.HasPrefix(line, "policer ") && strings.HasSuffix(line, "{"):
			curName = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(line, "policer "), "{"))
			inPolicer = true
			inIfExceeding = false
			depth = 1
			continue
		}

		if !inPolicer {
			continue
		}

		depth += strings.Count(line, "{") - strings.Count(line, "}")

		if strings.HasPrefix(line, "if-exceeding {") {
			inIfExceeding = true
			continue
		}
		if strings.HasPrefix(line, "bandwidth-limit ") && inIfExceeding {
			val := strings.TrimSpace(strings.TrimPrefix(line, "bandwidth-limit "))
			if curName != "" && val != "" {
				limits = append(limits, PolicerLimit{
					Name:          curName,
					LogicalSystem: logicalSystem,
					BandwidthBps:  parseJunosBandwidth(val),
				})
			}
			continue
		}

		// Depth reached 0: policer block closed.
		if depth <= 0 {
			inPolicer = false
			inIfExceeding = false
			curName = ""
		}
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
