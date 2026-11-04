// QoS & Firewall Analytics dashboard
// - Summary cards: live speed per-term, utilization, status badge
// - Drop table: policer drops with total bytes dropped
// - Click-through to /firewall/traffic/[filter]/[term] untuk chart

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth";

interface FirewalFilter {
  name: string;
  logical_system: string;
  counters: FirewallCounter[];
  policers: FirewallPolicer[];
}

interface FirewallCounter {
  name: string;
  bytes: number | bigint;
  packets: number | bigint;
}

interface FirewallPolicer {
  name: string;
  bytes_dropped: number | bigint;
  packets_dropped: number | bigint;
}

interface FiltersResponse {
  logical_system: string;
  filters: FirewalFilter[];
  count: number;
}

interface PolicerStatus {
  filter: string;
  policer: string;
  bytes_dropped: number | bigint;
  packets_dropped: number | bigint;
  is_dropping: boolean;
}

export default function FirewallAnalytics() {
  const [filtersRes, setFiltersRes] = useState<FiltersResponse | null>(null);
  const [policers, setPolicers] = useState<PolicerStatus[]>([]);
  const [ls, setLs] = useState("global");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Fetch all filters
        const fRes = await authFetch(
          `/api/proxy/firewall/filters?logical_system=${encodeURIComponent(ls)}`
        );
        if (!fRes.ok) throw new Error(`filters: ${fRes.status}`);
        const jsonF = await fRes.json();
        if (!cancelled) {
          setFiltersRes(jsonF);

          // Build policers array for summary
          const list: PolicerStatus[] = [];
          jsonF.filters.forEach((f: FirewalFilter) => {
            f.policers.forEach((p) => {
              list.push({
                filter: f.name,
                policer: p.name,
                bytes_dropped: Number(p.bytes_dropped),
                packets_dropped: Number(p.packets_dropped),
                is_dropping: Number(p.packets_dropped) > 0,
              });
            });
          });
          setPolicers(list);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load firewall data";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => {
      cancelled = true;
    };
  }, [ls]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive">
        <h2 className="text-lg font-semibold">Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  const allCounters = filtersRes?.filters.flatMap((f) => f.counters) || [];
  const totalBytesIn = allCounters.reduce((acc, c) => acc + Number(c.bytes), 0);
  const activeFilters = filtersRes?.filters.length || 0;
  const droppingPolicers = policers.filter((p) => p.is_dropping).length;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">QoS & Firewall Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Monitor customer rates and policer drops by filter or by logical system
          </p>
        </div>

        <select
          className="bg-background border rounded px-2 py-1 text-sm"
          value={ls}
          onChange={(e) => setLs(e.target.value)}
        >
          <option value="global">Global</option>
          <option value="EXCH">EXCH</option>
          <option value="__EXCH">__EXCH</option>
        </select>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Active Filters" value={String(activeFilters)} />
        <SummaryCard
          title="Terms Monitored"
          value={String(allCounters.length)}
        />
        <SummaryCard
          title="Total Bytes In (all)"
          value={`${formatByte(totalBytesIn)}`}
        />
        <SummaryCard
          title="Dropping Policers"
          value={String(droppingPolicers)}
          highlight={droppingPolicers > 0}
        />
      </section>

      {/* Filter list with counters preview */}
      <section className="border rounded">
        <div className="px-4 py-2 border-b text-sm font-medium flex items-center justify-between">
          <span>Filters ({filtersRes?.count || 0})</span>
          <Link
            href={`/firewall/traffic`}
            className="text-primary hover:underline text-sm"
          >
            Open traffic details →
          </Link>
        </div>

        {filtersRes?.filters.map((f) => (
          <FilterRow key={f.name} filter={f} ls={ls} />
        ))}
        {(!filtersRes?.filters || filtersRes.filters.length === 0) && (
          <EmptyMessage>No firewall filters found for {ls}.</EmptyMessage>
        )}
      </section>

      {/* Policers (rate limit hits) */}
      <section className="border rounded">
        <div className="px-4 py-2 border-b text-sm font-medium">
          Rate-limiting Status (Policers)
        </div>
        {policers.length === 0 ? (
          <EmptyMessage>No rate-limiting policers detected.</EmptyMessage>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-2">Filter</th>
                <th className="px-4 py-2">Policer</th>
                <th className="px-4 py-2">Drop Pkts</th>
                <th className="px-4 py-2">Drop Bytes</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {policers.map((p) => (
                <tr key={p.filter + "-" + p.policer}>
                  <td className="px-4 py-2">{p.filter}</td>
                  <td className="px-4 py-2">{p.policer}</td>
                  <td className="px-4 py-2">
                    {Number(p.packets_dropped).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    {formatByte(Number(p.bytes_dropped))}
                  </td>
                  <td className="px-4 py-2">
                    {p.is_dropping ? (
                      <Badge color="red">Over-Limit</Badge>
                    ) : (
                      <Badge color="green">Normal</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function FilterRow({ filter, ls }: { filter: FirewalFilter; ls: string }) {
  const terms = filter.counters.map((c) => c.name);
  return (
    <div className="px-4 py-3 border-b last:border-0">
      <div className="font-medium flex items-center justify-between">
        <div>
          {filter.name}{" "}
          <span className="text-xs text-muted-foreground">
            LS: {filter.logical_system || "global"}
          </span>
        </div>
        <Link
          href={`/firewall/traffic?filter=${encodeURIComponent(filter.name)}&ls=${encodeURIComponent(
            ls
          )}${filter.policers[0] ? `&policer=${encodeURIComponent(filter.policers[0].name)}` : ""}`}
          className="text-primary text-sm hover:underline"
        >
          View Chart →
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Terms:</span>
        {terms.length === 0 && <span>—</span>}
        {terms.map((t) => (
          <Link
            key={t}
            href={`/firewall/traffic?filter=${encodeURIComponent(filter.name)}&counter=${encodeURIComponent(t)}&ls=${encodeURIComponent(ls)}${filter.policers[0] ? `&policer=${encodeURIComponent(filter.policers[0].name)}` : ""}`}
            className="rounded border px-1.5 py-0.5 text-primary hover:bg-muted"
          >
            {t}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-4 border rounded ${highlight ? "bg-destructive/5" : ""}`}
    >
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-6 text-sm text-muted-foreground">{children}</div>
  );
}

function Badge({ color, children }: { color: "green" | "red"; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        color === "green"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      }`}
    >
      {children}
    </span>
  );
}

function formatByte(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} kB`;
  return `${n.toLocaleString()} B`;
}
