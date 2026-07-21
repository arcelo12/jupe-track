package api

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// bucket is a mutex-guarded token bucket for one client.
type bucket struct {
	tokens   float64
	lastSeen time.Time
}

// RateLimiter implements a per-client token-bucket rate limiter using stdlib only.
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    float64 // tokens per second
	burst   float64
	stop    chan struct{}
}

// NewRateLimiter creates a limiter allowing requestsPerMinute per client with the
// given burst. A background goroutine evicts buckets idle longer than 30 minutes.
func NewRateLimiter(requestsPerMinute int, burst int) *RateLimiter {
	if requestsPerMinute <= 0 {
		requestsPerMinute = 1
	}
	if burst <= 0 {
		burst = 1
	}
	rl := &RateLimiter{
		buckets: make(map[string]*bucket),
		rate:    float64(requestsPerMinute) / 60.0,
		burst:   float64(burst),
		stop:    make(chan struct{}),
	}
	go rl.cleanupLoop()
	return rl
}

// allow consumes one token for key, reporting whether the request is allowed and,
// when denied, how many whole seconds until a token is available.
func (rl *RateLimiter) allow(key string) (bool, int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[key]
	if !ok {
		b = &bucket{tokens: rl.burst, lastSeen: now}
		rl.buckets[key] = b
	}

	// Refill elapsed tokens.
	elapsed := now.Sub(b.lastSeen).Seconds()
	b.tokens += elapsed * rl.rate
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.lastSeen = now

	if b.tokens >= 1.0 {
		b.tokens--
		return true, 0
	}

	// Seconds until one token is available.
	retryAfter := int((1.0-b.tokens)/rl.rate) + 1
	return false, retryAfter
}

// cleanupLoop evicts idle buckets every 10 minutes to bound memory growth.
func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-rl.stop:
			return
		case <-ticker.C:
			rl.mu.Lock()
			cutoff := time.Now().Add(-30 * time.Minute)
			for key, b := range rl.buckets {
				if b.lastSeen.Before(cutoff) {
					delete(rl.buckets, key)
				}
			}
			rl.mu.Unlock()
		}
	}
}

// Stop halts the background cleanup goroutine.
func (rl *RateLimiter) Stop() {
	close(rl.stop)
}

// Middleware returns a Gin handler enforcing the per-client rate limit. The client
// key is the API key name (when set by upstream auth middleware) or the client IP.
func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetString("api_key_name")
		if key == "" {
			key = c.ClientIP()
		}

		allowed, retryAfter := rl.allow(key)
		if !allowed {
			c.Header("Retry-After", strconv.Itoa(retryAfter))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}

// defaultGlobalLimiter allows 300 requests/minute per IP with a burst of 60.
var defaultGlobalLimiter = NewRateLimiter(300, 60)

// GlobalRateLimitMiddleware returns a middleware backed by a package-level default
// limiter (300 req/min per client IP, burst 60) suitable for all routes.
func GlobalRateLimitMiddleware() gin.HandlerFunc {
	return defaultGlobalLimiter.Middleware()
}
