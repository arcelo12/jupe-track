package scraper

import (
	"encoding/xml"
	"fmt"
	"log"
	"regexp"
	"strings"

	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/arcelo12/jupe-track/backend-go/internal/utils"
)

// FetchBGPPolicies gets BGP routing policies
func FetchBGPPolicies(logicalSystem string) (map[string]interface{}, error) {
	// Sanitize input to prevent Command/XML Injection
	logicalSystem, err := utils.SanitizeJunosInput(logicalSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid logical system name")
	}

	// 1. Fetch BGP Config
	cmdBGP := "show configuration protocols bgp | display xml"
	if logicalSystem != "global" && logicalSystem != "" {
		cmdBGP = fmt.Sprintf("show configuration logical-systems %s protocols bgp | display xml", logicalSystem)
	}

	outBGP, err := junos.RunCLICommand(cmdBGP)
	if err != nil {
		return nil, fmt.Errorf("failed to run CLI command for BGP config: %v", err)
	}

	// If it's a logical system, the XML path is configuration>logical-systems>protocols>bgp>group
	// So let's do a trick: we can use a wrapper or just replace `<logical-systems><name>...</name>` with empty
	// Actually, `show configuration logical-systems LS protocols bgp | display xml` outputs:
	// <rpc-reply><configuration><logical-systems><name>LS</name><protocols><bgp><group>...
	// To parse both easily, we can just use string replacement:
	// No, better to just have two structs or unmarshal dynamically.
	// Actually, `| display xml` might not output the parent tags if you query specifically!
	// But let's just make a generic struct.

	type Neighbor struct {
		Name    string   `xml:"name"`
		Imports []string `xml:"import"`
		Exports []string `xml:"export"`
	}
	type Group struct {
		Name      string     `xml:"name"`
		Imports   []string   `xml:"import"`
		Exports   []string   `xml:"export"`
		Neighbors []Neighbor `xml:"neighbor"`
	}

	var conf struct {
		Groups   []Group `xml:"configuration>protocols>bgp>group"`
		LSGroups []Group `xml:"configuration>logical-systems>protocols>bgp>group"`
	}

	if err := xml.Unmarshal([]byte(outBGP), &conf); err != nil {
		log.Printf("BGP XML parse error: %v", err)
	}

	groups := conf.Groups
	if len(conf.LSGroups) > 0 {
		groups = conf.LSGroups
	}

	policies := make(map[string]interface{})
	allPolicyNames := make(map[string]bool)

	for _, g := range groups {
		for _, n := range g.Neighbors {
			var imp []string
			var exp []string

			// Combine group and neighbor policies
			seen := make(map[string]bool)
			for _, p := range append(n.Imports, g.Imports...) {
				if !seen[p] {
					imp = append(imp, p)
					seen[p] = true
					allPolicyNames[p] = true
				}
			}
			seen = make(map[string]bool)
			for _, p := range append(n.Exports, g.Exports...) {
				if !seen[p] {
					exp = append(exp, p)
					seen[p] = true
					allPolicyNames[p] = true
				}
			}

			policies[n.Name] = map[string]interface{}{
				"peer_address":    n.Name,
				"import_policies": imp,
				"export_policies": exp,
				"policy_details":  map[string]interface{}{},
			}
		}
	}

	if len(allPolicyNames) == 0 {
		// Do not return early, we want to fetch all policies anyway
	}

	// 2. Fetch Policies using NETCONF `<get-configuration>` RPC
	rpcXML := "<get-configuration><configuration><policy-options/></configuration></get-configuration>"
	if logicalSystem != "global" && logicalSystem != "" {
		rpcXML = fmt.Sprintf("<get-configuration><configuration><logical-systems><name>%s</name><policy-options/></logical-systems></configuration></get-configuration>", logicalSystem)
	}

	outPol, err := junos.RunNetconfRPC(rpcXML)
	if err != nil {
		return nil, fmt.Errorf("failed to run NETCONF RPC for policy: %v", err)
	}

	// If no output or empty, just return what we have
	if strings.TrimSpace(outPol) == "" {
		return map[string]interface{}{
			"neighbors": policies,
			"policies":  make(map[string]map[string]interface{}),
		}, nil
	}

	type Term struct {
		Name      string `xml:"name"`
		TermInner string `xml:",innerxml"`
	}
	type PolicyStatement struct {
		Name  string `xml:"name"`
		Terms []Term `xml:"term"`
	}
	var pconf struct {
		GlobalPolicies []PolicyStatement `xml:"configuration>policy-options>policy-statement"`
		LSPolicies     []PolicyStatement `xml:"configuration>logical-systems>policy-options>policy-statement"`
	}

	if err := xml.Unmarshal([]byte(outPol), &pconf); err != nil {
		if err.Error() != "EOF" && !strings.Contains(err.Error(), "expected element type") {
			log.Printf("Policy XML parse error: %v", err)
		}
	}

	stmts := append(pconf.GlobalPolicies, pconf.LSPolicies...)

	parsedPolicies := make(map[string]map[string]interface{})
	for _, s := range stmts {
		var pterms []map[string]interface{}
		for _, t := range s.Terms {
			// Extract from the whole term inner XML because show policy flattens tags differently
			froms := extractFromTags(t.TermInner)
			thens := extractThenTags(t.TermInner)

			name := t.Name
			if name == "" {
				name = "unnamed"
			}
			pterms = append(pterms, map[string]interface{}{
				"term_name":       name,
				"from_conditions": froms,
				"then_actions":    thens,
			})
		}
		parsedPolicies[s.Name] = map[string]interface{}{
			"policy_name": s.Name,
			"terms":       pterms,
		}
	}

	// Attach details to peers
	for _, pFace := range policies {
		pMap := pFace.(map[string]interface{})
		details := make(map[string]interface{})

		for _, pName := range pMap["import_policies"].([]string) {
			if pd, ok := parsedPolicies[pName]; ok {
				details[pName] = pd
			}
		}
		for _, pName := range pMap["export_policies"].([]string) {
			if pd, ok := parsedPolicies[pName]; ok {
				details[pName] = pd
			}
		}
		pMap["policy_details"] = details
	}

	return map[string]interface{}{
		"neighbors": policies,
		"policies":  parsedPolicies,
	}, nil
}

