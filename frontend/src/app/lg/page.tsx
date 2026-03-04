"use client";

import React, { useState } from 'react';
import { useRefresh } from '@/components/RefreshProvider';

const COMMANDS = [
  { value: "show_route", label: "Show Route", icon: "🗺️", needsTarget: true, placeholder: "e.g. 10.0.0.0/8 or leave empty for all" },
  { value: "ping", label: "Ping", icon: "📡", needsTarget: true, placeholder: "e.g. 8.8.8.8" },
  { value: "traceroute", label: "Traceroute", icon: "🔗", needsTarget: true, placeholder: "e.g. 8.8.8.8" },
  { value: "show_bgp_neighbor", label: "Show BGP Neighbor", icon: "🤝", needsTarget: true, placeholder: "Neighbor IP or leave empty for all" },
  { value: "show_bgp_summary", label: "Show BGP Summary", icon: "📊", needsTarget: false, placeholder: "" },
  { value: "show_interfaces", label: "Show Interfaces", icon: "🔌", needsTarget: true, placeholder: "e.g. ge-0/0/0 or leave empty for all" },
];

export default function LookingGlass() {
  const [selectedCommand, setSelectedCommand] = useState(COMMANDS[0].value);
  const [target, setTarget] = useState("");
  const [sourceAddress, setSourceAddress] = useState("");
  const [resolvePtr, setResolvePtr] = useState(false);
  const [resolveAsn, setResolveAsn] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ logs: string[]; execution_time_ms: number; raw_xml_bytes: number; device_model: string; device_hostname: string; device_version: string; timestamp: string } | null>(null);
  const [showDebug, setShowDebug] = useState(true);
  const [history, setHistory] = useState<Array<{ cmd: string; target: string; time: string }>>([]);
  const { refreshTrigger, logicalSystem } = useRefresh();

  // Load initial state from cache
  React.useEffect(() => {
    try {
      const cachedState = localStorage.getItem('junos-lg-state');
      if (cachedState) {
        const state = JSON.parse(cachedState);
        if (state.selectedCommand) setSelectedCommand(state.selectedCommand);
        if (state.target) setTarget(state.target);
        if (state.sourceAddress) setSourceAddress(state.sourceAddress);
        if (state.resolvePtr !== undefined) setResolvePtr(state.resolvePtr);
        if (state.resolveAsn !== undefined) setResolveAsn(state.resolveAsn);
        if (state.output) setOutput(state.output);
        if (state.error) setError(state.error);
        if (state.debugInfo) setDebugInfo(state.debugInfo);
        if (state.history) setHistory(state.history);
      }
    } catch {}
  }, [refreshTrigger]);

  // Save state whenever it changes
  React.useEffect(() => {
    const stateToSave = {
      selectedCommand,
      target,
      sourceAddress,
      resolvePtr,
      resolveAsn,
      output,
      error,
      debugInfo,
      history
    };
    localStorage.setItem('junos-lg-state', JSON.stringify(stateToSave));
  }, [selectedCommand, target, sourceAddress, resolvePtr, resolveAsn, output, error, debugInfo, history]);

  const currentCmd = COMMANDS.find(c => c.value === selectedCommand) || COMMANDS[0];

  const executeCommand = async () => {
    if (currentCmd.needsTarget && !target && ["ping", "traceroute"].includes(selectedCommand)) {
      setError("Target IP/hostname is required for this command.");
      return;
    }
    
    setLoading(true);
    setError(null);
    setOutput(null);
    
    try {
      const res = await fetch('/api/proxy/looking-glass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: selectedCommand,
          target: target || null,
          source_address: sourceAddress || null,
          logical_system: logicalSystem,
          resolve_ptr: resolvePtr,
          resolve_asn: resolveAsn,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setOutput(data.output);
        setDebugInfo(data.debug || null);
        setHistory(prev => [{
          cmd: `${currentCmd.label}${target ? ' ' + target : ''}`,
          target: target,
          time: new Date().toLocaleTimeString()
        }, ...prev].slice(0, 10));
      } else {
        setError(data.error || 'Unknown error occurred');
      }
    } catch {
      setError('Failed to connect to backend. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Looking Glass</h1>
        <p className="text-slate-400 mt-1">Execute read-only diagnostic commands on the MX204.</p>
      </div>

      {/* Command Selector */}
      <div className="glass-panel space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {COMMANDS.map(cmd => (
            <button 
              key={cmd.value}
              onClick={() => { setSelectedCommand(cmd.value); setOutput(null); setError(null); }}
              className={`p-3 rounded-lg border text-left transition-all ${
                selectedCommand === cmd.value 
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 shadow-lg shadow-emerald-500/5' 
                  : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              <div className="text-lg mb-1">{cmd.icon}</div>
              <div className="text-xs font-medium">{cmd.label}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {currentCmd.needsTarget && (
            <div className="flex-1">
              <input
                type="text"
                placeholder={currentCmd.placeholder}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && executeCommand()}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-slate-600 transition-all"
              />
            </div>
          )}

          {(selectedCommand === 'ping' || selectedCommand === 'traceroute') && (
            <div className="w-48">
              <input
                type="text"
                placeholder="Source IP (optional)"
                value={sourceAddress}
                onChange={(e) => setSourceAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && executeCommand()}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-600 transition-all"
              />
            </div>
          )}
          
          {(selectedCommand === 'traceroute') && (
            <div className="flex items-center gap-4 text-sm text-slate-300 px-2 mt-2 sm:mt-0">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                <input 
                  type="checkbox" 
                  checked={resolvePtr} 
                  onChange={(e) => setResolvePtr(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                />
                Resolve PTR
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                <input 
                  type="checkbox" 
                  checked={resolveAsn} 
                  onChange={(e) => setResolveAsn(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                />
                Resolve ASN
              </label>
            </div>
          )}

          <button
            onClick={executeCommand}
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Executing...
              </>
            ) : (
              <>▶ Execute</>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 text-rose-300 text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          {error}
        </div>
      )}

      {/* Terminal Output */}
      {(output || loading) && (
        <div className="glass-panel p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/50">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
            </div>
            <span className="text-xs text-slate-400 font-mono ml-2">
              mx204 &gt; {currentCmd.label.toLowerCase().replace(/ /g, ' ')}{target ? ` ${target}` : ''}
            </span>
          </div>
          <div className="p-4 max-h-[600px] overflow-auto">
            {loading ? (
              <div className="space-y-2 animate-pulse">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-4 bg-slate-800 rounded" style={{ width: `${Math.random() * 60 + 30}%` }}></div>
                ))}
              </div>
            ) : (
              <pre className="text-sm font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed">{output}</pre>
            )}
          </div>
        </div>
      )}

      {/* Debug Panel */}
      {debugInfo && !loading && (
        <div className="glass-panel p-0 overflow-hidden">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="w-full flex justify-between items-center px-4 py-3 bg-slate-800/50 hover:bg-slate-800/80 transition-colors text-left"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="text-amber-400">⚡</span>
              <span className="text-slate-300 font-medium">Debug Info</span>
              <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{debugInfo.execution_time_ms}ms</span>
              <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{(debugInfo.raw_xml_bytes / 1024).toFixed(1)} KB XML</span>
            </div>
            <span className="text-slate-500 text-xs">{showDebug ? '▲ Hide' : '▼ Show'}</span>
          </button>
          
          {showDebug && (
            <div className="border-t border-slate-700/50">
              <div className="grid grid-cols-3 gap-px bg-slate-700/30">
                <div className="bg-slate-900/80 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Device</div>
                  <div className="text-sm text-slate-300 font-mono mt-1">{debugInfo.device_model}</div>
                </div>
                <div className="bg-slate-900/80 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Hostname</div>
                  <div className="text-sm text-slate-300 font-mono mt-1">{debugInfo.device_hostname}</div>
                </div>
                <div className="bg-slate-900/80 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">JunOS Version</div>
                  <div className="text-sm text-slate-300 font-mono mt-1">{debugInfo.device_version}</div>
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Execution Log</div>
                <div className="space-y-1">
                  {debugInfo.logs.map((log, i) => {
                    const isSuccess = log.includes('✓');
                    const isError = log.includes('✗');
                    return (
                      <div key={i} className={`text-xs font-mono px-2 py-1 rounded ${
                        isSuccess ? 'text-emerald-400 bg-emerald-500/5' : 
                        isError ? 'text-rose-400 bg-rose-500/5' : 
                        'text-slate-400 bg-slate-800/30'
                      }`}>
                        {log}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Command History */}
      {history.length > 0 && (
        <div className="glass-panel">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Recent Commands
          </h3>
          <div className="space-y-1.5">
            {history.map((h, i) => (
              <div key={i} className="flex justify-between items-center text-xs px-3 py-2 bg-slate-800/30 rounded-md">
                <span className="text-slate-300 font-mono">{h.cmd}</span>
                <span className="text-slate-500">{h.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
