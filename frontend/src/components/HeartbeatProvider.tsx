"use client";

import { useEffect, useRef } from 'react';
import { authFetch, isAuthenticated } from '@/lib/auth';

/**
 * HeartbeatProvider sends a connect signal when the web app loads
 * and a disconnect signal when the user closes/navigates away.
 * This tells the backend to start/stop scraping on-demand.
 */
export function HeartbeatProvider({ children }: { children: React.ReactNode }) {
  const connectedRef = useRef(false);

  useEffect(() => {
    // Don't send heartbeat on login page
    if (typeof window === 'undefined' || window.location.pathname === '/login') return;
    if (!isAuthenticated()) return;

    const connect = async () => {
      try {
        await authFetch('/api/proxy/heartbeat/connect', { method: 'POST' });
        connectedRef.current = true;
        console.log('[Heartbeat] Connected - scraping activated');
      } catch (err) {
        console.warn('[Heartbeat] Failed to connect:', err);
      }
    };

    const disconnect = () => {
      if (!connectedRef.current) return;
      // Use sendBeacon for reliable disconnect on page close
      const refreshToken = localStorage.getItem('jupe_refresh_token');
      if (refreshToken) {
        navigator.sendBeacon(
          '/api/proxy/heartbeat/disconnect',
          new Blob([JSON.stringify({})], { type: 'application/json' })
        );
      }
      connectedRef.current = false;
      console.log('[Heartbeat] Disconnected');
    };

    connect();

    window.addEventListener('beforeunload', disconnect);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        disconnect();
      } else if (document.visibilityState === 'visible' && !connectedRef.current) {
        connect();
      }
    });

    return () => {
      disconnect();
      window.removeEventListener('beforeunload', disconnect);
    };
  }, []);

  return <>{children}</>;
}
