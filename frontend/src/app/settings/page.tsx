"use client";

import React, { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [formData, setFormData] = useState({
    host: '',
    port: '',
    user: '',
    password: ''
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/proxy/settings/device');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.config) {
            setFormData({
              host: data.config.host || '',
              port: data.config.port || '830',
              user: data.config.user || '',
              password: data.config.password || '' // usually masked from backend
            });
          }
        }
      } catch (error) {
        console.error("Failed to fetch settings", error);
        setMessage({ type: 'error', text: 'Failed to load device settings.' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await fetch('/api/proxy/settings/device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'Device settings updated successfully!' });
      } else {
        setMessage({ type: 'error', text: data.detail || data.message || 'Failed to update settings.' });
      }
    } catch (error) {
      console.error("Error saving settings", error);
      setMessage({ type: 'error', text: 'An unexpected error occurred while saving.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-slate-400 mt-1">Configure Juniper MX204 device connection parameters.</p>
      </div>

      <div className="glass-panel p-6">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <span className="text-emerald-500">⚙️</span> Device Connection
        </h2>

        {message.text && (
          <div className={`p-4 rounded-md mb-6 ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}>
            {message.text}
          </div>
        )}

        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-slate-800 rounded"></div>
            <div className="h-10 bg-slate-800 rounded"></div>
            <div className="h-10 bg-slate-800 rounded"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Target Host (IP/Domain)</label>
                <input 
                  type="text" 
                  name="host"
                  value={formData.host}
                  onChange={handleChange}
                  placeholder="e.g. 192.168.1.1"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">NETCONF Port</label>
                <input 
                  type="number" 
                  name="port"
                  value={formData.port}
                  onChange={handleChange}
                  placeholder="830"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Username</label>
              <input 
                type="text" 
                name="user"
                value={formData.user}
                onChange={handleChange}
                placeholder="admin"
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Password</label>
              <input 
                type="password" 
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="********"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
              />
              <p className="text-xs text-slate-500">Leave unchanged if you don't want to update the password.</p>
            </div>

            <div className="pt-4 border-t border-slate-700/50 flex justify-end">
              <button 
                type="submit" 
                disabled={isSaving}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
