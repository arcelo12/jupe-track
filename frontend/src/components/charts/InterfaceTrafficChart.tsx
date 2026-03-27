"use client";

import React, { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

interface DataPoint {
  timestamp: string;
  bps_in: number;
  bps_out: number;
}

interface InterfaceTrafficChartProps {
  data: DataPoint[];
  interfaceName: string;
}

function formatBps(bps: number): string {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(2)} Kbps`;
  return `${bps} bps`;
}

function formatTime(ts: string): string {
  // Ensure we treat the naive string from the DB as UTC by appending 'Z'
  const utcTs = ts.endsWith('Z') || ts.includes('+') ? ts : `${ts}Z`;
  const d = new Date(utcTs);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(8,15,26,0.95)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "10px",
      padding: "10px 14px",
      fontSize: "0.78rem",
      boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    }}>
      <p style={{ color: "#94a3b8", marginBottom: 6, fontSize: "0.72rem" }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, margin: "2px 0", fontWeight: 500 }}>
          {entry.name}: <span style={{ fontFamily: "monospace" }}>{formatBps(entry.value)}</span>
        </p>
      ))}
    </div>
  );
};

export function InterfaceTrafficChart({ data, interfaceName }: InterfaceTrafficChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height: 200, display: "flex", alignItems: "center", justifyContent: "center",
        color: "#475569", fontSize: "0.85rem",
        border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 10,
      }}>
        No historical data yet — data will appear after the first scrape cycle
      </div>
    );
  }

  const formatted = data.map(d => ({
    ...d,
    time: formatTime(d.timestamp),
    bps_in_val: d.bps_in,
    bps_out_val: d.bps_out,
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: "0.78rem", color: "#64748b", fontFamily: "monospace" }}>
          {interfaceName}
        </span>
        <div style={{ display: "flex", gap: 16, fontSize: "0.72rem" }}>
          <span style={{ color: "#06b6d4" }}>● IN</span>
          <span style={{ color: "#8b5cf6" }}>● OUT</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: "#475569", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => {
              if (v >= 1e9) return `${(v / 1e9).toFixed(1)}G`;
              if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
              if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
              return String(v);
            }}
            tick={{ fill: "#475569", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="bps_in"
            name="Inbound"
            stroke="#06b6d4"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#06b6d4" }}
          />
          <Line
            type="monotone"
            dataKey="bps_out"
            name="Outbound"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#8b5cf6" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
