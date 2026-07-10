"use client";

import React, { useState } from 'react';
import { useRefresh } from '@/components/RefreshProvider';
import { authFetch } from '@/lib/auth';

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
      const res = await authFetch('/api/proxy/looking-glass', {
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
        <h1 className="text-3xl font-bold font-display tracking-tight text-primary">Looking Glass</h1>
        <p className="text-on-surface-variant mt-1">Execute read-only diagnostic commands on the MX204.</p>
      </div>

      {/* Command Selector */}
      <div className="glass-panel space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {COMMANDS.map(cmd => (
            <button 
              key={cmd.value}
              onClick={() => { setSelectedCommand(cmd.value); setOutput(null); setError(null); }}
              className={`p-3 rounded border text-left transition-all ${
                selectedCommand === cmd.value 
                  ? 'bg-primary/10 border-primary/50 text-primary shadow-none' 
                  : 'bg-surface-container-low border-[#2A2E35] text-on-surface-variant hover:border-primary/50 hover:text-on-surface'
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
                className="w-full bg-surface-container border border-[#2A2E35] rounded px-4 py-2.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/50 transition-all text-on-surface"
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
                className="w-full bg-surface-container border border-[#2A2E35] rounded px-4 py-2.5 text-sm font-mono outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/50 transition-all text-on-surface"
              />
            </div>
          )}
          
          {(selectedCommand === 'traceroute') && (
            <div className="flex items-center gap-4 text-sm text-on-surface px-2 mt-2 sm:mt-0">
              <label className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors">
                <input 
                  type="checkbox" 
                  checked={resolvePtr} 
                  onChange={(e) => setResolvePtr(e.target.checked)}
                  className="rounded border-[#2A2E35] bg-surface-container text-primary focus:ring-primary focus:ring-offset-surface-container"
                />
                Resolve PTR
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors">
                <input 
                  type="checkbox" 
                  checked={resolveAsn} 
                  onChange={(e) => setResolveAsn(e.target.checked)}
                  className="rounded border-[#2A2E35] bg-surface-container text-primary focus:ring-primary focus:ring-offset-surface-container"
                />
                Resolve ASN
              </label>
            </div>
          )}

          <button
            onClick={executeCommand}
            disabled={loading}
            className="bg-primary hover:bg-primary-hover disabled:bg-surface-container-highest disabled:text-on-surface-variant text-on-primary px-6 py-2.5 rounded text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap"
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
        <div className="bg-error/10 border border-error/30 rounded px-4 py-3 text-error text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-error"></span>
          {error}
        </div>
      )}

      {/* Terminal Output */}
      {(output || loading) && (
        <div className="glass-panel p-0 overflow-hidden bg-surface-container-low rounded border border-[#2A2E35]">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border-b border-[#2A2E35]">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-error"></div>
              <div className="w-3 h-3 rounded-full bg-[#a28c85]"></div>
              <div className="w-3 h-3 rounded-full bg-primary"></div>
            </div>
            <span className="text-xs text-on-surface-variant font-mono ml-2">
              mx204 &gt; {currentCmd.label.toLowerCase().replace(/ /g, ' ')}{target ? ` ${target}` : ''}
            </span>
          </div>
          <div className="p-4 max-h-[600px] overflow-auto bg-surface-container">
            {loading ? (
              <div className="space-y-2 animate-pulse">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-4 bg-surface-container-high rounded" style={{ width: `${Math.random() * 60 + 30}%` }}></div>
                ))}
              </div>
            ) : (
              <pre className="text-sm font-mono text-primary whitespace-pre-wrap leading-relaxed">{output}</pre>
            )}
          </div>
        </div>
      )}

      {/* Debug Panel */}
      {debugInfo && !loading && (
        <div className="glass-panel p-0 overflow-hidden bg-surface-container-low rounded border border-[#2A2E35]">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="w-full flex justify-between items-center px-4 py-3 bg-surface-container-high hover:bg-surface-container-highest transition-colors text-left"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#a28c85]">⚡</span>
              <span className="text-on-surface font-medium">Debug Info</span>
              <span className="text-xs bg-surface-container-low text-on-surface-variant px-2 py-0.5 rounded">{debugInfo.execution_time_ms}ms</span>
              <span className="text-xs bg-surface-container-low text-on-surface-variant px-2 py-0.5 rounded">{(debugInfo.raw_xml_bytes / 1024).toFixed(1)} KB XML</span>
            </div>
            <span className="text-on-surface-variant text-xs">{showDebug ? '▲ Hide' : '▼ Show'}</span>
          </button>
          
          {showDebug && (
            <div className="border-t border-[#2A2E35]">
              <div className="grid grid-cols-3 gap-px bg-[#2A2E35]">
                <div className="bg-surface-container-high p-3">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">Device</div>
                  <div className="text-sm text-on-surface font-mono mt-1">{debugInfo.device_model}</div>
                </div>
                <div className="bg-surface-container-high p-3">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">Hostname</div>
                  <div className="text-sm text-on-surface font-mono mt-1">{debugInfo.device_hostname}</div>
                </div>
                <div className="bg-surface-container-high p-3">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wider">JunOS Version</div>
                  <div className="text-sm text-on-surface font-mono mt-1">{debugInfo.device_version}</div>
                </div>
              </div>
              <div className="p-4 bg-surface-container-low">
                <div className="text-xs text-on-surface-variant uppercase tracking-wider mb-2">Execution Log</div>
                <div className="space-y-1">
                  {debugInfo.logs.map((log, i) => {
                    const isSuccess = log.includes('✓');
                    const isError = log.includes('✗');
                    return (
                      <div key={i} className={`text-xs font-mono px-2 py-1 rounded ${
                        isSuccess ? 'text-primary bg-primary/5' : 
                        isError ? 'text-error bg-error/5' : 
                        'text-on-surface-variant bg-surface-container'
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
        <div className="glass-panel bg-surface-container-low rounded border border-[#2A2E35] p-4">
          <h3 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            Recent Commands
          </h3>
          <div className="space-y-1.5">
            {history.map((h, i) => (
              <div key={i} className="flex justify-between items-center text-xs px-3 py-2 bg-surface-container-high rounded">
                <span className="text-on-surface font-mono">{h.cmd}</span>
                <span className="text-on-surface-variant">{h.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
