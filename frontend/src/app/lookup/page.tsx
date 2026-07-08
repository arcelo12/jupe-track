"use client";

import React, { useState } from 'react';
import { authFetch } from '@/lib/auth';
import { Search, Server, Globe, MapPin, Building, ShieldAlert } from 'lucide-react';
import { LookupResultViewer } from '@/components/ui/LookupResultViewer';

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
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-100">Global Lookup</h1>
        <p className="text-gray-400 mt-2">Lookup ASN, IP, or BGP Community via RIPEstat</p>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 p-6">
        <form onSubmit={handleSearch} className="flex gap-4">
          <select 
            value={queryType}
            onChange={(e) => setQueryType(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="auto">Auto Detect</option>
            <option value="asn">ASN</option>
            <option value="ip">IP Address</option>
            <option value="routing">Routing (Prefix/ASN)</option>
            <option value="community">BGP Community</option>
          </select>
          
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter ASN, IP, CIDR, or Community (e.g., AS2914, 8.8.8.8, 1.1.1.0/24)"
              className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {loading ? 'Searching...' : 'Lookup'}
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500/50 text-red-200 p-4 rounded-lg flex items-center gap-3">
          <ShieldAlert size={20} />
          {error}
        </div>
      )}

      {result && (
        <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
          <div className="bg-gray-900/50 p-4 border-b border-gray-700 flex items-center gap-2">
            {result.type === 'asn' && <Server className="text-blue-400" />}
            {result.type === 'ip' && <Globe className="text-green-400" />}
            {result.type === 'routing' && <Globe className="text-cyan-400" />}
            {result.type === 'community' && <Building className="text-purple-400" />}
            <h2 className="text-xl font-bold text-white capitalize">{result.type} Lookup Results</h2>
          </div>
          
          <div className="p-6">
            <LookupResultViewer result={result.data} />
          </div>
        </div>
      )}
    </div>
  );
}
