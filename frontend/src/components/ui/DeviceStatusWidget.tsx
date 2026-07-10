"use client";

import React, { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

import { useRefresh } from "@/components/RefreshProvider";

interface DeviceStatus {
  cpu_idle: number;
  cpu_usage: number;
  memory_utilization: number;
  re_temperature: number;
  uptime_seconds: number;
  hw_model: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600*24));
  const h = Math.floor(seconds % (3600*24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  return `${d}d ${h}h ${m}m`;
}

export function DeviceStatusWidget() {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const { refreshTrigger, refreshInterval } = useRefresh();

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await authFetch("/api/proxy/metrics/device/status");
        if (res.ok && mounted) {
           setStatus(await res.json());
        }
      } catch (e) {
        console.warn("Failed to fetch device status", e);
      }
    };

    fetchStatus();
    
    if (refreshInterval > 0) {
      const intv = setInterval(fetchStatus, refreshInterval * 1000);
      return () => {
        mounted = false;
        clearInterval(intv);
      };
    }
  }, [refreshTrigger, refreshInterval]);

  if (!status) return null;

  return (
    <div className="flex flex-wrap gap-4 bg-surface-container-high border border-[#2A2E35] rounded-xl p-4 mb-6">
      <div className="flex-1 min-w-[150px]">
        <p className="text-xs text-on-surface-variant uppercase tracking-wider">System Model</p>
        <p className="text-lg font-semibold text-on-surface mt-1">{status.hw_model}</p>
      </div>

      <div className="flex-1 min-w-[120px]">
        <p className="text-xs text-on-surface-variant uppercase tracking-wider">RE CPU Usage</p>
        <div className="flex items-center gap-2 mt-1">
          <p className={`text-lg font-semibold ${status.cpu_usage > 80 ? 'text-error' : 'text-primary'}`}>
            {status.cpu_usage}%
          </p>
          <div className="w-[60px] h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div className={`h-full ${status.cpu_usage > 80 ? 'bg-error' : 'bg-primary'}`} style={{ width: `${status.cpu_usage}%` }} />
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-[120px]">
        <p className="text-xs text-on-surface-variant uppercase tracking-wider">Memory (Buffer)</p>
        <div className="flex items-center gap-2 mt-1">
          <p className={`text-lg font-semibold ${status.memory_utilization > 80 ? 'text-error' : 'text-primary'}`}>
            {status.memory_utilization}%
          </p>
          <div className="w-[60px] h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div className={`h-full ${status.memory_utilization > 80 ? 'bg-error' : 'bg-primary'}`} style={{ width: `${status.memory_utilization}%` }} />
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-[100px]">
        <p className="text-xs text-on-surface-variant uppercase tracking-wider">Temperature</p>
        <p className={`text-lg font-semibold mt-1 ${status.re_temperature > 65 ? 'text-error' : 'text-primary'}`}>
          {status.re_temperature > 0 ? `${status.re_temperature}°C` : "N/A"}
        </p>
      </div>

      <div className="flex-1 min-w-[120px]">
        <p className="text-xs text-on-surface-variant uppercase tracking-wider">Uptime</p>
        <p className="text-lg font-medium text-on-surface mt-1">
          {formatUptime(status.uptime_seconds)}
        </p>
      </div>
    </div>
  );
}
