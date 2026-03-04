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
      
      // Fetch available systems if not cached or to ensure freshness
      fetch('/api/proxy/logical-systems')
        .then(r => r.json())
        .then(systems => {
           setAvailableSystems(systems);
           localStorage.setItem('junos-logical-systems', JSON.stringify(systems));
        }).catch(e => console.warn(e));
        
    } catch {}
  }, []);

  // Sync selected system to local storage
  React.useEffect(() => {
     localStorage.setItem('junos-selected-system', logicalSystem);
  }, [logicalSystem]);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  React.useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(triggerRefresh, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [refreshInterval]);

  return (
    <RefreshContext.Provider value={{ 
        refreshTrigger, triggerRefresh, 
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
