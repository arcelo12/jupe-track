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
        <span className="text-sm text-slate-400">Logical System:</span>
        <select 
          className="bg-slate-900 border border-slate-700/50 rounded-md text-sm py-1.5 px-3 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors hover:border-slate-600 font-mono text-emerald-400"
          value={logicalSystem}
          onChange={(e) => setLogicalSystem(e.target.value)}
        >
          {availableSystems.map((sys) => (
            <option key={sys} value={sys}>{sys}</option>
          ))}
        </select>
      </div>

      <div className="h-6 w-px bg-slate-700/50 hidden sm:block"></div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Auto Refresh:</span>
        <select 
          className="bg-slate-900 border border-slate-700 rounded-md text-sm py-1.5 px-2 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors hover:border-slate-600"
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
        className="flex items-center gap-2 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-75"
      >
        <span className={`text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`}>
          🔄
        </span>
        {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
      </button>
    </div>
  );
}
