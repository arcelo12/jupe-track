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
    <div style={{
      display: "flex", gap: "1rem", flexWrap: "wrap",
      background: "rgba(8,15,26,0.3)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "1rem", marginBottom: "1.5rem"
    }}>
      <div style={{ flex: "1 1 auto", minWidth: 150 }}>
        <p style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>System Model</p>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#cbd5e1", marginTop: 4 }}>{status.hw_model}</p>
      </div>

      <div style={{ flex: "1 1 auto", minWidth: 120 }}>
        <p style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>RE CPU Usage</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <p style={{ fontSize: "1.1rem", fontWeight: 600, color: status.cpu_usage > 80 ? "#ef4444" : "#06b6d4" }}>
            {status.cpu_usage}%
          </p>
          <div style={{ width: 60, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${status.cpu_usage}%`, background: status.cpu_usage > 80 ? "#ef4444" : "#06b6d4" }} />
          </div>
        </div>
      </div>

      <div style={{ flex: "1 1 auto", minWidth: 120 }}>
        <p style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Memory (Buffer)</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <p style={{ fontSize: "1.1rem", fontWeight: 600, color: status.memory_utilization > 80 ? "#ef4444" : "#8b5cf6" }}>
            {status.memory_utilization}%
          </p>
          <div style={{ width: 60, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${status.memory_utilization}%`, background: status.memory_utilization > 80 ? "#ef4444" : "#8b5cf6" }} />
          </div>
        </div>
      </div>

      <div style={{ flex: "1 1 auto", minWidth: 100 }}>
        <p style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Temperature</p>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: status.re_temperature > 65 ? "#ef4444" : "#10b981", marginTop: 4 }}>
          {status.re_temperature > 0 ? `${status.re_temperature}°C` : "N/A"}
        </p>
      </div>

      <div style={{ flex: "1 1 auto", minWidth: 120 }}>
        <p style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Uptime</p>
        <p style={{ fontSize: "1.1rem", fontWeight: 500, color: "#cbd5e1", marginTop: 4 }}>
          {formatUptime(status.uptime_seconds)}
        </p>
      </div>
    </div>
  );
}
