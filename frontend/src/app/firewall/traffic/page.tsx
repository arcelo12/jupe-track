// Firewall Traffic Chart page
// GET /firewall/traffic?filter=X&counter=Y&hours=1&ls=global

"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { authFetch } from "@/lib/auth";

interface TrafficPoint {
  timestamp: string;
  bps: number;
}

export default function FirewallTrafficPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filterName = searchParams.get("filter") || "";
  const counterName = searchParams.get("counter") || "";
  const ls = (searchParams.get("ls") ?? "global") as string;
  const [hours, setHours] = useState<number>(1);

  const [points, setPoints] = useState<TrafficPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        if (!filterName) {
          // Redirect to summary
          router.replace(pathname + "?filter=" + encodeURIComponent(ls === "EXCH" ? "__EXCH/LIMIT-1G-OUT" : "LIMIT-1G-IN") + "&ls=" + encodeURIComponent(ls));
          return;
        }

        const res = await authFetch(
          `/api/proxy/firewall/traffic?logical_system=${encodeURIComponent(
            ls
          )}&filter=${encodeURIComponent(filterName)}&counter=${encodeURIComponent(
            counterName
          )}&hours=${hours}`
        );
        if (!res.ok) throw new Error(`traffic: ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setPoints(json.points || []);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to fetch traffic";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterName, counterName, ls, hours]);

  if (loading && points.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (error && points.length === 0) {
    return (
      <div className="text-destructive">
        <h2 className="text-lg font-semibold">Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  const maxBps = Math.max(...points.map((p) => p.bps), 1000000); // min 1M for scale
  const limitMbps = 1000; // assumed 1Gbps policer, adjust based on real config later

  return (
    <div className="space-y-4">
      <header className="border-b pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {filterName} – {counterName || "All Terms"}
          </h1>
          <p className="text-xs text-muted-foreground">
            LS: {ls} • Limit target: ~{limitMbps} Mbps (configurable per filter)
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label>
            Range:
            <select
              className="bg-background border rounded px-2 py-1 ml-1"
              value={hours}
              onChange={(e) => {
                setHours(parseFloat(e.target.value));
                // Trigger reload via effect dependency by updating query param
                const params = new URLSearchParams(window.location.search);
                params.set("hours", e.target.value);
                window.history.pushState({}, "", `${pathname}?${params.toString()}`);
              }}
            >
              {[15, 60, 120, 360].map((m) => (
                <option key={m} value={m / 60}>
                  {m}m
                </option>
              ))}
              <option value={24}>24h</option>
              <option value={7 * 24}>7d</option>
            </select>
          </label>
        </div>
      </header>

      {/* Chart */}
      <section className="border rounded p-4 bg-card">
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={points} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => v.split("T")[1]?.slice(0, 5) || v}
              fontSize={12}
            />
            <YAxis
              domain={[0, maxBps * 1.2]}
              tickFormatter={(v) => (v / 1e6).toFixed(0) + " M"}
              label={{ value: "bps", angle: -90, position: "insideLeft" }}
              fontSize={12}
            />
            <Tooltip
              formatter={(val) => [formatBps(Number(val)), "Throughput"]}
              labelFormatter={(lbl) => `Time: ${lbl}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="bps"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="Throughput"
            />
            {/* Limit line via ReferenceLine: tampil di chart, tidak ikut tooltip data */}
            <ReferenceLine
              y={limitMbps * 1e6}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{ value: `Limit ${limitMbps} Mbps`, position: "insideTopRight", fontSize: 11 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Quick summary */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <SummaryItem
          label="Max rate"
          value={maxValueLabel(points)}
        />
        <SummaryItem
          label="Avg rate"
          value={avgValueLabel(points)}
        />
        <SummaryItem
          label="Over-limit %"
          value={overLimitPct(points, limitMbps * 1e6)}
        />
      </section>
    </div>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border rounded p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold mt-1">{value}</div>
    </div>
  );
}

function formatBps(bps: number): string {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(2)} kbps`;
  return `${bps.toFixed(0)} bps`;
}

function maxValueLabel(pts: TrafficPoint[]): string {
  if (pts.length === 0) return "—";
  const max = Math.max(...pts.map((p) => p.bps));
  return formatBps(max);
}

function avgValueLabel(pts: TrafficPoint[]): string {
  if (pts.length === 0) return "—";
  const sum = pts.reduce((acc, p) => acc + p.bps, 0);
  return formatBps(sum / pts.length);
}

function overLimitPct(pts: TrafficPoint[], limitBps: number): string {
  if (pts.length === 0) return "—";
  const over = pts.filter((p) => p.bps > limitBps).length;
  return ((over / pts.length) * 100).toFixed(1) + "%";
}
