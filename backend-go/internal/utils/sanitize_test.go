package utils

import "testing"

func TestSanitizeJunosInput(t *testing.T) {
	valid := []string{
		"10.0.0.0/8",   // CIDR prefix
		"192.0.2.1",    // IPv4
		"2001:db8::1",  // IPv6
		"64500",        // ASN
		"ge-0/0/0.100", // interface unit
		"EXCH",         // logical system name
		"my-router_1",  // hyphen + underscore
	}
	for _, in := range valid {
		got, err := SanitizeJunosInput(in)
		if err != nil {
			t.Errorf("SanitizeJunosInput(%q) unexpected error: %v", in, err)
		}
		if got != in {
			t.Errorf("SanitizeJunosInput(%q) = %q, want unchanged", in, got)
		}
	}

	// Empty input is allowed and returns empty (callers treat it as "no filter").
	if got, err := SanitizeJunosInput(""); err != nil || got != "" {
		t.Errorf("SanitizeJunosInput(\"\") = (%q, %v), want (\"\", nil)", got, err)
	}

	// Shell/Junos metacharacters and injection attempts must be rejected.
	invalid := []string{
		"10.0.0.0 | show version",
		"foo; delete",
		"a && b",
		"$(whoami)",
		"`id`",
		"a\nb",
		"a b",       // space
		"<command>", // XML angle brackets
		"peer'name", // quote
		"peer\"name",
		"a*b",
	}
	for _, in := range invalid {
		if _, err := SanitizeJunosInput(in); err == nil {
			t.Errorf("SanitizeJunosInput(%q) = nil error, want rejection", in)
		}
	}
}

func TestEscapeXML(t *testing.T) {
	cases := map[string]string{
		"plain":             "plain",
		"a<b":               "a&lt;b",
		"a>b":               "a&gt;b",
		"a&b":               "a&amp;b",
		"</command>":        "&lt;/command&gt;",
		"tab\tnewline\nfoo": "tab&#x9;newline&#xA;foo",
	}
	for in, want := range cases {
		if got := EscapeXML(in); got != want {
			t.Errorf("EscapeXML(%q) = %q, want %q", in, got, want)
		}
	}
}
