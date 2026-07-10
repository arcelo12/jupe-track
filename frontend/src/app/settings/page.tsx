"use client";

import React, { useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth';

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
        const res = await authFetch(`/api/proxy/settings/device?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          
          // Handle format: { success: true, config: { host, user, port } }
          if (data.success && data.config) {
            setFormData({
              host: data.config.host || '',
              port: data.config.port || '830',
              user: data.config.user || '',
              password: '' // password not returned from backend
            });
          }
          // Handle flat format: { host, user, port }
          else if (data.host || data.user) {
            setFormData({
              host: data.host || '',
              port: data.port || '830',
              user: data.user || '',
              password: ''
            });
          }
        } else {
          setMessage({ type: 'error', text: `Failed to load settings (HTTP ${res.status}).` });
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
      const res = await authFetch('/api/proxy/settings/device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      if (res.ok && (data.success || data.message)) {
        setMessage({ type: 'success', text: data.message || 'Device settings updated successfully!' });
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
        <h1 className="text-3xl font-bold font-display tracking-tight text-primary">System Settings</h1>
        <p className="text-on-surface-variant mt-1">Configure Juniper MX204 device connection parameters.</p>
      </div>

      <div className="glass-panel p-6 bg-surface-container-low border-[#2A2E35]">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-on-surface">
          <span className="text-primary">⚙️</span> Device Connection
        </h2>

        {message.text && (
          <div className={`p-4 rounded mb-6 ${message.type === 'success' ? 'bg-primary/10 border border-primary/30 text-primary' : 'bg-error/10 border border-error/30 text-error'}`}>
            {message.text}
          </div>
        )}

        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-surface-container-high rounded"></div>
            <div className="h-10 bg-surface-container-high rounded"></div>
            <div className="h-10 bg-surface-container-high rounded"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-on-surface">Target Host (IP/Domain)</label>
                <input 
                  type="text" 
                  name="host"
                  value={formData.host}
                  onChange={handleChange}
                  placeholder="e.g. 192.168.1.1"
                  required
                  className="w-full bg-surface-container-high border border-[#2A2E35] rounded px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-on-surface">NETCONF Port</label>
                <input 
                  type="number" 
                  name="port"
                  value={formData.port}
                  onChange={handleChange}
                  placeholder="830"
                  required
                  className="w-full bg-surface-container-high border border-[#2A2E35] rounded px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-colors"
                />
                <p className="text-xs text-on-surface-variant">Port for NETCONF (default: 830)</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface">Username</label>
              <input 
                type="text" 
                name="user"
                value={formData.user}
                onChange={handleChange}
                placeholder="admin"
                required
                className="w-full bg-surface-container-high border border-[#2A2E35] rounded px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface">Password</label>
              <input 
                type="password" 
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="********"
                className="w-full bg-surface-container-high border border-[#2A2E35] rounded px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              <p className="text-xs text-on-surface-variant">Leave unchanged if you don't want to update the password.</p>
            </div>

            <div className="pt-4 border-t border-[#2A2E35] flex justify-end">
              <button 
                type="submit" 
                disabled={isSaving}
                className="bg-primary hover:bg-primary-hover text-on-primary px-6 py-2.5 rounded font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-on-primary/20 border-t-on-primary rounded-full animate-spin"></div>
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
