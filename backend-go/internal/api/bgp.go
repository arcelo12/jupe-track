package api

import (
	"encoding/xml"
	"fmt"
	"net/http"
	"strings"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/arcelo12/jupe-track/backend-go/internal/junos"
	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"github.com/arcelo12/jupe-track/backend-go/internal/utils"
	"github.com/gin-gonic/gin"
)

func RegisterBGPRoutes(r *gin.RouterGroup) {
	bgp := r.Group("/")
	bgp.Use(AuthAnyMiddleware())

	bgp.GET("/logical-systems", RequireScope(ScopeReadBGP), func(c *gin.Context) {
		systems := []string{"global"}
		rpcXML := `<get-configuration><configuration><logical-systems/></configuration></get-configuration>`
		replyXML, err := junos.RunNetconfRPC(rpcXML)
		if err == nil {
			var resp struct {
				Names []string `xml:"configuration>logical-systems>name"`
			}
			if err := xml.Unmarshal([]byte(replyXML), &resp); err == nil {
				for _, name := range resp.Names {
					if name != "" {
						systems = append(systems, name)
					}
				}
			}
		}
		c.JSON(http.StatusOK, systems)
	})

	bgp.GET("/bgp-summary/:logical_system", RequireScope(ScopeReadBGP), handleBGPSummary(scraper.FetchBGP))

	bgp.GET("/bgp-policy/:logical_system", RequireScope(ScopeReadBGP), func(c *gin.Context) {
		ls := c.Param("logical_system")
		ls, err := utils.SanitizeJunosInput(ls)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid logical system parameter"})
			return
		}

		policies, err := scraper.FetchBGPPolicies(ls)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, policies)
	})

	bgp.GET("/bgp-logs/:logical_system/:peer", RequireScope(ScopeReadBGP), func(c *gin.Context) {
		peer := c.Param("peer")
		peer, err := utils.SanitizeJunosInput(peer)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid peer parameter"})
			return
		}
		cmd := fmt.Sprintf("show log messages | match %s | tail 50", peer)
		out, err := junos.RunCLICommand(cmd)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		var lines []string
		for _, line := range strings.Split(out, "\n") {
			if line != "" {
				lines = append(lines, line)
			}
		}
		c.JSON(http.StatusOK, lines)
	})
}

func handleBGPSummary(fetch func(string) ([]cache.BGPPeer, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		ls := c.Param("logical_system")
		ls, err := utils.SanitizeJunosInput(ls)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid logical system parameter"})
			return
		}

		peers, err := fetch(ls)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		cache.GlobalCache.SetBGP(ls, peers)
		c.JSON(http.StatusOK, peers)
	}
}
