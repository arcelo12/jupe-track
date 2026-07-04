"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface RefreshContextType {
  refreshTrigger: number;
  triggerRefresh: () => void;
  refreshInterval: number;
  setRefreshInterval: (interval: number) => void;
  logicalSystem: string;
  setLogicalSystem: (system: string) => void;
  availableSystems: string[];
}

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [logicalSystem, setLogicalSystem] = useState("global");
  const [availableSystems, setAvailableSystems] = useState<string[]>(["global"]);

  React.useEffect(() => {
    // Initial load from storage
    try {
      const cachedSys = localStorage.getItem('junos-logical-systems');
      if (cachedSys) setAvailableSystems(JSON.parse(cachedSys));
      
      const cachedSelected = localStorage.getItem('junos-selected-system');
      if (cachedSelected) setLogicalSystem(cachedSelected);
      
      // Fetch available systems if not cached or to ensure freshness (only if not on login page)
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        import('@/lib/auth').then(({ authFetch }) => {
          authFetch('/api/proxy/logical-systems')
            .then(r => r.json())
            .then(systems => {
               if (Array.isArray(systems)) {
                 setAvailableSystems(systems);
                 localStorage.setItem('junos-logical-systems', JSON.stringify(systems));
               } else {
                 console.warn("Invalid logical systems response:", systems);
               }
            }).catch(e => console.warn(e));
        });
      }
        
    } catch {}
  }, []);

  // Sync selected system to local storage
  React.useEffect(() => {
     localStorage.setItem('junos-selected-system', logicalSystem);
  }, [logicalSystem]);

  // Sync refreshInterval to Go backend scraper interval config
  React.useEffect(() => {
    if (typeof window === 'undefined' || window.location.pathname === '/login') return;

    const syncInterval = async () => {
      try {
        const { authFetch } = await import('@/lib/auth');
        
        // Fetch current settings
        const getRes = await authFetch(`/api/proxy/ws/settings?t=${Date.now()}`);
        if (getRes.ok) {
          const settings = await getRes.json();
          const targetIntervalNs = refreshInterval * 1_000_000_000;
          
          if (settings.scrape_interval !== targetIntervalNs) {
            settings.scrape_interval = targetIntervalNs;
            
            // Post updated settings back to backend
            await authFetch('/api/proxy/ws/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(settings)
            });
            console.log(`[RefreshProvider] Scraper interval updated in backend to ${refreshInterval}s`);
          }
        }
      } catch (e) {
        console.warn("Failed to sync scraper interval with backend", e);
      }
    };

    syncInterval();
  }, [refreshInterval]);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const triggerManualRefresh = async () => {
    setRefreshTrigger(prev => prev + 1);
    try {
      const { authFetch } = await import('@/lib/auth');
      await authFetch('/api/proxy/live/refresh', { method: 'POST' });
      console.log('[RefreshProvider] Manual scrape triggered on backend');
    } catch (e) {
      console.warn('Failed to trigger manual backend refresh', e);
    }
  };

  React.useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(triggerRefresh, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [refreshInterval]);

  return (
    <RefreshContext.Provider value={{ 
        refreshTrigger, triggerRefresh: triggerManualRefresh, 
        refreshInterval, setRefreshInterval,
        logicalSystem, setLogicalSystem, availableSystems
    }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  const context = useContext(RefreshContext);
  if (context === undefined) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return context;
}
