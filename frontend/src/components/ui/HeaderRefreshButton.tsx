"use client";

import React, { useState } from 'react';
import { useRefresh } from '@/components/RefreshProvider';

export default function HeaderRefreshButton() {
  const { triggerRefresh, refreshInterval, setRefreshInterval, logicalSystem, setLogicalSystem, availableSystems } = useRefresh();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    triggerRefresh();
    // Visual feedback duration
    setTimeout(() => setIsRefreshing(false), 800);
  };

  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-on-surface-variant">Logical System:</span>
        <select 
          className="bg-surface-container-high border border-[#2A2E35] rounded-md text-sm py-1.5 px-3 focus:ring-1 focus:ring-primary outline-none transition-colors hover:border-primary font-mono text-primary"
          value={logicalSystem}
          onChange={(e) => setLogicalSystem(e.target.value)}
        >
          {availableSystems.map((sys) => (
            <option key={sys} value={sys}>{sys}</option>
          ))}
        </select>
      </div>

      <div className="h-6 w-px bg-[#2A2E35] hidden sm:block"></div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-on-surface-variant">Auto Refresh:</span>
        <select 
          className="bg-surface-container-high border border-[#2A2E35] rounded-md text-sm py-1.5 px-2 focus:ring-1 focus:ring-primary outline-none transition-colors hover:border-primary"
          value={refreshInterval}
          onChange={(e) => setRefreshInterval(Number(e.target.value))}
        >
          <option value={5}>5s</option>
          <option value={10}>10s</option>
          <option value={30}>30s</option>
          <option value={60}>1m</option>
          <option value={0}>Off</option>
        </select>
      </div>
      <button 
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-2 px-4 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-[#2A2E35] rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-75"
      >
        <span className={`text-primary ${isRefreshing ? 'animate-spin' : ''}`}>
          🔄
        </span>
        {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
      </button>
    </div>
  );
}
