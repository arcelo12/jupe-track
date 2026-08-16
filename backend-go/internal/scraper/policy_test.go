package scraper

import (
	"reflect"
	"testing"
)

func TestExtractFriendly(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"empty", "", nil},
		{"empty tags", "<accept/><exact/>", []string{"accept", "exact"}},
		{"content leaf", "<protocol>bgp</protocol>", []string{"protocol bgp"}},
		{
			"mixed",
			"<protocol>bgp</protocol><accept/>",
			[]string{"accept", "protocol bgp"},
		},
		{"mismatched tags ignored", "<a>x</b>", nil},
		{"whitespace value trimmed", "<community>  RT:1  </community>", []string{"community RT:1"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := extractFriendly(c.in)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("extractFriendly(%q) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

func TestExtractFromTags(t *testing.T) {
	// No <from> block -> default "any".
	if got := extractFromTags("<then><accept/></then>"); !reflect.DeepEqual(got, []string{"any"}) {
		t.Errorf("extractFromTags(no from) = %v, want [any]", got)
	}
	// Populated <from> block returns its friendly tokens.
	in := "<from><protocol>bgp</protocol></from><then><accept/></then>"
	if got := extractFromTags(in); !reflect.DeepEqual(got, []string{"protocol bgp"}) {
		t.Errorf("extractFromTags = %v, want [protocol bgp]", got)
	}
	// Empty <from> block -> default "any".
	if got := extractFromTags("<from></from>"); !reflect.DeepEqual(got, []string{"any"}) {
		t.Errorf("extractFromTags(empty from) = %v, want [any]", got)
	}
}

func TestExtractThenTags(t *testing.T) {
	// No <then> block -> default "next policy".
	if got := extractThenTags("<from><protocol>bgp</protocol></from>"); !reflect.DeepEqual(got, []string{"next policy"}) {
		t.Errorf("extractThenTags(no then) = %v, want [next policy]", got)
	}
	// Populated <then> block.
	if got := extractThenTags("<then><reject/></then>"); !reflect.DeepEqual(got, []string{"reject"}) {
		t.Errorf("extractThenTags = %v, want [reject]", got)
	}
}
