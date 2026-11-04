package scraper

import "testing"

func TestParsePolicerSetOutput(t *testing.T) {
	out := `set firewall policer LIMIT-1G bandwidth-limit 1g
set firewall policer LIMIT-1G burst-size-limit 15k
set firewall policer LIMIT-100M bandwidth-limit 100m
set firewall policer LIMIT-10K bandwidth-limit 10k
set firewall policer RAW bandwidth-limit 250000000
set firewall policer NOBW burst-size-limit 4k`
	limits := parsePolicerSetOutput(out, "global")
	if len(limits) != 4 {
		t.Fatalf("got %d limits, want 4: %+v", len(limits), limits)
	}
	byName := make(map[string]uint64)
	for _, l := range limits {
		byName[l.Name] = l.BandwidthBps
	}
	want := map[string]uint64{
		"LIMIT-1G":   1_000_000_000,
		"LIMIT-100M": 100_000_000,
		"LIMIT-10K":  10_000,
		"RAW":        250_000_000,
	}
	for n, w := range want {
		if byName[n] != w {
			t.Errorf("%s = %d, want %d", n, byName[n], w)
		}
	}
	if _, ok := byName["NOBW"]; ok {
		t.Errorf("NOBW (no bandwidth-limit) should be skipped")
	}
	// Logical-system entries never appear in a global parse (their tree is
	// queried separately via `show configuration logical-systems <ls> ...`).
	if _, ok := byName["LS-P"]; ok {
		t.Errorf("LS-P belongs to logical-systems tree, not global")
	}
}

func TestParseJunosBandwidth(t *testing.T) {
	cases := map[string]uint64{
		"1g":        1_000_000_000,
		"100m":      100_000_000,
		"10k":       10_000,
		"250000000": 250_000_000,
		"1G":        1_000_000_000,
		"1.5m":      1_500_000,
		"":          0,
		"xyz":       0,
		"15k":       15_000,
	}
	for in, want := range cases {
		if got := parseJunosBandwidth(in); got != want {
			t.Errorf("parseJunosBandwidth(%q) = %d, want %d", in, got, want)
		}
	}
}
