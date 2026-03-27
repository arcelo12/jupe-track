"use client";

import React, { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/auth";

interface RetentionSettings {
  retention_days_interface: number;
  retention_days_bgp: number;
  scrape_interval_seconds: number;
  scrape_enabled: boolean;
}

interface ScraperStatus {
  enabled: boolean;
  last_scrape_interface: string | null;
  last_scrape_bgp: string | null;
  next_run: string | null;
  total_interface_records: number;
  total_bgp_records: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function SliderInput({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="retention-field">
      <div className="retention-field-header">
        <span>{label}</span>
        <span className="retention-value">{value} {unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="retention-slider"
      />
      <div className="retention-range-labels">
        <span>{min} {unit}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  );
}

export default function RetentionPage() {
  const [settings, setSettings] = useState<RetentionSettings>({
    retention_days_interface: 30,
    retention_days_bgp: 30,
    scrape_interval_seconds: 60,
    scrape_enabled: true,
  });
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [retRes, statusRes] = await Promise.all([
        authFetch("/api/proxy/metrics/retention"),
        authFetch("/api/proxy/metrics/status"),
      ]);
      if (retRes.ok) setSettings(await retRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
    } catch (e) {
      console.error("Failed to fetch retention data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/proxy/metrics/retention", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("success", "Settings saved and scraper rescheduled!");
      fetchData();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === "success" ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Retention</h1>
        <p className="text-slate-400 mt-1">
          Configure how long metrics are stored and how frequently the device is polled.
        </p>
      </div>

      {/* Scraper Status Card */}
      <div className="glass-panel">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${status?.enabled ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-slate-600"}`} />
          Background Scraper Status
        </h2>
        {status && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "Interface Records", val: status.total_interface_records.toLocaleString(), color: "#06b6d4" },
              { label: "BGP Records", val: status.total_bgp_records.toLocaleString(), color: "#8b5cf6" },
              { label: "Next Scrape", val: formatDate(status.next_run), color: "#10b981" },
              { label: "Last Interface Scrape", val: formatDate(status.last_scrape_interface), color: "#94a3b8" },
              { label: "Last BGP Scrape", val: formatDate(status.last_scrape_bgp), color: "#94a3b8" },
              { label: "Status", val: status.enabled ? "Running" : "Paused", color: status.enabled ? "#10b981" : "#ef4444" },
            ].map((item, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                padding: "0.875rem 1rem",
              }}>
                <p style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: 4 }}>{item.label}</p>
                <p style={{ fontSize: "0.9rem", fontWeight: 600, color: item.color, fontFamily: "monospace" }}>
                  {item.val}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Card */}
      <div className="glass-panel">
        <h2 className="text-lg font-semibold mb-6">Settings</h2>

        <div className="space-y-8">
          {/* Enable toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontWeight: 500, fontSize: "0.9rem" }}>Enable Background Scraping</p>
              <p style={{ color: "#64748b", fontSize: "0.78rem", marginTop: 2 }}>
                Keep collecting data even when no browser tab is open
              </p>
            </div>
            <button
              onClick={() => setSettings(s => ({ ...s, scrape_enabled: !s.scrape_enabled }))}
              style={{
                width: 48, height: 26, borderRadius: 13,
                background: settings.scrape_enabled
                  ? "linear-gradient(90deg, #10b981, #06b6d4)"
                  : "rgba(255,255,255,0.1)",
                border: "none", cursor: "pointer", position: "relative",
                transition: "all 0.2s", flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute",
                width: 20, height: 20,
                background: "#fff",
                borderRadius: "50%",
                top: 3,
                left: settings.scrape_enabled ? 25 : 3,
                transition: "left 0.2s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }} />
            </button>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

          <SliderInput
            label="Scrape Interval"
            value={settings.scrape_interval_seconds}
            min={10}
            max={600}
            step={10}
            unit="seconds"
            onChange={v => setSettings(s => ({ ...s, scrape_interval_seconds: v }))}
          />

          <SliderInput
            label="Interface Data Retention"
            value={settings.retention_days_interface}
            min={1}
            max={365}
            unit="days"
            onChange={v => setSettings(s => ({ ...s, retention_days_interface: v }))}
          />

          <SliderInput
            label="BGP Data Retention"
            value={settings.retention_days_bgp}
            min={1}
            max={365}
            unit="days"
            onChange={v => setSettings(s => ({ ...s, retention_days_bgp: v }))}
          />
        </div>

        <div style={{ marginTop: "2rem", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? <span className="spinner-sm" /> : null}
            {saving ? "Saving..." : "Save & Apply"}
          </button>
        </div>
      </div>

      <style>{`
        .toast {
          position: fixed; top: 1.5rem; right: 1.5rem; z-index: 9999;
          padding: 0.75rem 1.25rem;
          border-radius: 10px;
          font-size: 0.85rem;
          font-weight: 500;
          animation: slide-in 0.3s ease;
          box-shadow: 0 8px 25px rgba(0,0,0,0.4);
        }
        .toast-success { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #6ee7b7; }
        .toast-error   { background: rgba(239,68,68,0.15);  border: 1px solid rgba(239,68,68,0.3);  color: #fca5a5; }
        @keyframes slide-in { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform:none; } }

        .retention-field { display: flex; flex-direction: column; gap: 0.5rem; }
        .retention-field-header { display: flex; justify-content: space-between; font-size: 0.85rem; }
        .retention-value { font-weight: 600; color: #06b6d4; font-family: monospace; }
        .retention-slider {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 4px; border-radius: 2px;
          background: linear-gradient(90deg,
            rgb(6,182,212) 0%,
            rgb(6,182,212) var(--val, 50%),
            rgba(255,255,255,0.1) var(--val, 50%)
          );
          cursor: pointer;
        }
        .retention-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px; height: 18px; border-radius: 50%;
          background: #06b6d4;
          box-shadow: 0 0 8px rgba(6,182,212,0.5);
          border: 2px solid rgba(255,255,255,0.2);
          cursor: pointer;
        }
        .retention-range-labels { display: flex; justify-content: space-between; font-size: 0.7rem; color: #475569; }

        .btn-primary {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.625rem 1.5rem;
          background: linear-gradient(135deg, #06b6d4, #3b82f6);
          color: #fff; border: none; border-radius: 8px;
          font-size: 0.875rem; font-weight: 600; cursor: pointer;
          box-shadow: 0 4px 15px rgba(6,182,212,0.3);
          transition: all 0.2s;
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.1); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .spinner {
          width: 32px; height: 32px;
          border: 3px solid rgba(6,182,212,0.2);
          border-top-color: #06b6d4;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .spinner-sm {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
