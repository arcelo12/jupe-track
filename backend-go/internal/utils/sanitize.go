package utils

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"regexp"
)

// SanitizeJunosInput validates that the input only contains safe characters.
// This prevents command injection for the CLI shell.
func SanitizeJunosInput(input string) (string, error) {
	if input == "" {
		return "", nil
	}
	// Only allow alphanumeric, dot, colon, hyphen, and underscore.
	// This covers IP addresses, ASNs, hostnames, and Juniper logical system names safely.
	validRegex := regexp.MustCompile(`^[a-zA-Z0-9\.\:\-\_]+$`)
	if !validRegex.MatchString(input) {
		return "", fmt.Errorf("invalid input detected (contains unsafe characters)")
	}
	return input, nil
}

// EscapeXML safely escapes string for inclusion into XML payloads.
// This prevents XML injection (e.g., breaking out of <command> tags).
func EscapeXML(input string) string {
	var buf bytes.Buffer
	xml.EscapeText(&buf, []byte(input))
	return buf.String()
}
