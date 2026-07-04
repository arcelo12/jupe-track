package junos

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/Juniper/go-netconf/netconf"
	"golang.org/x/crypto/ssh"
)

var (
	persistentSession *netconf.Session
	sessionMutex      sync.Mutex
	rpcMutex          sync.Mutex
	sessionConfig     DeviceConfig
)

type DeviceConfig struct {
	Host     string `json:"host"`
	User     string `json:"user"`
	Password string `json:"password"`
	Port     string `json:"port"`      // NETCONF port
}

func GetDeviceConfig() DeviceConfig {
	config := DeviceConfig{
		Host:     os.Getenv("JUNOS_HOST"),
		User:     os.Getenv("JUNOS_USER"),
		Password: os.Getenv("JUNOS_PASS"),
		Port:     os.Getenv("JUNOS_PORT"),
	}
	if config.Port == "" {
		config.Port = "830"
	}

	var configPath string
	if _, err := os.Stat("/app/data"); !os.IsNotExist(err) {
		configPath = "/app/data/device_config.json"
	} else {
		configPath = "../backend/data/device_config.json"
	}

	data, err := os.ReadFile(configPath)
	if err == nil {
		var fileConfig map[string]interface{}
		if err := json.Unmarshal(data, &fileConfig); err == nil {
			if host, ok := fileConfig["host"].(string); ok && host != "" {
				config.Host = host
			}
			if user, ok := fileConfig["user"].(string); ok && user != "" {
				config.User = user
			}
			if pass, ok := fileConfig["password"].(string); ok && pass != "" {
				config.Password = pass
			}
			if port, ok := fileConfig["port"].(string); ok && port != "" {
				config.Port = port
			} else if portNum, ok := fileConfig["port"].(float64); ok {
				config.Port = fmt.Sprintf("%.0f", portNum)
			}
		}
	}

	return config
}

func getNetconfSession() (*netconf.Session, error) {
	sessionMutex.Lock()
	defer sessionMutex.Unlock()

	config := GetDeviceConfig()
	if config.Host == "" {
		return nil, fmt.Errorf("Junos host not configured")
	}

	if persistentSession != nil {
		if config.Host == sessionConfig.Host && config.User == sessionConfig.User && config.Password == sessionConfig.Password {
			return persistentSession, nil
		}
		persistentSession.Close()
		persistentSession = nil
	}

	sshConfig := &ssh.ClientConfig{
		User: config.User,
		Auth: []ssh.AuthMethod{
			ssh.Password(config.Password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}

	addr := fmt.Sprintf("%s:%s", config.Host, config.Port)
	log.Printf("[NETCONF] Establishing NEW persistent connection to %s as %s", addr, config.User)

	session, err := netconf.DialSSH(addr, sshConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NETCONF at %s: %v", addr, err)
	}

	persistentSession = session
	sessionConfig = config
	return persistentSession, nil
}

// RunNetconfRPC executes an RPC XML string via NETCONF and returns the raw response XML.
func RunNetconfRPC(rpcXML string) (string, error) {
	session, err := getNetconfSession()
	if err != nil {
		return "", err
	}

	rpcMutex.Lock()
	reply, err := session.Exec(netconf.RawMethod(rpcXML))
	rpcMutex.Unlock()

	if err != nil {
		log.Printf("[NETCONF] RPC failed, tearing down session. Err: %v", err)
		sessionMutex.Lock()
		if persistentSession == session {
			persistentSession.Close()
			persistentSession = nil
		}
		sessionMutex.Unlock()

		// Retry once
		session, err = getNetconfSession()
		if err != nil {
			return "", fmt.Errorf("RPC execution failed and reconnect failed: %v", err)
		}
		
		rpcMutex.Lock()
		reply, err = session.Exec(netconf.RawMethod(rpcXML))
		rpcMutex.Unlock()
		
		if err != nil {
			return "", fmt.Errorf("RPC execution failed after retry: %v", err)
		}
	}

	return reply.RawReply, nil
}


// RunCLICommand executes a CLI command on the Junos device via NETCONF <command> wrapper.
func RunCLICommand(cmd string) (string, error) {
	// Wrap command in `<command format="text">...</command>`
	rpcXML := fmt.Sprintf(`<command format="text">%s</command>`, cmd)
	replyXML, err := RunNetconfRPC(rpcXML)
	if err != nil {
		return "", err
	}

	// Parse out raw output text from RPC response using xml.Decoder (ignores namespaces)
	decoder := xml.NewDecoder(strings.NewReader(replyXML))
	for {
		t, err := decoder.Token()
		if err != nil {
			break
		}
		switch se := t.(type) {
		case xml.StartElement:
			if se.Name.Local == "output" || se.Name.Local == "cli-output" {
				var content string
				if err := decoder.DecodeElement(&content, &se); err == nil {
					return content, nil
				}
			}
		}
	}

	// Fallback regex-like string extraction if decoder fails
	if start := strings.Index(replyXML, "<output"); start != -1 {
		tagEnd := strings.Index(replyXML[start:], ">")
		if tagEnd != -1 {
			startPos := start + tagEnd + 1
			if end := strings.Index(replyXML[startPos:], "</output>"); end != -1 {
				return replyXML[startPos : startPos+end], nil
			}
		}
	}
	if start := strings.Index(replyXML, "<cli-output"); start != -1 {
		tagEnd := strings.Index(replyXML[start:], ">")
		if tagEnd != -1 {
			startPos := start + tagEnd + 1
			if end := strings.Index(replyXML[startPos:], "</cli-output>"); end != -1 {
				return replyXML[startPos : startPos+end], nil
			}
		}
	}

	// If no standard text wrappers found, return raw replyXML
	return replyXML, nil
}
