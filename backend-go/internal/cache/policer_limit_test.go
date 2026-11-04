package cache

import "testing"

func TestGetPolicerLimitNameMatching(t *testing.T) {
	c := &StateCache{}
	c.SetPolicerLimits("global", []PolicerLimitInfo{
		{Name: "LIMIT-1G", BandwidthBps: 900_000_000},
		{Name: "LIMIT-100M", BandwidthBps: 100_000_000},
	})

	cases := []struct {
		live string
		want uint64
		ok   bool
	}{
		{"LIMIT-1G", 900_000_000, true},                            // exact (global instance)
		{"__EXCH/LIMIT-1G-LIMIT-AS151583-DOWN", 900_000_000, true}, // live LS-scoped
		{"__EXCH/LIMIT-1G-LIMIT-AS153060-UP", 900_000_000, true},   // live LS-scoped, other term
		{"__EXCH/LIMIT-100M-SOMETHING", 100_000_000, true},         // other policer
		{"__EXCH/UNRELATED", 0, false},                             // no match
		{"__OTHERLS/LIMIT-1G-XX", 900_000_000, true},               // prefix stripped regardless of LS name
		{"", 0, false}, // empty
	}
	for _, tc := range cases {
		got, ok := c.GetPolicerLimit("global", tc.live)
		if ok != tc.ok || got != tc.want {
			t.Errorf("GetPolicerLimit(%q) = %d,%v want %d,%v", tc.live, got, ok, tc.want, tc.ok)
		}
	}
}
