"use client";

import React, { useState } from 'react';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Server,
  Globe,
  Building,
  ShieldAlert,
  Network,
  Loader2,
  History,
  X,
  CheckCircle2,
} from 'lucide-react';
import { LookupResultViewer, type LookupResultData } from '@/components/ui/LookupResultViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LookupPage() {
  const { logicalSystem } = useRefresh();
  const [query, setQuery] = useState('');
  const [queryType, setQueryType] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: string; data: LookupResultData } | null>(null);
  const [error, setError] = useState('');
  const [resolvedType, setResolvedType] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');

  const QUERY_TYPES = [
    { value: 'auto', label: 'Auto Detect' },
    { value: 'asn', label: 'ASN' },
    { value: 'ip', label: 'IP Address' },
    { value: 'routing', label: 'Routing (Prefix/ASN)' },
    { value: 'community', label: 'BGP Community' },
  ] as const;

  const EXAMPLES = [
    { label: 'AS2914', value: 'AS2914', type: 'asn' },
    { label: '8.8.8.8', value: '8.8.8.8', type: 'ip' },
    { label: '1.1.1.0/24', value: '1.1.1.0/24', type: 'routing' },
    { label: '2914:420', value: '2914:420', type: 'community' },
  ] as const;

  const detectQueryType = (input: string) => {
    input = input.trim();
    if (input.includes(':')) return 'community';
    if (input.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+$/)) return 'routing';
    if (input.match(/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)) return 'ip';
    if (input.toLowerCase().startsWith('as') || input.match(/^[0-9]+$/)) return 'asn';
    return 'routing'; // fallback to routing for everything else
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);
    setResolvedType(null);

    const type = queryType === 'auto' ? detectQueryType(query) : queryType;
    setResolvedType(type);
    setSearchedQuery(query.trim());
    let endpoint = '';

    if (type === 'asn') {
      endpoint = `/api/proxy/lookup/asn/${query.replace(/as/i, '')}`;
    } else if (type === 'ip') {
      endpoint = `/api/proxy/lookup/ip/${query}`;
    } else if (type === 'community') {
      endpoint = `/api/proxy/lookup/community/${query}`;
    } else if (type === 'routing') {
      endpoint = `/api/proxy/lookup/routing/${encodeURIComponent(query)}`;
    }

    try {
      const res = await authFetch(endpoint);
      const text = await res.text();
      let data: LookupResultData;
      try {
        data = JSON.parse(text) as LookupResultData;
      } catch {
        throw new Error(`Invalid JSON response (status ${res.status}): ${text.substring(0, 100)}`);
      }
      if (!res.ok) {
        const errorMsg =
          typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Failed to fetch data';
        throw new Error(errorMsg);
      }
      setResult({ type, data });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
  };

  return (
    <div className="min-w-0 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            External Intelligence / RIPE Stat
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded border border-primary/20 bg-primary/10"
            >
              <Globe className="text-primary" size={20} />
            </span>
            <h1 className="font-display text-3xl font-bold tracking-tight text-primary">
              Global Route Lookup
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Query ASN, IP, prefix routing status, and BGP communities via the RIPE Stat looking glass.
          </p>
        </div>

        <Badge
          variant="outline"
          className="w-fit rounded border-outline-variant bg-surface-container font-mono text-xs text-on-surface-variant"
        >
          System · {logicalSystem || 'default'}
        </Badge>
      </div>

      {/* Search and Query Form Card */}
      <Card className="min-w-0 overflow-hidden rounded border-outline-variant bg-surface-container shadow-none">
        <CardContent className="p-5">
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 lg:flex-row"
            role="search"
            aria-label="Global route lookup"
          >
            <div className="w-full lg:w-56">
              <label htmlFor="lookup-type" className="sr-only">
                Query Type
              </label>
              <select
                id="lookup-type"
                value={queryType}
                onChange={(e) => setQueryType(e.target.value)}
                aria-label="Query type"
                className="h-10 w-full cursor-pointer rounded border border-outline-variant bg-surface-container-high px-3 py-2 text-sm text-on-surface outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary"
              >
                {QUERY_TYPES.map((t) => (
                  <option key={t.value} value={t.value} className="bg-surface-container-high text-on-surface">
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                size={16}
              />
              <label htmlFor="lookup-query" className="sr-only">
                Target query (ASN, IP, CIDR, or BGP community)
              </label>
              <Input
                id="lookup-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter ASN, IP, CIDR, or community (e.g. AS2914, 8.8.8.8, 1.1.1.0/24)"
                className="h-10 w-full rounded border-outline-variant bg-surface-container-high pl-9 pr-9 text-on-surface shadow-none focus-visible:ring-primary"
                autoComplete="off"
                spellCheck={false}
                aria-label="Lookup target"
                aria-required="true"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Clear query input"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || !query.trim()}
              aria-label={loading ? 'Searching…' : 'Lookup routing data'}
              className="h-10 w-full rounded px-8 font-semibold shadow-none lg:w-auto"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 aria-hidden="true" size={16} className="animate-spin" />
                  Searching…
                </span>
              ) : (
                'Lookup'
              )}
            </Button>
          </form>

          {/* Quick Examples */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant/40 pt-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              <History aria-hidden="true" size={12} />
              Try
            </span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setQuery(ex.value);
                  setQueryType(ex.type);
                }}
                className="rounded border border-outline-variant bg-surface-container-high px-2.5 py-1 font-mono text-xs text-on-surface transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Query Resolution Status */}
      {resolvedType && (result || error) && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded border border-outline-variant bg-surface-container px-3 py-2 text-xs text-on-surface-variant"
        >
          <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
          <span>Resolved</span>
          <span className="font-mono font-semibold text-primary">{searchedQuery || query}</span>
          <span>as</span>
          <Badge
            variant="outline"
            className="rounded border-primary/30 bg-primary/10 font-mono text-[11px] uppercase text-primary"
          >
            {resolvedType}
          </Badge>
          {queryType === 'auto' && <span className="text-on-surface-variant/80">(auto-detected)</span>}
          <span className="text-on-surface-variant/50">·</span>
          <span className="text-on-surface-variant/80">via RIPE Stat looking glass</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center gap-3 rounded border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <ShieldAlert aria-hidden="true" size={18} className="shrink-0" />
          <p className="font-mono text-xs">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="flex min-h-52 flex-col items-center justify-center gap-3 rounded border border-outline-variant bg-surface-container-low px-4 py-12 text-center"
        >
          <Loader2 aria-hidden="true" size={24} className="animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium text-on-surface">Querying RIPE Stat looking glass…</p>
            <p className="mt-1 font-mono text-xs text-on-surface-variant">
              Fetching routing telemetry for {searchedQuery || query}
            </p>
          </div>
        </div>
      )}

      {/* Empty Initial State */}
      {!loading && !result && !error && (
        <div className="rounded border border-outline-variant bg-surface-container-low p-6 md:p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <span
              aria-hidden="true"
              className="mb-3 flex h-12 w-12 items-center justify-center rounded border border-outline-variant bg-surface-container text-on-surface-variant"
            >
              <Network size={24} className="opacity-70 text-primary" />
            </span>
            <h2 className="text-base font-semibold text-on-surface">Ready for Global Route Query</h2>
            <p className="mt-1 max-w-lg text-xs text-on-surface-variant">
              Query external routing telemetry from RIPE Stat route collectors across global Internet exchange points.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-outline-variant bg-surface-container p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Server size={14} aria-hidden="true" />
                <span>ASN Overview</span>
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                Autonomous system holder, registry, and routing status.
              </p>
              <span className="mt-2 inline-block font-mono text-[10px] text-on-surface-variant/80">
                e.g. AS2914 or 2914
              </span>
            </div>

            <div className="rounded border border-outline-variant bg-surface-container p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Globe size={14} aria-hidden="true" />
                <span>IP Address</span>
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                Origin ASN, announcing prefix, and allocation details.
              </p>
              <span className="mt-2 inline-block font-mono text-[10px] text-on-surface-variant/80">
                e.g. 8.8.8.8
              </span>
            </div>

            <div className="rounded border border-outline-variant bg-surface-container p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Network size={14} aria-hidden="true" />
                <span>CIDR / Prefix</span>
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                RRC looking glass visibility across global route collectors.
              </p>
              <span className="mt-2 inline-block font-mono text-[10px] text-on-surface-variant/80">
                e.g. 1.1.1.0/24
              </span>
            </div>

            <div className="rounded border border-outline-variant bg-surface-container p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Building size={14} aria-hidden="true" />
                <span>BGP Community</span>
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                Inspect AS context and policy guidance for BGP communities.
              </p>
              <span className="mt-2 inline-block font-mono text-[10px] text-on-surface-variant/80">
                e.g. 2914:420
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Result Display */}
      {result && (
        <Card className="min-w-0 overflow-hidden rounded border-outline-variant bg-surface-container-low shadow-none">
          <CardHeader className="border-b border-outline-variant bg-surface-container px-5 py-4">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base text-on-surface">
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 items-center justify-center rounded border border-primary/20 bg-primary/10"
                >
                  {result.type === 'asn' && <Server className="shrink-0 text-primary" size={15} />}
                  {result.type === 'ip' && <Globe className="shrink-0 text-primary" size={15} />}
                  {result.type === 'routing' && <Network className="shrink-0 text-primary" size={15} />}
                  {result.type === 'community' && <Building className="shrink-0 text-primary" size={15} />}
                </span>
                <span className="truncate font-semibold capitalize">{result.type} Lookup Results</span>
              </span>

              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded border-outline-variant bg-surface-container-high font-mono text-xs text-on-surface-variant"
                >
                  {result.type.toUpperCase()}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded border-primary/30 bg-primary/10 font-mono text-xs text-primary"
                >
                  {searchedQuery}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-4 md:p-6">
            <LookupResultViewer result={result.data} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
