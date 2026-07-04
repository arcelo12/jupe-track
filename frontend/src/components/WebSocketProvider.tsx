"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { getAccessToken, tryRefreshToken } from '@/lib/auth';
import { BGPPeer, InterfaceInfo } from '@/lib/types';
import { useRefresh } from './RefreshProvider';
import { useAuth } from './AuthProvider';

interface WebSocketContextType {
  bgpSummary: BGPPeer[];
  interfaces: InterfaceInfo[];
  isConnected: boolean;
  error: string | null;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { logicalSystem } = useRefresh();
  const { isAuthenticated } = useAuth();
  const [bgpSummary, setBgpSummary] = useState<BGPPeer[]>([]);
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  // Monotonically increasing ID — every new connect() bumps it.
  // Stale callbacks from older sockets compare their captured id against
  // the current value and bail out if they don't match.
  const connectionIdRef = useRef(0);

  useEffect(() => {
    // Bump connection id so any in-flight callbacks from the previous
    // socket become stale and are silently ignored.
    const connId = ++connectionIdRef.current;

    // Cancel any pending reconnect timer from a previous connection.
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear previous state to prevent old data from leaking into new logical system
    setBgpSummary([]);
    setInterfaces([]);

    // Tear down the previous socket *without* triggering reconnect logic.
    // We null out the handlers first so the close event is a no-op.
    if (wsRef.current) {
      const old = wsRef.current;
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      old.close();
      wsRef.current = null;
    }

    // Helper: is this connection still the active one?
    const isStale = () => connectionIdRef.current !== connId;

    const connect = async () => {
      if (typeof window === 'undefined') return;
      if (window.location.pathname === '/login') return;
      if (isStale()) return;

      if (!isAuthenticated) {
        setIsConnected(false);
        return;
      }

      let token = getAccessToken();
      if (!token) {
        const refreshed = await tryRefreshToken();
        if (isStale()) return;
        if (refreshed) {
          token = getAccessToken();
        } else {
          setError("Session expired. Please log in again.");
          setIsConnected(false);
          return;
        }
      }

      const host = window.location.hostname;
      const wsUrl = `ws://${host}:8085/api/v1/ws?token=${token}&logical_system=${logicalSystem}`;

      console.log(`[WS][${connId}] Connecting to ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isStale()) { ws.close(); return; }
        console.log(`[WS][${connId}] Connection established`);
        setIsConnected(true);
        setError(null);
        retryCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (isStale()) return;
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'bgp_summary':
              if (Array.isArray(msg.data)) {
                setBgpSummary(msg.data);
              }
              break;
            case 'interfaces':
              if (Array.isArray(msg.data)) {
                setInterfaces(msg.data);
              }
              break;
            default:
              console.log('[WS] Unhandled message type:', msg.type);
          }
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      ws.onerror = (err) => {
        if (isStale()) return;
        console.error(`[WS][${connId}] Socket error:`, err);
      };

      ws.onclose = async (event) => {
        if (isStale()) {
          console.log(`[WS][${connId}] Stale socket closed, ignoring.`);
          return;
        }
        console.log(`[WS][${connId}] Connection closed:`, event.code, event.reason);
        setIsConnected(false);

        if (event.code === 4001 || event.code === 1008 || (event.reason && event.reason.includes("Unauthorized"))) {
          const refreshed = await tryRefreshToken();
          if (isStale()) return;
          if (refreshed) {
            connect();
            return;
          }
        }

        // Schedule reconnection with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
        retryCountRef.current += 1;

        console.log(`[WS][${connId}] Reconnecting in ${delay}ms...`);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isStale()) connect();
        }, delay);
      };
    };

    connect();

    return () => {
      connectionIdRef.current++;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        const old = wsRef.current;
        old.onopen = null;
        old.onmessage = null;
        old.onerror = null;
        old.onclose = null;
        old.close();
        wsRef.current = null;
      }
    };
  }, [logicalSystem, isAuthenticated]);

  return (
    <WebSocketContext.Provider value={{ bgpSummary, interfaces, isConnected, error }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

