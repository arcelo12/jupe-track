"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRefresh } from "@/components/RefreshProvider";

export default function HeaderRefreshButton() {
  const { triggerRefresh, refreshInterval, setRefreshInterval, logicalSystem, setLogicalSystem, availableSystems } = useRefresh();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    triggerRefresh();
    // Visual feedback duration
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const logicalSystemSelect = (id: string, hClass = "h-9") => (
    <select
      id={id}
      className={`${hClass} w-full rounded border border-outline-variant bg-surface-container-high px-3 font-mono text-sm text-primary outline-none transition-colors hover:border-primary focus-visible:border-primary`}
      value={logicalSystem}
      onChange={(event) => setLogicalSystem(event.target.value)}
    >
      {availableSystems.map((system) => (
        <option key={system} value={system}>{system}</option>
      ))}
    </select>
  );

  const intervalSelect = (id: string, hClass = "h-9") => (
    <select
      id={id}
      className={`${hClass} w-full rounded border border-outline-variant bg-surface-container-high px-2 text-sm text-on-surface outline-none transition-colors hover:border-primary focus-visible:border-primary`}
      value={refreshInterval}
      onChange={(event) => setRefreshInterval(Number(event.target.value))}
    >
      <option value={5}>5s</option>
      <option value={10}>10s</option>
      <option value={30}>30s</option>
      <option value={60}>1m</option>
      <option value={0}>Off</option>
    </select>
  );

  const refreshButton = (isPortrait = false) => (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={isRefreshing}
      aria-label={isRefreshing ? "Refreshing telemetry" : "Refresh telemetry now"}
      className={
        isPortrait
          ? "flex h-11 min-h-[44px] min-w-11 shrink-0 items-center justify-center gap-2 rounded border border-outline-variant bg-surface-container-high px-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
          : "flex h-9 items-center justify-center gap-2 rounded border border-outline-variant bg-surface-container-high px-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      <RefreshCw aria-hidden="true" className={`size-4 text-primary ${isRefreshing ? "animate-spin" : ""}`} />
      <span className={isPortrait ? "hidden sm:inline" : undefined}>
        {isRefreshing ? "Refreshing..." : "Refresh Now"}
      </span>
    </button>
  );

  return (
    <>
      <div
        data-portrait-refresh-bar
        className="order-3 basis-full flex w-full items-end gap-2 border-t border-outline-variant pt-2 xl:hidden"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="portrait-logical-system" className="block text-xs text-on-surface-variant mb-1 truncate">
            Logical System
          </label>
          {logicalSystemSelect("portrait-logical-system", "h-11")}
        </div>
        <div className="w-16 shrink-0 sm:w-20">
          <label htmlFor="portrait-refresh-interval" className="block text-xs text-on-surface-variant mb-1 truncate">
            Auto Refresh
          </label>
          {intervalSelect("portrait-refresh-interval", "h-11")}
        </div>
        {refreshButton(true)}
      </div>

      <div className="hidden items-center gap-4 xl:flex order-2 ml-auto">
        <div className="flex items-center gap-2">
          <label htmlFor="header-logical-system" className="text-xs text-on-surface-variant">Logical System</label>
          <div className="w-36">{logicalSystemSelect("header-logical-system")}</div>
        </div>
        <div className="h-6 w-px bg-outline-variant" />
        <div className="flex items-center gap-2">
          <label htmlFor="header-refresh-interval" className="text-xs text-on-surface-variant">Auto Refresh</label>
          <div className="w-20">{intervalSelect("header-refresh-interval")}</div>
        </div>
        {refreshButton()}
      </div>
    </>
  );
}
