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
      case 'transit': return 'bg-primary/10 text-primary border-primary/20';
      case 'ix': return 'bg-[#a28c85]/10 text-[#a28c85] border-[#a28c85]/20';
      case 'peer': return 'bg-primary/10 text-primary border-primary/20';
      case 'customer': return 'bg-[#a28c85]/10 text-[#a28c85] border-[#a28c85]/20';
      default: return 'bg-surface-container-highest text-on-surface-variant border-[#2A2E35]';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bookmark className="text-primary" size={28} />
          </div>
          AS Mappings
        </h1>
        <p className="text-on-surface-variant mt-2">
          Manage known Autonomous System (AS) numbers, their names, and connection types (Transit, IX, Peer, Customer). 
          This data will enrich topologies and route views across the dashboard.
        </p>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-error text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-error"></span>
          {error}
        </div>
      )}

      {/* Form / Editor */}
      {isAdding && (
        <Card className="bg-surface-container border-[#2A2E35] backdrop-blur-xl shadow-none">
          <CardHeader className="pb-4 border-b border-[#2A2E35] bg-surface-container-high">
            <CardTitle className="text-lg flex items-center gap-2">
              {editingAsn ? 'Edit Mapping' : 'Add New Mapping'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">ASN</label>
                <Input
                  required
                  disabled={!!editingAsn}
                  value={formAsn}
                  onChange={e => setFormAsn(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 15169"
                  className="bg-surface-container-high border-[#2A2E35]"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Organization Name</label>
                <Input
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Google LLC"
                  className="bg-surface-container-high border-[#2A2E35]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Type</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-[#2A2E35] bg-surface-container-high px-3 py-2 text-sm text-on-surface ring-offset-surface-container focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                >
                  <option value="Transit">Transit</option>
                  <option value="IX">IX</option>
                  <option value="Peer">Peer</option>
                  <option value="Customer">Customer</option>
                  <option value="Internal">Internal</option>
                </select>
              </div>
              <div className="md:col-span-4 flex gap-3 justify-end mt-2">
                <Button type="button" variant="ghost" onClick={resetForm} className="text-on-surface-variant hover:text-on-surface">
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary-hover text-on-primary gap-2">
                  <Save size={16} /> {editingAsn ? 'Save Changes' : 'Add Mapping'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card className="bg-surface-container border-[#2A2E35] backdrop-blur-xl shadow-none">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-[#2A2E35] bg-surface-container-high">
          <div>
            <CardTitle className="text-lg text-on-surface">Configured Mappings</CardTitle>
            <CardDescription>Hover metadata available for {mappings.length} networks</CardDescription>
          </div>
          {!isAdding && (
            <Button onClick={() => setIsAdding(true)} className="bg-primary hover:bg-primary-hover text-on-primary gap-2 h-9 text-xs">
              <Plus size={14} /> Add Mapping
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-on-surface-variant animate-pulse">Loading mappings...</div>
          ) : mappings.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant">
              <p className="mb-2">No AS Mappings found.</p>
              <p className="text-sm">Click "Add Mapping" to define names and types for Autonomous Systems.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-on-surface-variant bg-surface-container-high uppercase border-b border-[#2A2E35]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">ASN</th>
                    <th className="px-6 py-4 font-semibold">Organization Name</th>
                    <th className="px-6 py-4 font-semibold">Connection Type</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A2E35]">
                  {mappings.map((m) => (
                    <tr key={m.asn} className="hover:bg-surface-container-highest transition-colors">
                      <td className="px-6 py-3 font-mono text-primary">AS{m.asn}</td>
                      <td className="px-6 py-3 font-medium text-on-surface">{m.name}</td>
                      <td className="px-6 py-3">
                        <Badge variant="outline" className={`px-2 py-0.5 text-[10px] ${getTypeColor(m.type)}`}>
                          {m.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => startEdit(m)} className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded transition-colors" title="Edit">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => handleDelete(m.asn)} className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded transition-colors" title="Delete">
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
