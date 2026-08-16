package scraper

import "testing"

// sampleInterfaceReply mimics a Junos get-interface-information reply with
// namespaced elements, one allowed physical port with a logical unit, and one
// disallowed physical port that must be filtered out.
const sampleInterfaceReply = `<rpc-reply xmlns:junos="http://xml.juniper.net/junos/*">
  <interface-information xmlns="http://xml.juniper.net/junos/*/junos-interface">
    <physical-interface>
      <name>ge-0/0/0</name>
      <description>uplink</description>
      <admin-status>up</admin-status>
      <oper-status>up</oper-status>
      <traffic-statistics>
        <input-bps>1000</input-bps>
        <output-bps>2000</output-bps>
      </traffic-statistics>
      <logical-interface>
        <name>ge-0/0/0.100</name>
        <description>vlan100</description>
        <transit-traffic-statistics>
          <input-bps>111</input-bps>
          <output-bps>222</output-bps>
        </transit-traffic-statistics>
      </logical-interface>
    </physical-interface>
    <physical-interface>
      <name>fxp0</name>
      <admin-status>up</admin-status>
      <oper-status>up</oper-status>
      <traffic-statistics>
        <input-bps>9</input-bps>
        <output-bps>9</output-bps>
      </traffic-statistics>
    </physical-interface>
  </interface-information>
</rpc-reply>`

func TestParseInterfaces(t *testing.T) {
	ifaces, err := parseInterfaces(sampleInterfaceReply)
	if err != nil {
		t.Fatalf("parseInterfaces error: %v", err)
	}

	// Only ge-0/0/0 (physical) + its logical unit survive; fxp0 is dropped.
	if len(ifaces) != 2 {
		t.Fatalf("got %d interfaces, want 2: %+v", len(ifaces), ifaces)
	}

	phys := ifaces[0]
	if phys.Name != "ge-0/0/0" || phys.Type != "physical" {
		t.Fatalf("physical = %+v, want ge-0/0/0/physical", phys)
	}
	if phys.BpsIn != 1000 || phys.BpsOut != 2000 {
		t.Errorf("physical bps = (%d,%d), want (1000,2000) from traffic-statistics", phys.BpsIn, phys.BpsOut)
	}

	logical := ifaces[1]
	if logical.Name != "ge-0/0/0.100" || logical.Type != "logical" {
		t.Fatalf("logical = %+v, want ge-0/0/0.100/logical", logical)
	}
	// Regression guard: logical bps MUST come from transit-traffic-statistics.
	if logical.BpsIn != 111 || logical.BpsOut != 222 {
		t.Errorf("logical bps = (%d,%d), want (111,222) from transit-traffic-statistics", logical.BpsIn, logical.BpsOut)
	}
	// Logical inherits physical admin/oper status when its own is absent.
	if logical.AdminStatus != "up" || logical.OperStatus != "up" {
		t.Errorf("logical status = (%q,%q), want inherited (up,up)", logical.AdminStatus, logical.OperStatus)
	}
}

func TestParseInterfacesInvalidXML(t *testing.T) {
	if _, err := parseInterfaces("<rpc-reply><broken>"); err == nil {
		t.Error("parseInterfaces(malformed) = nil error, want parse error")
	}
}

func TestRemoveXMLNamespaces(t *testing.T) {
	in := `<a xmlns="urn:x" xmlns:junos="urn:y"><b junos:key="v">1</b></a>`
	got := removeXMLNamespaces(in)
	want := `<a><b junos:key="v">1</b></a>`
	if got != want {
		t.Errorf("removeXMLNamespaces = %q, want %q", got, want)
	}
}

func TestIsInternalInterface(t *testing.T) {
	internal := []string{"fxp0", "em0", "lo0", "bme0", "demux0.1", "jsrv"}
	for _, n := range internal {
		if !isInternalInterface(n) {
			t.Errorf("isInternalInterface(%q) = false, want true", n)
		}
	}
	external := []string{"ge-0/0/0", "et-0/1/0", "xe-1/0/0", "ge-0/0/0.100"}
	for _, n := range external {
		if isInternalInterface(n) {
			t.Errorf("isInternalInterface(%q) = true, want false", n)
		}
	}
}
