"use client";

import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/auth';
import { Bookmark, Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ASMapping {
  asn: string;
  name: string;
  type: string;
}

export default function ASMappingSettings() {
  const [mappings, setMappings] = useState<ASMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [editingAsn, setEditingAsn] = useState<string | null>(null);
  
  const [formAsn, setFormAsn] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('Transit'); // default

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/proxy/as-mapping');
      if (res.ok) {
        const data = await res.json();
        setMappings(data);
      } else {
        throw new Error("Failed to load AS Mappings");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await authFetch('/api/proxy/as-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asn: formAsn,
          name: formName,
          type: formType,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to save mapping");
      }

      await fetchMappings();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (asn: string) => {
    if (!confirm(`Are you sure you want to delete mapping for AS${asn}?`)) return;
    setError(null);
    try {
      const res = await authFetch(`/api/proxy/as-mapping/${asn}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error("Failed to delete mapping");
      }
      await fetchMappings();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingAsn(null);
    setFormAsn('');
    setFormName('');
    setFormType('Transit');
  };

  const startEdit = (m: ASMapping) => {
    setEditingAsn(m.asn);
    setIsAdding(true);
    setFormAsn(m.asn);
    setFormName(m.name);
    setFormType(m.type);
  };

  const getTypeColor = (type: string) => {
    switch(type.toLowerCase()) {
      case 'transit': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'ix': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'peer': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'customer': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Bookmark className="text-emerald-400" size={28} />
          </div>
          AS Mappings
        </h1>
        <p className="text-slate-400 mt-2">
          Manage known Autonomous System (AS) numbers, their names, and connection types (Transit, IX, Peer, Customer). 
          This data will enrich topologies and route views across the dashboard.
        </p>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 text-rose-300 text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          {error}
        </div>
      )}

      {/* Form / Editor */}
      {isAdding && (
        <Card className="bg-slate-950/50 border-emerald-500/30 backdrop-blur-xl shadow-xl">
          <CardHeader className="pb-4 border-b border-white/5 bg-slate-900/30">
            <CardTitle className="text-lg flex items-center gap-2">
              {editingAsn ? 'Edit Mapping' : 'Add New Mapping'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ASN</label>
                <Input
                  required
                  disabled={!!editingAsn}
                  value={formAsn}
                  onChange={e => setFormAsn(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 15169"
                  className="bg-slate-900/50 border-slate-800"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Organization Name</label>
                <Input
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Google LLC"
                  className="bg-slate-900/50 border-slate-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 ring-offset-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer"
                >
                  <option value="Transit">Transit</option>
                  <option value="IX">IX</option>
                  <option value="Peer">Peer</option>
                  <option value="Customer">Customer</option>
                  <option value="Internal">Internal</option>
                </select>
              </div>
              <div className="md:col-span-4 flex gap-3 justify-end mt-2">
                <Button type="button" variant="ghost" onClick={resetForm} className="text-slate-400 hover:text-white">
                  Cancel
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2">
                  <Save size={16} /> {editingAsn ? 'Save Changes' : 'Add Mapping'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card className="bg-slate-950/50 border-white/5 backdrop-blur-xl shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-white/5 bg-slate-900/30">
          <div>
            <CardTitle className="text-lg">Configured Mappings</CardTitle>
            <CardDescription>Hover metadata available for {mappings.length} networks</CardDescription>
          </div>
          {!isAdding && (
            <Button onClick={() => setIsAdding(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 h-9 text-xs">
              <Plus size={14} /> Add Mapping
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500 animate-pulse">Loading mappings...</div>
          ) : mappings.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <p className="mb-2">No AS Mappings found.</p>
              <p className="text-sm">Click "Add Mapping" to define names and types for Autonomous Systems.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 bg-slate-900/50 uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4 font-semibold">ASN</th>
                    <th className="px-6 py-4 font-semibold">Organization Name</th>
                    <th className="px-6 py-4 font-semibold">Connection Type</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {mappings.map((m) => (
                    <tr key={m.asn} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-3 font-mono text-emerald-400">AS{m.asn}</td>
                      <td className="px-6 py-3 font-medium text-slate-200">{m.name}</td>
                      <td className="px-6 py-3">
                        <Badge variant="outline" className={`px-2 py-0.5 text-[10px] ${getTypeColor(m.type)}`}>
                          {m.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEdit(m)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors" title="Edit">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => handleDelete(m.asn)} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
