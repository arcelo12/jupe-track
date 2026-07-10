import React, { useState, useEffect } from 'react';
import { X, Server, Globe, Building, ShieldAlert } from 'lucide-react';
import { LookupResultViewer } from './LookupResultViewer';
import { authFetch } from '@/lib/auth';

interface LookupModalProps {
  query: string;
  type: 'asn' | 'ip' | 'community';
  onClose: () => void;
}

export const LookupModal = ({ query, type, onClose }: LookupModalProps) => {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        let endpoint = '';
        if (type === 'asn') {
          endpoint = `/api/proxy/lookup/asn/${query.replace(/as/i, '')}`;
        } else if (type === 'ip') {
          endpoint = `/api/proxy/lookup/ip/${query}`;
        } else if (type === 'community') {
          endpoint = `/api/proxy/lookup/community/${query}`;
        }

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
        setResult(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [query, type]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 opacity-100 transition-opacity duration-300">
      <div className="absolute inset-0 bg-surface-container/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative glass-panel w-full max-w-3xl shadow-none border-[#2A2E35] overflow-hidden flex flex-col max-h-[85vh] p-0 transform scale-100 transition-transform duration-300">
        
        {/* Modal Header */}
        <div className="flex justify-between items-start border-b border-[#2A2E35] p-6 bg-surface-container-high">
          <div>
            <h2 className="text-2xl font-bold text-on-surface flex items-center gap-3 capitalize">
              {type === 'asn' && <Server className="text-primary" size={24} />}
              {type === 'ip' && <Globe className="text-primary" size={24} />}
              {type === 'community' && <Building className="text-primary" size={24} />}
              {type} Lookup: {query}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-all p-2 bg-surface-container-highest hover:bg-error/20 hover:text-error rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6 flex-1 bg-surface-container">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-on-surface-variant">Fetching lookup data...</span>
            </div>
          )}

          {!loading && error && (
            <div className="bg-error/10 border border-error/30 text-error p-4 rounded-lg flex items-center gap-3">
              <ShieldAlert size={20} />
              {error}
            </div>
          )}

          {!loading && result && (
            <LookupResultViewer result={result} />
          )}
        </div>
      </div>
    </div>
  );
};
