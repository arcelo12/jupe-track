// Contoh klien JupeTrack API — hanya stdlib Go.
// Autentikasi via API key di env JUPETRACK_API_KEY (header X-API-Key).
//
// Jalankan:
//
//	JUPETRACK_API_KEY=jpt_xxx go run go_client.go
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const defaultBaseURL = "http://localhost:8085/api/v1"

// getJSON melakukan GET dengan header X-API-Key lalu decode body JSON.
func getJSON(client *http.Client, baseURL, path, apiKey string) (any, error) {
	req, err := http.NewRequest(http.MethodGet, baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-API-Key", apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	var out any
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// printJSON menampilkan JSON dengan indentasi agar mudah dibaca.
func printJSON(title string, v any) error {
	pretty, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	fmt.Printf("=== %s ===\n%s\n", title, pretty)
	return nil
}

func main() {
	apiKey := os.Getenv("JUPETRACK_API_KEY")
	if apiKey == "" {
		fmt.Fprintln(os.Stderr, "Set env JUPETRACK_API_KEY=jpt_<40 hex>")
		os.Exit(1)
	}

	baseURL := os.Getenv("JUPETRACK_BASE_URL")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}

	client := &http.Client{Timeout: 15 * time.Second}

	// Daftar BGP peer dari cache live (scope: read:bgp)
	peers, err := getJSON(client, baseURL, "/live/bgp?logical_system=global", apiKey)
	if err != nil {
		fmt.Fprintln(os.Stderr, "live/bgp error:", err)
		os.Exit(1)
	}
	if err := printJSON("/live/bgp", peers); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	// Status perangkat: CPU, memori, suhu, uptime (scope: read:device)
	status, err := getJSON(client, baseURL, "/metrics/device/status", apiKey)
	if err != nil {
		fmt.Fprintln(os.Stderr, "device/status error:", err)
		os.Exit(1)
	}
	if err := printJSON("/metrics/device/status", status); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
