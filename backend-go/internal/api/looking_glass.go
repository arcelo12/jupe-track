package api

import (
	"encoding/xml"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/arcelo12/jupe-track/backend-go/internal/utils"
	"github.com/gin-gonic/gin"
)

type LookingGlassRequest struct {
	Command       string `json:"command" binding:"required"`
	Target        string `json:"target"`
	SourceAddress string `json:"source_address"`
	LogicalSystem string `json:"logical_system"`
	ResolvePtr    bool   `json:"resolve_ptr"`
	ResolveAsn    bool   `json:"resolve_asn"`

	// Route Lookup parameters
	Protocol    string `json:"protocol"`
	DetailLevel string `json:"detail_level"`
	BGPMode     string `json:"bgp_mode"`
	NeighborIP  string `json:"neighbor_ip"`
}

func RegisterLookingGlassRoutes(r *gin.RouterGroup) {
	lgGroup := r.Group("/")
	lgGroup.Use(AuthAnyMiddleware())

	lgGroup.POST("/looking-glass", RequireScope(ScopeExecLookingGlass), func(c *gin.Context) {
		var req LookingGlassRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request payload"})
			return
		}

		startTime := time.Now()
		var logs []string
		logs = append(logs, fmt.Sprintf("[%s] Request received: %s", time.Now().Format("15:04:05.000"), req.Command))

		var rpcXML string
		var result string
		var rawXML string

		lsStr := ""
		if req.LogicalSystem != "" && req.LogicalSystem != "global" {
			lsStr = fmt.Sprintf("<logical-system>%s</logical-system>", utils.EscapeXML(req.LogicalSystem))
		}

		// Connect and run native NETCONF RPC depending on command
		logs = append(logs, fmt.Sprintf("[%s] Connecting to device via NETCONF...", time.Now().Format("15:04:05.000")))

		switch req.Command {
		case "show_route":
			destStr := ""
			if req.Target != "" {
				destStr = fmt.Sprintf("<destination>%s</destination>", utils.EscapeXML(req.Target))
			}
			rpcXML = fmt.Sprintf("<get-route-information>%s%s</get-route-information>", destStr, lsStr)

			logs = append(logs, fmt.Sprintf("[%s] Sending RPC: get-route-information", time.Now().Format("15:04:05.000")))
			reply, err := junos.RunNetconfRPC(rpcXML)
			if err != nil {
				handleError(c, err, logs, startTime)
				return
			}
			rawXML = reply

			var resp struct {
				Tables []struct {
					TableName string `xml:"table-name"`
					Routes    []struct {
						Destination string `xml:"rt-destination"`
						Entries     []struct {
							ProtocolName string `xml:"protocol-name"`
							Preference   string `xml:"preference"`
							Age          string `xml:"age"`
							To           string `xml:"to"`
							NhTo         string `xml:"nh>to"`
							Via          string `xml:"via"`
						} `xml:"rt-entry"`
					} `xml:"rt"`
				} `xml:"route-information>route-table"`
			}
			if err := xml.Unmarshal([]byte(reply), &resp); err != nil {
				handleError(c, fmt.Errorf("failed to parse XML: %v", err), logs, startTime)
				return
			}

			var builder strings.Builder
			for _, table := range resp.Tables {
				builder.WriteString(fmt.Sprintf("\n%s\n", strings.Repeat("=", 60)))
				builder.WriteString(fmt.Sprintf("Routing Table: %s\n", table.TableName))
				builder.WriteString(fmt.Sprintf("%s\n", strings.Repeat("=", 60)))
				for _, route := range table.Routes {
					for _, entry := range route.Entries {
						builder.WriteString(fmt.Sprintf("  %-24s [%s/%s] age: %s\n", route.Destination, entry.ProtocolName, entry.Preference, entry.Age))
						nh := entry.To
						if nh == "" {
							nh = entry.NhTo
						}
						if nh != "" || entry.Via != "" {
							builder.WriteString(fmt.Sprintf("    > to %s via %s\n", nh, entry.Via))
						}
					}
				}
			}
			result = builder.String()
			if result == "" {
				result = "No routes found."
			}

		case "ping":
			if req.Target == "" {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Target required for ping"})
				return
			}
			srcStr := ""
			if req.SourceAddress != "" {
				srcStr = fmt.Sprintf("<source>%s</source>", utils.EscapeXML(req.SourceAddress))
			}
			rpcXML = fmt.Sprintf("<ping><host>%s</host><count>5</count><rapid/>%s%s</ping>", utils.EscapeXML(req.Target), srcStr, lsStr)

			logs = append(logs, fmt.Sprintf("[%s] Sending RPC: ping", time.Now().Format("15:04:05.000")))
			reply, err := junos.RunNetconfRPC(rpcXML)
			if err != nil {
				handleError(c, err, logs, startTime)
				return
			}
			rawXML = reply

			var resp struct {
				TargetIP       string `xml:"ping-results>target-ip"`
				ProbesSent     string `xml:"ping-results>probe-results-summary>probes-sent"`
				ProbesReceived string `xml:"ping-results>probe-results-summary>responses-received"`
				PacketLoss     string `xml:"ping-results>probe-results-summary>packet-loss"`
				RttMin         string `xml:"ping-results>probe-results-summary>rtt-minimum"`
				RttAvg         string `xml:"ping-results>probe-results-summary>rtt-average"`
				RttMax         string `xml:"ping-results>probe-results-summary>rtt-maximum"`
			}
			if err := xml.Unmarshal([]byte(reply), &resp); err != nil {
				handleError(c, fmt.Errorf("failed to parse XML: %v", err), logs, startTime)
				return
			}

			var lines []string
			lines = append(lines, fmt.Sprintf("PING %s (%s)", req.Target, resp.TargetIP))
			lines = append(lines, "")
			lines = append(lines, "--- ping statistics ---")
			sent := resp.ProbesSent
			if sent == "" {
				sent = "5"
			}
			lines = append(lines, fmt.Sprintf("%s packets transmitted, %s received, %s%% packet loss", sent, resp.ProbesReceived, resp.PacketLoss))
			if resp.RttMin != "" {
				lines = append(lines, fmt.Sprintf("rtt min/avg/max = %s/%s/%s ms", resp.RttMin, resp.RttAvg, resp.RttMax))
			}
			result = strings.Join(lines, "\n")

		case "traceroute":
			if req.Target == "" {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Target required for traceroute"})
				return
			}
			srcStr := ""
			if req.SourceAddress != "" {
				srcStr = fmt.Sprintf("<source>%s</source>", utils.EscapeXML(req.SourceAddress))
			}
			rpcXML = fmt.Sprintf("<traceroute><host>%s</host>%s%s</traceroute>", utils.EscapeXML(req.Target), srcStr, lsStr)

			logs = append(logs, fmt.Sprintf("[%s] Sending RPC: traceroute", time.Now().Format("15:04:05.000")))
			reply, err := junos.RunNetconfRPC(rpcXML)
			if err != nil {
				handleError(c, err, logs, startTime)
				return
			}
			rawXML = reply

			var resp struct {
				Hops []struct {
					TTL    string `xml:"ttl-value"`
					HopNum string `xml:"hop-number"`
					Probes []struct {
						HostName     string `xml:"host-name"`
						IPAddress    string `xml:"ip-address"`
						RTT          string `xml:"rtt"`
						ProbeFailure string `xml:"probe-failure"`
					} `xml:"probe-result"`
				} `xml:"traceroute-results>hop"`
			}
			if err := xml.Unmarshal([]byte(reply), &resp); err != nil {
				handleError(c, fmt.Errorf("failed to parse XML: %v", err), logs, startTime)
				return
			}

			var lines []string
			lines = append(lines, fmt.Sprintf("traceroute to %s", req.Target))
			for _, hop := range resp.Hops {
				ttl := hop.TTL
				if ttl == "" {
					ttl = hop.HopNum
				}
				ttl = strings.TrimSpace(ttl)

				if len(hop.Probes) == 0 {
					lines = append(lines, fmt.Sprintf("%2s  * * *", ttl))
					continue
				}

				hostName := "* * *"
				ipAddr := ""
				for _, p := range hop.Probes {
					if p.HostName != "" || p.IPAddress != "" {
						hostName = strings.TrimSpace(p.HostName)
						if hostName == "" {
							hostName = strings.TrimSpace(p.IPAddress)
						}
						ipAddr = strings.TrimSpace(p.IPAddress)
						if ipAddr == "" {
							ipAddr = hostName
						}
						break
					}
				}

				prefix := ""
				if hostName != ipAddr && ipAddr != "" {
					prefix = fmt.Sprintf("%2s  %s (%s)", ttl, hostName, ipAddr)
				} else {
					prefix = fmt.Sprintf("%2s  %s", ttl, hostName)
				}

				var rtts []string
				for _, p := range hop.Probes {
					if p.RTT != "" {
						rttUs, _ := strconv.ParseFloat(strings.TrimSpace(p.RTT), 64)
						rtts = append(rtts, fmt.Sprintf("%.3f ms", rttUs/1000.0))
					} else {
						rtts = append(rtts, "*")
					}
				}
				lines = append(lines, fmt.Sprintf("%s  %s", prefix, strings.Join(rtts, "  ")))
			}
			result = strings.Join(lines, "\n")

		case "show_bgp_neighbor":
			neighborStr := ""
			if req.Target != "" {
				neighborStr = fmt.Sprintf("<neighbor-address>%s</neighbor-address>", utils.EscapeXML(req.Target))
			}
			rpcXML = fmt.Sprintf("<get-bgp-neighbor-information>%s%s</get-bgp-neighbor-information>", neighborStr, lsStr)

			logs = append(logs, fmt.Sprintf("[%s] Sending RPC: get-bgp-neighbor-information", time.Now().Format("15:04:05.000")))
			reply, err := junos.RunNetconfRPC(rpcXML)
			if err != nil {
				handleError(c, err, logs, startTime)
				return
			}
			rawXML = reply

			// Junos <get-bgp-neighbor-information> returns <bgp-information><bgp-peer>
			type BgpPeer struct {
				PeerAddress  string `xml:"peer-address"`
				PeerAS       string `xml:"peer-as"`
				PeerState    string `xml:"peer-state"`
				Description  string `xml:"description"`
				ElapsedTime  string `xml:"elapsed-time"`
				FlapCount    string `xml:"flap-count"`
				LocalAddress string `xml:"local-address"`
				PeerFlags    string `xml:"peer-flags"`
				LastState    string `xml:"last-state"`
				LastEvent    string `xml:"last-event"`
				Ribs         []struct {
					Name       string `xml:"name"`
					Active     string `xml:"active-prefix-count"`
					Received   string `xml:"received-prefix-count"`
					Accepted   string `xml:"accepted-prefix-count"`
					Advertised string `xml:"advertised-prefix-count"`
				} `xml:"bgp-rib"`
			}
			var resp struct {
				Peers []BgpPeer `xml:"bgp-peer"`
			}
			var respFallback struct {
				Peers []BgpPeer `xml:"bgp-information>bgp-peer"`
			}
			
			// Try both structures
			err = xml.Unmarshal([]byte(reply), &respFallback)
			if err == nil && len(respFallback.Peers) > 0 {
				resp.Peers = respFallback.Peers
			} else {
				// Strip root tags and unmarshal just the peers
				start := strings.Index(reply, "<bgp-peer")
				if start >= 0 {
					end := strings.LastIndex(reply, "</bgp-peer>")
					if end > start {
						wrapped := "<root>" + reply[start:end+11] + "</root>"
						xml.Unmarshal([]byte(wrapped), &resp)
					}
				}
			}

			var lines []string
			for _, peer := range resp.Peers {
				lines = append(lines, fmt.Sprintf("Peer: %s+179     AS %s     Local: %s+179", peer.PeerAddress, peer.PeerAS, peer.LocalAddress))
				if peer.Description != "" {
					lines = append(lines, fmt.Sprintf("  Description: %s", peer.Description))
				}
				lines = append(lines, fmt.Sprintf("  Type: External    State: %s    Flags: <%s>", peer.PeerState, peer.PeerFlags))
				lines = append(lines, fmt.Sprintf("  Last State: %s    Last Event: %s", peer.LastState, peer.LastEvent))
				lines = append(lines, fmt.Sprintf("  Uptime: %s    Flap Count: %s", peer.ElapsedTime, peer.FlapCount))
				for _, rib := range peer.Ribs {
					lines = append(lines, fmt.Sprintf("  Table %s:", rib.Name))
					
					adv := rib.Advertised
					if adv == "" { adv = "0" }
					lines = append(lines, fmt.Sprintf("    Active prefixes: %s   Received: %s   Accepted: %s   Advertised: %s", rib.Active, rib.Received, rib.Accepted, adv))
				}
				lines = append(lines, "")
			}
			result = strings.Join(lines, "\n")
			if result == "" {
				result = "No BGP neighbors found."
			}

		case "show_bgp_summary":
			rpcXML = fmt.Sprintf("<get-bgp-summary-information>%s</get-bgp-summary-information>", lsStr)

			logs = append(logs, fmt.Sprintf("[%s] Sending RPC: get-bgp-summary-information", time.Now().Format("15:04:05.000")))
			reply, err := junos.RunNetconfRPC(rpcXML)
			if err != nil {
				handleError(c, err, logs, startTime)
				return
			}
			rawXML = reply

			var resp struct {
				Peers []struct {
					PeerAddress    string `xml:"peer-address"`
					PeerAS         string `xml:"peer-as"`
					PeerState      string `xml:"peer-state"`
					InputMessages  string `xml:"input-messages"`
					OutputMessages string `xml:"output-messages"`
					Active         string `xml:"bgp-rib>active-prefix-count"`
					Received       string `xml:"bgp-rib>received-prefix-count"`
					Accepted       string `xml:"bgp-rib>accepted-prefix-count"`
				} `xml:"bgp-information>bgp-peer"`
			}
			if err := xml.Unmarshal([]byte(reply), &resp); err != nil {
				handleError(c, fmt.Errorf("failed to parse XML: %v", err), logs, startTime)
				return
			}

			var lines []string
			lines = append(lines, fmt.Sprintf("%-24s %8s %10s %10s %14s %20s", "Peer", "AS", "InPkt", "OutPkt", "State", "Active/Rcvd/Acc"))
			lines = append(lines, strings.Repeat("-", 90))
			for _, p := range resp.Peers {
				active := p.Active
				if active == "" {
					active = "0"
				}
				recv := p.Received
				if recv == "" {
					recv = "0"
				}
				acc := p.Accepted
				if acc == "" {
					acc = "0"
				}
				pfxInfo := fmt.Sprintf("%s/%s/%s", active, recv, acc)
				lines = append(lines, fmt.Sprintf("%-24s %8s %10s %10s %14s %20s", p.PeerAddress, p.PeerAS, p.InputMessages, p.OutputMessages, p.PeerState, pfxInfo))
			}
			result = strings.Join(lines, "\n")

		case "show_interfaces":
			ifaceStr := ""
			if req.Target != "" {
				ifaceStr = fmt.Sprintf("<interface-name>%s</interface-name>", utils.EscapeXML(req.Target))
			}
			rpcXML = fmt.Sprintf("<get-interface-information><terse/>%s</get-interface-information>", ifaceStr)

			logs = append(logs, fmt.Sprintf("[%s] Sending RPC: get-interface-information terse", time.Now().Format("15:04:05.000")))
			reply, err := junos.RunNetconfRPC(rpcXML)
			if err != nil {
				handleError(c, err, logs, startTime)
				return
			}
			rawXML = reply

			type TerseInterfaceXML struct {
				Name        string `xml:"name"`
				AdminStatus string `xml:"admin-status"`
				OperStatus  string `xml:"oper-status"`
				Families    []struct {
					FamilyName string `xml:"address-family-name"`
					Local      string `xml:"interface-address>ifa-local"`
				} `xml:"address-family"`
			}

			var resp struct {
				Interfaces []struct {
					Name        string `xml:"name"`
					AdminStatus string `xml:"admin-status"`
					OperStatus  string `xml:"oper-status"`
					Families    []struct {
						FamilyName string `xml:"address-family-name"`
						Local      string `xml:"interface-address>ifa-local"`
					} `xml:"address-family"`
					Logicals []TerseInterfaceXML `xml:"logical-interface"`
				} `xml:"interface-information>physical-interface"`
			}

			if err := xml.Unmarshal([]byte(reply), &resp); err != nil {
				handleError(c, fmt.Errorf("failed to parse XML: %v", err), logs, startTime)
				return
			}

			var lines []string
			lines = append(lines, fmt.Sprintf("%-24s %8s %8s %8s %20s", "Interface", "Admin", "Link", "Proto", "Local"))
			lines = append(lines, strings.Repeat("-", 72))

			for _, i := range resp.Interfaces {
				if len(i.Families) > 0 {
					for _, f := range i.Families {
						lines = append(lines, fmt.Sprintf("%-24s %8s %8s %8s %20s", i.Name, i.AdminStatus, i.OperStatus, f.FamilyName, f.Local))
					}
				} else {
					lines = append(lines, fmt.Sprintf("%-24s %8s %8s", i.Name, i.AdminStatus, i.OperStatus))
				}

				for _, l := range i.Logicals {
					if len(l.Families) > 0 {
						for _, f := range l.Families {
							lines = append(lines, fmt.Sprintf("%-24s %8s %8s %8s %20s", l.Name, l.AdminStatus, l.OperStatus, f.FamilyName, f.Local))
						}
					} else {
						lines = append(lines, fmt.Sprintf("%-24s %8s %8s", l.Name, l.AdminStatus, l.OperStatus))
					}
				}
			}
			result = strings.Join(lines, "\n")

		case "route_lookup":
			var parts []string
			parts = append(parts, "show route")

			if req.BGPMode == "advertising" {
				ip, err := utils.SanitizeJunosInput(req.NeighborIP)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid neighbor IP"})
					return
				}
				parts = append(parts, "advertising-protocol bgp", ip)
			} else if req.BGPMode == "receive" {
				ip, err := utils.SanitizeJunosInput(req.NeighborIP)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid neighbor IP"})
					return
				}
				parts = append(parts, "receive-protocol bgp", ip)
			}

			if req.Target != "" {
				target, err := utils.SanitizeJunosInput(req.Target)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid target (allowed: alphanumeric, dot, colon, hyphen, underscore, slash)"})
					return
				}
				parts = append(parts, target)
			}

			if req.BGPMode != "advertising" && req.BGPMode != "receive" {
				if req.Protocol != "" && req.Protocol != "all" {
					proto, err := utils.SanitizeJunosInput(req.Protocol)
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid protocol"})
						return
					}
					parts = append(parts, "protocol", proto)
				}
				if req.DetailLevel != "" && req.DetailLevel != "brief" {
					detail, err := utils.SanitizeJunosInput(req.DetailLevel)
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid detail level"})
						return
					}
					parts = append(parts, detail)
				}
			}

			if req.LogicalSystem != "" && req.LogicalSystem != "global" {
				ls, err := utils.SanitizeJunosInput(req.LogicalSystem)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid logical system"})
					return
				}
				parts = append(parts, "logical-system", ls)
			}

			cliCmd := strings.Join(parts, " ")
			logs = append(logs, fmt.Sprintf("[%s] Executing SSH CLI command: %s", time.Now().Format("15:04:05.000"), cliCmd))

			out, err := junos.RunCLICommand(cliCmd)
			if err != nil {
				handleError(c, err, logs, startTime)
				return
			}
			result = out
			rawXML = out

		default:
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Command not allowed"})
			return
		}

		totalMs := time.Since(startTime).Milliseconds()
		logs = append(logs, fmt.Sprintf("[%s] ✓ Command executed successfully (%d bytes XML)", time.Now().Format("15:04:05.000"), len(rawXML)))

		// SA-020: only surface debug block to admins
		resp := gin.H{
			"success": true,
			"output":  result,
			"command": req.Command,
			"target":  req.Target,
		}
		if isAdmin, _ := c.Get("is_admin"); isAdmin == true {
			resp["debug"] = gin.H{
				"logs":              logs,
				"execution_time_ms": totalMs,
				"raw_xml_bytes":     len(rawXML),
				"raw_xml":           rawXML,
			}
		}
		c.JSON(http.StatusOK, resp)
	})
}

func handleError(c *gin.Context, err error, logs []string, startTime time.Time) {
	totalMs := time.Since(startTime).Milliseconds()
	logs = append(logs, fmt.Sprintf("[%s] Error: %v", time.Now().Format("15:04:05.000"), err))
	// SA-020: log detail server-side, return generic error to client
	log.Printf("[looking-glass] error: %v", err)
	resp := gin.H{
		"success": false,
		"error":   "internal error",
	}
	if isAdmin, _ := c.Get("is_admin"); isAdmin == true {
		resp["debug"] = gin.H{
			"logs":              logs,
			"execution_time_ms": totalMs,
		}
	}
	c.JSON(http.StatusInternalServerError, resp)
}
