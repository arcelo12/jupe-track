package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"github.com/arcelo12/jupe-track/backend-go/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// SA-019: validate Origin against an allowlist
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		allowed := strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",")
		filtered := make([]string, 0, len(allowed))
		for _, a := range allowed {
			if a = strings.TrimSpace(a); a != "" {
				filtered = append(filtered, a)
			}
		}
		for _, a := range filtered {
			if origin == a {
				return true
			}
		}
		if len(filtered) == 0 {
			// No allowlist configured: permit same-hostname origins only.
			// Ports differ (UI on :3040, WS API on :8085), so compare hostnames.
			u, err := url.Parse(origin)
			if err != nil {
				return false
			}
			reqHost := r.Host
			if h, _, splitErr := net.SplitHostPort(reqHost); splitErr == nil {
				reqHost = h
			}
			return u.Hostname() == reqHost
		}
		return false
	},
}

// Client represents a connected WebSocket user
type Client struct {
	conn          *websocket.Conn
	send          chan interface{}
	logicalSystem string
	// interval is the update cadence this client asked for (seconds). 0 means
	// the client never told us, so it is ignored by MinClientInterval.
	interval time.Duration
}

// WSMessage wrapper for structured messages pushed to frontend
type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// Bounds for client-declared update intervals. Clamped so a single browser
// tab can't pin the Junos scrape rate to sub-second or multi-minute values.
const (
	minClientIntervalSeconds = 5
	maxClientIntervalSeconds = 300
)

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan interface{}
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex
}

var globalHub = Hub{
	clients:    make(map[*Client]bool),
	broadcast:  make(chan interface{}, 100),
	register:   make(chan *Client),
	unregister: make(chan *Client),
}

func init() {
	// Start the Hub coordinator
	go globalHub.run()

	// Register callbacks for real-time scraper updates
	scraper.OnBGPUpdate = func(sys string, peers []cache.BGPPeer) {
		BroadcastToSystem(sys, "bgp_summary", peers)
	}
	scraper.OnInterfaceUpdate = func(ifaces []cache.InterfaceStat) {
		Broadcast("interfaces", ifaces)
	}
	scraper.GetActiveLogicalSystems = GetActiveLogicalSystems
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			scraper.RegisterActiveUser()
			log.Printf("[WS Hub] Registered client. Total active clients: %d", len(h.clients))

			// Push initial cached states immediately upon connection
			client.send <- WSMessage{Type: "bgp_summary", Data: cache.GlobalCache.GetBGP(client.logicalSystem)}
			client.send <- WSMessage{Type: "interfaces", Data: cache.GlobalCache.GetInterfaces()}

			// A new viewer may raise the scrape cadence (min across clients).
			notifyScraperInterval(h)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				scraper.UnregisterActiveUser()
				log.Printf("[WS Hub] Unregistered client. Total active clients: %d", len(h.clients))
			}
			h.mu.Unlock()

			// The leaving client may have been the fast one that was driving cadence.
			notifyScraperInterval(h)

		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
					scraper.UnregisterActiveUser()
				}
			}
			h.mu.Unlock()
		}
	}
}

// MinClientInterval returns the fastest update interval requested by any
// connected client. Returns 0 when no client has declared an interval, which
// tells the scraper to fall back to the configured ScrapeInterval.
// Fastest client wins so a 5s viewer keeps 5s even when a 30s viewer joins;
// the slower viewer throttles on its own side instead of pulling the
// scraper rate up.
func (h *Hub) MinClientInterval() time.Duration {
	h.mu.Lock()
	defer h.mu.Unlock()
	var min time.Duration
	for client := range h.clients {
		if client.interval <= 0 {
			continue
		}
		if min == 0 || client.interval < min {
			min = client.interval
		}
	}
	return min
}

// effectiveInterval picks the scraper cadence: the fastest active client, or
// the configured scrape interval when nobody has declared one.
func (h *Hub) effectiveInterval() time.Duration {
	if min := h.MinClientInterval(); min > 0 {
		return min
	}
	var settings models.ScraperSettings
	if database.DB != nil {
		database.DB.First(&settings)
	}
	if settings.ScrapeInterval > 0 {
		return settings.ScrapeInterval
	}
	return 30 * time.Second
}

// notifyScraperInterval pushes the current effective cadence to the scraper
// so its ticker can be reset without restarting the loop.
func notifyScraperInterval(h *Hub) {
	scraper.RequestInterval(h.effectiveInterval())
}

// GetActiveLogicalSystems returns the list of unique logical systems requested by active clients
func GetActiveLogicalSystems() []string {
	globalHub.mu.Lock()
	defer globalHub.mu.Unlock()

	sysMap := make(map[string]bool)
	for client := range globalHub.clients {
		sysMap[client.logicalSystem] = true
	}

	systems := make([]string, 0, len(sysMap))
	for sys := range sysMap {
		systems = append(systems, sys)
	}
	if len(systems) == 0 {
		systems = append(systems, "global")
	}
	return systems
}