func extractFromTags(inner string) []string {
	fromBlock := ""
	if start := strings.Index(inner, "<from>"); start != -1 {
		if end := strings.Index(inner[start:], "</from>"); end != -1 {
			fromBlock = inner[start : start+end]
		}
	}
	res := extractFriendly(fromBlock)
	if len(res) == 0 {
		return []string{"any"}
	}
	return res
}

func extractThenTags(inner string) []string {
	thenBlock := ""
	if start := strings.Index(inner, "<then>"); start != -1 {
		if end := strings.Index(inner[start:], "</then>"); end != -1 {
			thenBlock = inner[start : start+end]
		}
	}
	res := extractFriendly(thenBlock)
	if len(res) == 0 {
		return []string{"next policy"}
	}
	return res
}

func extractFriendly(xmlStr string) []string {
	var res []string
	if xmlStr == "" {
		return res
	}

	// 1. Extract empty tags like <accept/>, <exact/>
	reEmpty := regexp.MustCompile(`<([a-zA-Z0-9-]+)\s*/>`)
	matchesEmpty := reEmpty.FindAllStringSubmatch(xmlStr, -1)
	for _, m := range matchesEmpty {
		res = append(res, m[1])
	}

	// 2. Extract tags with content like <protocol>bgp</protocol>
	// Only leaf nodes (no nested `<` inside)
	reContent := regexp.MustCompile(`<([a-zA-Z0-9-]+)>([^<]+)</([a-zA-Z0-9-]+)>`)
	matchesContent := reContent.FindAllStringSubmatch(xmlStr, -1)
	for _, m := range matchesContent {
		if m[1] == m[3] { // Verify closing tag matches opening tag
			val := strings.TrimSpace(m[2])
			if val != "" {
				res = append(res, fmt.Sprintf("%s %s", m[1], val))
			}
		}
	}

	return res
}
