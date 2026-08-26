"use client";

import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { CHART_AXIS, CHART_GRID, CHART_IN, CHART_OUT, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from "@/lib/chart-colors";

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
  
  // If we are dealing with data spanning multiple days, showing date is helpful.
  // For simplicity, let's just return MM/DD HH:MM
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${month}/${day} ${time}`;
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload: any }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: CHART_TOOLTIP_BG,
      border: `1px solid ${CHART_TOOLTIP_BORDER}`,
      borderRadius: "4px",
      padding: "10px 14px",
      fontSize: "12px",
      boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
    }}>
      <p style={{ color: "#94a3b8", marginBottom: 6, fontSize: "10px", fontWeight: "bold" }}>
        {label ? formatTime(label) : ""}
      </p>
      {payload.map((entry, i) => {
        // Read original bps value for tooltip
        const bpsVal = entry.name === "Ingress Mbps" ? entry.payload.bps_in : entry.payload.bps_out;
        return (
          <p key={i} style={{ color: entry.color, margin: "2px 0", fontWeight: 500 }}>
            {entry.name}: <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>{formatBps(bpsVal)}</span>
          </p>
        );
      })}
    </div>
  );
};

export function InterfaceTrafficChart({ data, interfaceName }: InterfaceTrafficChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[200px] w-full items-center justify-center rounded border border-dashed border-[#2A2E35] bg-transparent p-4 text-sm text-on-surface-variant">
        No historical data yet — data will appear after the first scrape cycle
      </div>
    );
  }

  // Ensure data is sorted by time ascending
  const sortedData = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const formatted = sortedData.map(d => ({
    ...d,
    time: d.timestamp, // Use the raw timestamp as unique X-axis key
    in_mbps: Number((d.bps_in / 1_000_000).toFixed(2)),
    out_mbps: Number((d.bps_out / 1_000_000).toFixed(2)),
  }));

  const safeName = interfaceName.replace(/[/\.]/g, '-');

  return (
    <div className="h-[260px] w-full overflow-hidden rounded border-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formatted} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id={`colorInHistory-${safeName}`} x1="0" y1="0" x2="0" y2="1">
               <stop offset="5%" stopColor={CHART_IN} stopOpacity={0.35}/>
               <stop offset="95%" stopColor={CHART_IN} stopOpacity={0}/>
             </linearGradient>
             <linearGradient id={`colorOutHistory-${safeName}`} x1="0" y1="0" x2="0" y2="1">
               <stop offset="5%" stopColor={CHART_OUT} stopOpacity={0.35}/>
               <stop offset="95%" stopColor={CHART_OUT} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
          <XAxis
            dataKey="time"
            stroke={CHART_AXIS} 
            fontSize={10} 
            tickMargin={8} 
            minTickGap={30}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => formatTime(val)}
          />
          <YAxis
            stroke={CHART_AXIS} 
            fontSize={10} 
            tickFormatter={(v) => `${v}M`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
          <Area
            type="monotone"
            dataKey="in_mbps"
            name="Ingress Mbps"
            stroke={CHART_IN}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#colorInHistory-${safeName})`}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="out_mbps"
            name="Egress Mbps"
            stroke={CHART_OUT}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#colorOutHistory-${safeName})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
