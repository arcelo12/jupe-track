"use client";

import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

interface BGPPoint {
  timestamp: string;
  state: string | null;
  active_prefixes: number;
  received_prefixes: number;
}

interface BGPPrefixChartProps {
  data: BGPPoint[];
  peerAddress: string;
  compact?: boolean;
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
          {entry.name}: <span style={{ fontFamily: "monospace" }}>{entry.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

export function BGPPrefixChart({ data, peerAddress, compact = false }: BGPPrefixChartProps) {
  const height = compact ? 80 : 180;

  if (!data || data.length === 0) {
    return (
      <div style={{
        height,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#334155", fontSize: "0.78rem",
        border: "1px dashed rgba(255,255,255,0.05)", borderRadius: 8,
      }}>
        Awaiting data...
      </div>
    );
  }

  // Ensure data is sorted by time ascending
  const sortedData = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const formatted = sortedData.map(d => ({
    time: formatTime(d.timestamp),
    active: d.active_prefixes,
    received: d.received_prefixes,
    state: d.state,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-a-${peerAddress}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`grad-r-${peerAddress}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
          </linearGradient>
        </defs>
        {!compact && (
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        )}
        {!compact && (
          <XAxis
            dataKey="time"
            tick={{ fill: "#475569", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
        )}
        {!compact && (
          <YAxis
            tick={{ fill: "#475569", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
        )}
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="received"
          name="Received Prefixes"
          stroke="#06b6d4"
          strokeWidth={compact ? 1.5 : 2}
          fill={`url(#grad-r-${peerAddress})`}
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="active"
          name="Active Prefixes"
          stroke="#10b981"
          strokeWidth={compact ? 1.5 : 2}
          fill={`url(#grad-a-${peerAddress})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
