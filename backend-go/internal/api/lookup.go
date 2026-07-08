package api

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type CacheEntry struct {
	Data      interface{}
	ExpiresAt time.Time
}

var (
	lookupCache = make(map[string]CacheEntry)
	cacheMu     sync.RWMutex
)

func getFromCache(key string) (interface{}, bool) {
	cacheMu.RLock()
	defer cacheMu.RUnlock()
	entry, found := lookupCache[key]
	if found && time.Now().Before(entry.ExpiresAt) {
		return entry.Data, true
	}
	return nil, false
}

func setToCache(key string, data interface{}, duration time.Duration) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	lookupCache[key] = CacheEntry{
		Data:      data,
		ExpiresAt: time.Now().Add(duration),
	}
}

func resolveDoH(hostname string) (string, error) {
	// Use 1.1.1.1 directly to completely bypass the need for any local DNS resolution.
	// 1.1.1.1 has a valid TLS certificate for the IP itself.
	req, err := http.NewRequest("GET", "https://1.1.1.1/dns-query?name="+hostname+"&type=A", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/dns-json")
	
	// Use a standard client for DoH, assuming 1.1.1.1 resolves correctly locally.
	// Skip TLS verify because some environments reject certificates for raw IPs.
	client := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Answer []struct {
			Type int    `json:"type"`
			Data string `json:"data"`
		} `json:"Answer"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	
	for _, ans := range result.Answer {
		if ans.Type == 1 { // A record
			return ans.Data, nil
		}
	}
	return "", fmt.Errorf("no A record found in DoH answer")
}

func fetchLookupAPI(url string) (interface{}, error) {
	// Simple rate limit protection via cache
	if data, found := getFromCache(url); found {
		return data, nil
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			
			// Resolve IP using DoH
			ip, err := resolveDoH(host)
			if err != nil {
				fmt.Printf("DoH failed for %s: %v\n", host, err)
				return nil, fmt.Errorf("DoH resolution failed for %s: %v", host, err)
			}
			
			fmt.Printf("DoH success for %s -> %s\n", host, ip)
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, network, net.JoinHostPort(ip, port))
		},
	}

	client := &http.Client{
		Timeout:   15 * time.Second,
		Transport: transport,
	}
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	// Identify ourselves politely
	req.Header.Set("User-Agent", "JupeTrack/1.0 (BGP Looking Glass)")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("lookup API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	// Cache for 24 hours
	setToCache(url, result, 24*time.Hour)

	return result, nil
}

func RegisterLookupRoutes(r *gin.RouterGroup) {
	lookup := r.Group("/lookup")
	lookup.Use(AuthMiddleware()) // require login

	lookup.GET("/asn/:asn", func(c *gin.Context) {
		asn := c.Param("asn")
		asn = strings.TrimPrefix(strings.ToUpper(asn), "AS")
		
		url := fmt.Sprintf("https://stat.ripe.net/data/as-overview/data.json?resource=%s", asn)
		data, err := fetchLookupAPI(url)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, data)
	})

	lookup.GET("/ip/:ip", func(c *gin.Context) {
		ip := c.Param("ip")
		url := fmt.Sprintf("https://stat.ripe.net/data/network-info/data.json?resource=%s", ip)
		data, err := fetchLookupAPI(url)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, data)
	})

	lookup.GET("/routing/*resource", func(c *gin.Context) {
		resource := c.Param("resource")
		resource = strings.TrimPrefix(resource, "/") // remove leading slash from * parameter
		url := fmt.Sprintf("https://stat.ripe.net/data/looking-glass/data.json?resource=%s", resource)
		data, err := fetchLookupAPI(url)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, data)
	})

	lookup.GET("/community/:community", func(c *gin.Context) {
		community := c.Param("community")
		// Basic BGP Community lookup (e.g. 2914:420)
		parts := strings.Split(community, ":")
		if len(parts) != 2 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid community format. Use AS:VAL"})
			return
		}
		
		asn := parts[0]
		// Fetch ASN to get its description/IRR which might contain community info
		url := fmt.Sprintf("https://stat.ripe.net/data/as-overview/data.json?resource=%s", asn)
		data, err := fetchLookupAPI(url)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		
		c.JSON(http.StatusOK, gin.H{
			"success": true, 
			"community": community,
			"asn_context": data,
			"note": "Community values are ASN-specific. Review the ASN owner's routing policy.",
		})
	})
}
