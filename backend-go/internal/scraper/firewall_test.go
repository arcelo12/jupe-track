package scraper

import (
	"testing"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
)

// sampleFirewallText mimics `show firewall` CLI output on MX204 with two
// filters: one with counters, one with a policer used for rate limiting.
const sampleFirewallText = `Filter: LIMIT-1G-IN
Counters:
Name                Bytes              Packets
NARA-DOWN      1,234,567,890        12,345,678
SGM-DOWN         987,654,321         9,876,543

Filter: __EXCH/LIMIT-1G-OUT
Policers:
Name                Bytes              Packets
LIMIT-1G-LIMIT-AS153060-DOWN 12,345,678        1,234
garbage line without numbers
`

func TestParseFirewallText(t *testing.T) {
	filters := parseFirewallText(sampleFirewallText, "EXCH")
	if len(filters) != 2 {
		t.Fatalf("got %d filters, want 2: %+v", len(filters), filters)
	}

	f1 := filters[0]
	if f1.Name != "LIMIT-1G-IN" || f1.LogicalSystem != "EXCH" {
		t.Errorf("filter1 = %+v", f1)
	}
	if len(f1.Counters) != 2 || len(f1.Policers) != 0 {
		t.Fatalf("filter1 counters/policers = %d/%d", len(f1.Counters), len(f1.Policers))
	}
	if f1.Counters[0].Name != "NARA-DOWN" || f1.Counters[0].Bytes != 1234567890 || f1.Counters[0].Packets != 12345678 {
		t.Errorf("counter[0] = %+v", f1.Counters[0])
	}
	if f1.Counters[1].Name != "SGM-DOWN" || f1.Counters[1].Bytes != 987654321 {
		t.Errorf("counter[1] = %+v", f1.Counters[1])
	}

	f2 := filters[1]
	if f2.Name != "__EXCH/LIMIT-1G-OUT" {
		t.Errorf("filter2 name = %q", f2.Name)
	}
	if len(f2.Policers) != 1 || len(f2.Counters) != 0 {
		t.Fatalf("filter2 counters/policers = %d/%d", len(f2.Counters), len(f2.Policers))
	}
	p := f2.Policers[0]
	if p.Name != "LIMIT-1G-LIMIT-AS153060-DOWN" || p.BytesDropped != 12345678 || p.PacketsDropped != 1234 {
		t.Errorf("policer = %+v", p)
	}
}

func TestParseFirewallTextEmpty(t *testing.T) {
	if got := parseFirewallText("", "global"); len(got) != 0 {
		t.Errorf("empty output should return 0 filters, got %d", len(got))
	}
	if got := parseFirewallText("no filters here", "global"); len(got) != 0 {
		t.Errorf("junk output should return 0 filters, got %d", len(got))
	}
}

func TestParseJunosUint(t *testing.T) {
	cases := map[string]uint64{
		"1,234,567":            1234567,
		"42":                   42,
		"  1,000 ":             1000,
		"":                     0,
		"abc":                  0,
		"12x3":                 0,
		"18446744073709551615": 18446744073709551615,
	}
	for in, want := range cases {
		if got := parseJunosUint(in); got != want {
			t.Errorf("parseJunosUint(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestParseFirewallXML(t *testing.T) {
	reply := `<rpc-reply xmlns:junos="http://xml.juniper.net/junos/*">
  <filter-information>
    <filter>
      <filter-name>LIMIT-1G-IN</filter-name>
      <counter>
        <counter-name>NARA-DOWN</counter-name>
        <byte-count>1000</byte-count>
        <packet-count>10</packet-count>
      </counter>
      <policer>
        <policer-name>L1</policer-name>
        <byte-count>7</byte-count>
        <packet-count>1</packet-count>
      </policer>
    </filter>
  </filter-information>
</rpc-reply>`
	filters := parseFirewallXML(reply, "global")
	if len(filters) != 1 {
		t.Fatalf("got %d filters, want 1", len(filters))
	}
	f := filters[0]
	if f.Name != "LIMIT-1G-IN" || len(f.Counters) != 1 || len(f.Policers) != 1 {
		t.Fatalf("filter = %+v", f)
	}
	if f.Counters[0].Bytes != 1000 || f.Policers[0].BytesDropped != 7 {
		t.Errorf("values wrong: %+v %+v", f.Counters[0], f.Policers[0])
	}
}

func TestPushFirewallToVictoriaMetrics(t *testing.T) {
	// PushFirewallToVictoriaMetrics on empty slice must be a no-op (no panic).
	PushFirewallToVictoriaMetrics([]cache.FirewallFilter{})
	PushFirewallToVictoriaMetrics(nil)

	// sanitizeLabel escapes label-breaking characters.
	if got := sanitizeLabel(`a"b\c`); got != `a\"b\\c` {
		t.Errorf("sanitizeLabel = %q", got)
	}
}

func TestLsToStr(t *testing.T) {
	if got := lsToStr("logical-system EXCH "); got != "<logical-system>EXCH</logical-system>" {
		t.Errorf("lsToStr = %q", got)
	}
	if got := lsToStr(""); got != "" {
		t.Errorf("lsToStr empty = %q", got)
	}
}
