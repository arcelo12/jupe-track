package scraper

import "testing"

func TestParsePolicerBraces(t *testing.T) {
	out := `family inet {
    filter LIMIT-1G-IN {
        term T1 {
            then {
                policer LIMIT-1G;
                count C1;
            }
        }
    }
}
policer LIMIT-1G {
    if-exceeding {
        bandwidth-limit 900m;
        burst-size-limit 4m;
    }
    then discard;
}
policer LIMIT-100M {
    if-exceeding {
        bandwidth-limit 100m;
    }
    then discard;
}
policer NO-BW {
    then discard;
}`
	limits := parsePolicerBraces(out, "EXCH")
	if len(limits) != 2 {
		t.Fatalf("got %d limits, want 2: %+v", len(limits), limits)
	}
	if limits[0].Name != "LIMIT-1G" || limits[0].BandwidthBps != 900_000_000 || limits[0].LogicalSystem != "EXCH" {
		t.Errorf("limits[0] = %+v", limits[0])
	}
	if limits[1].Name != "LIMIT-100M" || limits[1].BandwidthBps != 100_000_000 {
		t.Errorf("limits[1] = %+v", limits[1])
	}
}

func TestParsePolicerBracesEmpty(t *testing.T) {
	if got := parsePolicerBraces("", "global"); len(got) != 0 {
		t.Errorf("empty -> %d, want 0", len(got))
	}
	if got := parsePolicerBraces("no policers here", "global"); len(got) != 0 {
		t.Errorf("junk -> %d, want 0", len(got))
	}
}

func TestParseJunosBandwidth(t *testing.T) {
	cases := map[string]uint64{
		"1g":        1_000_000_000,
		"900m":      900_000_000,
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
