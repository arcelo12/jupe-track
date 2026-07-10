"use client";

import React, { useState } from 'react';
import { authFetch } from '@/lib/auth';
import { Search, Server, Globe, MapPin, Building, ShieldAlert } from 'lucide-react';
import { LookupResultViewer } from '@/components/ui/LookupResultViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LookupPage() {
  const [query, setQuery] = useState('');
  const [queryType, setQueryType] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

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

    const type = queryType === 'auto' ? detectQueryType(query) : queryType;
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
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON response (status ${res.status}): ${text.substring(0, 100)}`);
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch data');
      }
      setResult({ type, data });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold font-display tracking-tight flex items-center gap-3 text-primary">
          <Globe className="text-primary" size={28} />
          Global Route Lookup
        </h1>
        <p className="text-on-surface-variant mt-2 text-sm">
          Query ASN, IP, or BGP Community routing status via RIPE Stat Looking Glass.
        </p>
      </div>

      <Card className="bg-surface-container border-[#2A2E35] shadow-none rounded">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <select 
              value={queryType}
              onChange={(e) => setQueryType(e.target.value)}
              className="flex h-10 w-full md:w-48 items-center justify-between rounded border border-[#2A2E35] bg-surface-container-high px-3 py-2 text-sm text-on-surface ring-offset-surface-container focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
            >
              <option value="auto">Auto Detect</option>
              <option value="asn">ASN</option>
              <option value="ip">IP Address</option>
              <option value="routing">Routing (Prefix/ASN)</option>
              <option value="community">BGP Community</option>
            </select>
            
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-on-surface-variant" size={18} />
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter ASN, IP, CIDR, or Community (e.g., AS2914, 8.8.8.8, 1.1.1.0/24)"
                className="w-full bg-surface-container-high border-[#2A2E35] text-on-surface rounded pl-10 h-10 focus-visible:ring-primary"
              />
            </div>
            
            <Button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-primary hover:bg-primary-hover text-on-primary h-10 px-8 rounded transition-all font-semibold w-full md:w-auto shadow-none"
            >
              {loading ? 'Searching...' : 'Lookup'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-error/10 border border-error/30 text-error p-4 rounded flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2">
          <ShieldAlert size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="bg-surface-container-low border-[#2A2E35] rounded shadow-none overflow-hidden">
            <CardHeader className="bg-surface-container-high border-b border-[#2A2E35] py-4">
              <CardTitle className="flex items-center gap-3 text-lg text-on-surface">
                {result.type === 'asn' && <Server className="text-primary" size={20} />}
                {result.type === 'ip' && <Globe className="text-primary" size={20} />}
                {result.type === 'routing' && <Globe className="text-primary" size={20} />}
                {result.type === 'community' && <Building className="text-[#a28c85]" size={20} />}
                <span className="capitalize">{result.type} Lookup Results</span>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="p-0 md:p-6">
              <LookupResultViewer result={result.data} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
