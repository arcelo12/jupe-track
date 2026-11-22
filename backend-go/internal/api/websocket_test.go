package api

import (
	"testing"
	"time"
)

// TestMinClientInterval verifies the fastest-viewer-wins cadence: a 5s client
// keeps the scrape rate at 5s even after a 30s client joins, and drops back to
// the remaining clients once the fast one leaves.
func TestMinClientInterval(t *testing.T) {
	hub := Hub{clients: make(map[*Client]bool)}
	if got := hub.MinClientInterval(); got != 0 {
		t.Fatalf("empty hub interval = %v, want 0", got)
	}

	slow := &Client{send: make(chan interface{}, 1), interval: 30 * time.Second}
	fast := &Client{send: make(chan interface{}, 1), interval: 5 * time.Second}
	// A client that never declared an interval must not influence the min.
	undeclared := &Client{send: make(chan interface{}, 1)}

	hub.clients[slow] = true
	if got := hub.MinClientInterval(); got != 30*time.Second {
		t.Fatalf("interval = %v, want 30s (only slow client)", got)
	}

	hub.clients[fast] = true
	if got := hub.MinClientInterval(); got != 5*time.Second {
		t.Fatalf("interval = %v, want 5s (fast client should win)", got)
	}

	hub.clients[undeclared] = true
	if got := hub.MinClientInterval(); got != 5*time.Second {
		t.Fatalf("interval = %v, want 5s (undeclared must be ignored)", got)
	}

	delete(hub.clients, fast)
	if got := hub.MinClientInterval(); got != 30*time.Second {
		t.Fatalf("interval = %v, want 30s after fast client left", got)
	}
}