// Broadcast sends a message to all connected clients
func Broadcast(messageType string, data interface{}) {
	msg := WSMessage{
		Type: messageType,
		Data: data,
	}
	select {
	case globalHub.broadcast <- msg:
	default:
		// Avoid blocking if broadcast channel is full
	}
}

// BroadcastToSystem sends a message only to clients connected for a specific logical system
func BroadcastToSystem(logicalSystem string, messageType string, data interface{}) {
	if logicalSystem == "" {
		logicalSystem = "global"
	}
	msg := WSMessage{
		Type: messageType,
		Data: data,
	}

	globalHub.mu.Lock()
	defer globalHub.mu.Unlock()
	for client := range globalHub.clients {
		if client.logicalSystem == logicalSystem {
			select {
			case client.send <- msg:
			default:
				close(client.send)
				delete(globalHub.clients, client)
				scraper.UnregisterActiveUser()
			}
		}
	}
}

// RegisterWebSocketRoutes adds WS handler
func RegisterWebSocketRoutes(r *gin.RouterGroup) {
	r.GET("/ws", func(c *gin.Context) {
		tokenStr := c.Query("token")
		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing auth token"})
			return
		}

		// Verify token (reusing logic from auth.go AuthMiddleware)
		token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
			// SA-014: validate signing method (consistent with AuthMiddleware)
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return JWTSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid auth token"})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[WS] Upgrade failed: %v", err)
			return
		}

		// SA-002: sanitize logicalSystem before storing on client
		logicalSystem := c.DefaultQuery("logical_system", "global")
		if logicalSystem == "" {
			logicalSystem = "global"
		}
		if logicalSystem != "global" {
			sanitized, err := utils.SanitizeJunosInput(logicalSystem)
			if err != nil {
				logicalSystem = "global"
			} else {
				logicalSystem = sanitized
			}
		}

		client := &Client{
			conn:          conn,
			send:          make(chan interface{}, 256),
			logicalSystem: logicalSystem,
		}

		globalHub.register <- client

		// Read loop (to detect client disconnects)
		go client.readPump()
		// Write loop (to push updates to client)
		go client.writePump()
	})

	// Get total active scraper settings — SA-001: require auth
	r.GET("/ws/settings", AuthMiddleware(), func(c *gin.Context) {
		var settings models.ScraperSettings
		if database.DB != nil {
			database.DB.First(&settings)
		}
		if settings.ID == 0 {
			settings = models.ScraperSettings{
				EnableBGP:        true,
				EnableInterfaces: true,
				ScrapeInterval:   30 * time.Second,
				BackgroundScrape: false,
			}
		}
		c.JSON(http.StatusOK, settings)
	})

	// Save total scraper settings — SA-001: auth; SA-004: admin-only
	r.POST("/ws/settings", AuthMiddleware(), AdminMiddleware(), func(c *gin.Context) {
		var req models.ScraperSettings
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid settings payload"})
			return
		}

		if database.DB != nil {
			var existing models.ScraperSettings
			database.DB.First(&existing)
			if existing.ID != 0 {
				existing.EnableBGP = req.EnableBGP
				existing.EnableInterfaces = req.EnableInterfaces
				existing.ScrapeInterval = req.ScrapeInterval
				existing.BackgroundScrape = req.BackgroundScrape
				database.DB.Save(&existing)
				scraper.UpdateSettings(&existing)
			} else {
				database.DB.Create(&req)
				scraper.UpdateSettings(&req)
			}
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Scraper settings updated successfully"})
	})
}

func (c *Client) readPump() {
	defer func() {
		globalHub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(512)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] Read error: %v", err)
			}
			break
		}
		_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))

		// Client-to-server messages: only set_interval is handled. Anything
		// else is accepted and ignored.
		var m struct {
			Type            string `json:"type"`
			IntervalSeconds int    `json:"interval_seconds"`
		}
		if json.Unmarshal(raw, &m) != nil || m.Type != "set_interval" {
			continue
		}
		if m.IntervalSeconds < minClientIntervalSeconds || m.IntervalSeconds > maxClientIntervalSeconds {
			continue
		}
		globalHub.mu.Lock()
		if _, ok := globalHub.clients[c]; ok {
			c.interval = time.Duration(m.IntervalSeconds) * time.Second
		}
		globalHub.mu.Unlock()
		notifyScraperInterval(&globalHub)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := c.conn.WriteJSON(message)
			if err != nil {
				log.Printf("[WS] Write JSON error: %v", err)
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
