package api

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/arcelo12/jupe-track/backend-go/internal/cache"
	"github.com/arcelo12/jupe-track/backend-go/internal/database"
	"github.com/arcelo12/jupe-track/backend-go/internal/models"
	"github.com/arcelo12/jupe-track/backend-go/internal/scraper"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for simplicity in dev/Docker environments
		return true
	},
}

// Client represents a connected WebSocket user
type Client struct {
	conn          *websocket.Conn
	send          chan interface{}
	logicalSystem string
}

// WSMessage wrapper for structured messages pushed to frontend
type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

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

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				scraper.UnregisterActiveUser()
				log.Printf("[WS Hub] Unregistered client. Total active clients: %d", len(h.clients))
			}
			h.mu.Unlock()

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

		logicalSystem := c.DefaultQuery("logical_system", "global")
		if logicalSystem == "" {
			logicalSystem = "global"
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

	// Get total active scraper settings
	r.GET("/ws/settings", func(c *gin.Context) {
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

	// Save total scraper settings
	r.POST("/ws/settings", func(c *gin.Context) {
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
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] Read error: %v", err)
			}
			break
		}
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
