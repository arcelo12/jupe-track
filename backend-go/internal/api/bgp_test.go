package api

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/gin-gonic/gin"
)

func TestHandleBGPSummaryReturnsFreshLogicalSystemData(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cache.GlobalCache.SetBGP("EXCH", nil)
	t.Cleanup(func() { cache.GlobalCache.SetBGP("EXCH", nil) })

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Params = gin.Params{{Key: "logical_system", Value: "EXCH"}}

	want := []cache.BGPPeer{{PeerAddress: "192.0.2.1", PeerAS: "64500", State: "Established"}}
	handleBGPSummary(func(system string) ([]cache.BGPPeer, error) {
		if system != "EXCH" {
			t.Fatalf("system = %q, want EXCH", system)
		}
		return want, nil
	})(c)

	if w.Code != 200 {
		t.Fatalf("status = %d, want 200; body=%s", w.Code, w.Body.String())
	}

	var got []cache.BGPPeer
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(got) != 1 || got[0].PeerAddress != want[0].PeerAddress {
		t.Fatalf("response = %+v, want %+v", got, want)
	}

	cached := cache.GlobalCache.GetBGP("EXCH")
	if len(cached) != 1 || cached[0].PeerAddress != want[0].PeerAddress {
		t.Fatalf("cache = %+v, want %+v", cached, want)
	}
}
