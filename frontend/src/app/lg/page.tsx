"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Cable,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Loader2,
  Play,
  Route,
  ShieldAlert,
  Terminal,
  Users,
  Waypoints,
} from "lucide-react";

import { useRefresh } from "@/components/RefreshProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authFetch } from "@/lib/auth";
import { cn } from "@/lib/utils";

const COMMANDS = [
  {
    value: "show_route",
    label: "Show Route",
    icon: Route,
    needsTarget: true,
    placeholder: "e.g. 10.0.0.0/8 or leave empty for all",
    description: "Routing tables & next-hops",
  },
  {
    value: "ping",
    label: "Ping",
    icon: Activity,
    needsTarget: true,
    placeholder: "e.g. 8.8.8.8",
    description: "ICMP echo diagnostic",
  },
  {
    value: "traceroute",
    label: "Traceroute",
    icon: Waypoints,
    needsTarget: true,
    placeholder: "e.g. 8.8.8.8",
    description: "Hop-by-hop latency & path",
  },
  {
    value: "show_bgp_neighbor",
    label: "Show BGP Neighbor",
    icon: Users,
    needsTarget: true,
    placeholder: "Neighbor IP or leave empty for all",
    description: "BGP peer session status",
  },
  {
    value: "show_bgp_summary",
    label: "Show BGP Summary",
    icon: BarChart3,
    needsTarget: false,
    placeholder: "",
    description: "All peers & state summary",
  },
  {
    value: "show_interfaces",
    label: "Show Interfaces",
    icon: Cable,
    needsTarget: true,
    placeholder: "e.g. ge-0/0/0 or leave empty for all",
    description: "Port status & interface counters",
  },
] as const;

interface DebugInfo {
  logs?: string[];
  execution_time_ms?: number;
  raw_xml_bytes?: number;
  raw_xml?: string;
  device_model?: string;
  device_hostname?: string;
  device_version?: string;
  timestamp?: string;
}

interface CommandHistoryItem {
  cmd: string;
  target: string;
  time: string;
}

export default function LookingGlass() {
  const [selectedCommand, setSelectedCommand] = useState<string>(COMMANDS[0].value);
  const [target, setTarget] = useState("");
  const [sourceAddress, setSourceAddress] = useState("");
  const [resolvePtr, setResolvePtr] = useState(false);
  const [resolveAsn, setResolveAsn] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(true);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const { refreshTrigger, logicalSystem } = useRefresh();

  // Load initial state from cache
  useEffect(() => {
    try {
      const cachedState = localStorage.getItem("junos-lg-state");
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
    } catch {
      // Ignore cache parse errors
    }
  }, [refreshTrigger]);

  // Save state whenever it changes
  useEffect(() => {
    try {
      const stateToSave = {
        selectedCommand,
        target,
        sourceAddress,
        resolvePtr,
        resolveAsn,
        output,
        error,
        debugInfo,
        history,
      };
      localStorage.setItem("junos-lg-state", JSON.stringify(stateToSave));
    } catch {
      // Ignore localStorage write quota errors
    }
  }, [
    selectedCommand,
    target,
    sourceAddress,
    resolvePtr,
    resolveAsn,
    output,
    error,
    debugInfo,
    history,
  ]);

  const currentCmd =
    COMMANDS.find((c) => c.value === selectedCommand) || COMMANDS[0];

  const executeCommand = async () => {
    if (
      currentCmd.needsTarget &&
      !target &&
      ["ping", "traceroute"].includes(selectedCommand)
    ) {
      setError("Target IP/hostname is required for this command.");
      return;
    }

    setLoading(true);
    setError(null);
    setOutput(null);

    try {
      const res = await authFetch("/api/proxy/looking-glass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setHistory((prev) =>
          [
            {
              cmd: `${currentCmd.label}${target ? " " + target : ""}`,
              target: target,
              time: new Date().toLocaleTimeString(),
            },
            ...prev,
          ].slice(0, 10)
        );
      } else {
        setError(data.error || "Unknown error occurred");
      }
    } catch {
      setError("Failed to connect to backend. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(output);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = output;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  return (
    <div className="min-w-0 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Device Telemetry &amp; Diagnostics / MX204
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-primary">
            Looking Glass
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Execute read-only Junos diagnostic commands and live routing queries directly on the MX204 edge router.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="w-fit border-outline-variant bg-surface-container-high text-on-surface">
            Device · MX204
          </Badge>
          <Badge className="w-fit border-primary/30 bg-primary/10 text-primary">
            System · {logicalSystem}
          </Badge>
        </div>
      </div>

      {/* Command Selector & Input Form */}
      <Card className="overflow-hidden rounded border-outline-variant bg-surface-container-low">
        <CardHeader className="border-b border-outline-variant bg-surface-container px-4 py-3">
          <CardTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            <span className="flex items-center gap-2">
              <Terminal className="size-4 text-primary" aria-hidden="true" />
              Select Diagnostic Routine
            </span>
            <span className="font-mono text-[11px] text-on-surface-variant/80">
              Read-only NETCONF RPC
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 p-4 sm:p-5">
          {/* Command Buttons Grid */}
          <div
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
            role="radiogroup"
            aria-label="Diagnostic command selection"
          >
            {COMMANDS.map((cmd) => {
              const Icon = cmd.icon;
              const isSelected = selectedCommand === cmd.value;
              return (
                <button
                  key={cmd.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setSelectedCommand(cmd.value);
                    setOutput(null);
                    setError(null);
                  }}
                  className={cn(
                    "group flex flex-col justify-between rounded border p-3 text-left transition-colors focus-visible:outline-none",
                    "focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary",
                    isSelected
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface"
                  )}
                >
                  <div className="mb-2 flex w-full items-center justify-between">
                    <Icon
                      className={cn(
                        "size-4 transition-colors",
                        isSelected
                          ? "text-primary"
                          : "text-on-surface-variant group-hover:text-primary"
                      )}
                      aria-hidden="true"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-px w-4",
                        isSelected ? "bg-primary" : "bg-outline-variant"
                      )}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold leading-tight">
                      {cmd.label}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-on-surface-variant/80">
                      {cmd.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Execution Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeCommand();
            }}
            className="space-y-3 pt-1"
          >
            <div className="flex flex-col gap-2.5 sm:flex-row">
              {currentCmd.needsTarget && (
                <div className="relative flex-1">
                  <label htmlFor="lg-target-input" className="sr-only">
                    Target address or prefix
                  </label>
                  <Input
                    id="lg-target-input"
                    type="text"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder={currentCmd.placeholder}
                    className="h-10 rounded border-outline-variant bg-surface-container-high font-mono text-sm text-on-surface placeholder:text-on-surface-variant/50 focus-visible:ring-primary"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}

              {(selectedCommand === "ping" ||
                selectedCommand === "traceroute") && (
                <div className="w-full sm:w-52">
                  <label htmlFor="lg-source-input" className="sr-only">
                    Source IP (optional)
                  </label>
                  <Input
                    id="lg-source-input"
                    type="text"
                    value={sourceAddress}
                    onChange={(e) => setSourceAddress(e.target.value)}
                    placeholder="Source IP (optional)"
                    className="h-10 rounded border-outline-variant bg-surface-container-high font-mono text-sm text-on-surface placeholder:text-on-surface-variant/50 focus-visible:ring-primary"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-10 w-full shrink-0 rounded px-6 font-semibold shadow-none sm:w-auto"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  Executing…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Play className="size-3.5 fill-current" aria-hidden="true" />
                    Execute
                  </span>
                )}
              </Button>
            </div>

            {selectedCommand === "traceroute" && (
              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-on-surface">
                <label className="inline-flex cursor-pointer select-none items-center gap-2 text-on-surface-variant transition-colors hover:text-on-surface">
                  <input
                    type="checkbox"
                    checked={resolvePtr}
                    onChange={(e) => setResolvePtr(e.target.checked)}
                    className="size-4 rounded border-outline-variant bg-surface-container-high text-primary focus:ring-1 focus:ring-primary"
                  />
                  <span>Resolve PTR (Reverse DNS)</span>
                </label>
                <label className="inline-flex cursor-pointer select-none items-center gap-2 text-on-surface-variant transition-colors hover:text-on-surface">
                  <input
                    type="checkbox"
                    checked={resolveAsn}
                    onChange={(e) => setResolveAsn(e.target.checked)}
                    className="size-4 rounded border-outline-variant bg-surface-container-high text-primary focus:ring-1 focus:ring-primary"
                  />
                  <span>Resolve ASN (Autonomous System)</span>
                </label>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Error Alert Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex-1 font-mono text-xs">{error}</div>
        </div>
      )}

      {/* Terminal Output */}
      {(output || loading) && (
        <Card className="overflow-hidden rounded border-outline-variant bg-surface-container-lowest">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-outline-variant bg-surface-container px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex min-w-0 items-center gap-2 font-mono text-xs text-on-surface-variant">
                <span className="font-semibold text-primary">mx204</span>
                <span className="text-outline-variant">[{logicalSystem}]</span>
                <span className="text-on-surface">&gt;</span>
                <span className="truncate text-on-surface">
                  {currentCmd.label.toLowerCase().replace(/ /g, " ")}
                  {target ? ` ${target}` : ""}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {output && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 px-2 text-xs text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                    aria-label={
                      copied
                        ? "Copied output to clipboard"
                        : "Copy output to clipboard"
                    }
                  >
                    {copied ? (
                      <>
                        <Check
                          className="mr-1 size-3.5 text-primary"
                          aria-hidden="true"
                        />
                        <span className="font-medium text-primary">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 size-3.5" aria-hidden="true" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div
              role="region"
              aria-label="Terminal command output"
              tabIndex={0}
                  className="max-h-[640px] overflow-auto bg-surface-container-lowest p-4 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
            >
              {loading ? (
                <div role="status" aria-live="polite" className="space-y-2 py-2">
                  <div className="mb-4 flex items-center gap-2 text-xs text-on-surface-variant">
                    <Loader2
                      className="size-4 animate-spin text-primary"
                      aria-hidden="true"
                    />
                    <span>Executing RPC on MX204 via NETCONF session…</span>
                  </div>
                  {[90, 75, 82, 60, 45].map((w, i) => (
                    <div
                      key={i}
                      className="h-3.5 animate-pulse rounded bg-surface-container-high/60"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              ) : (
                <pre className="select-text whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-on-surface">
                  {output}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Info */}
      {debugInfo && !loading && (
        <Card className="overflow-hidden rounded border-outline-variant bg-surface-container-low">
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            aria-expanded={showDebug}
            className="flex w-full items-center justify-between bg-surface-container px-4 py-3 text-left transition-colors hover:bg-surface-container-high"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface">
              <Terminal className="size-3.5 text-primary" aria-hidden="true" />
              <span>Execution Telemetry &amp; RPC Logs</span>
              {debugInfo.execution_time_ms !== undefined && (
                <Badge className="border-outline-variant bg-surface-container-lowest font-mono text-[10px] text-on-surface-variant">
                  {debugInfo.execution_time_ms} ms
                </Badge>
              )}
              {debugInfo.raw_xml_bytes !== undefined && (
                <Badge className="border-outline-variant bg-surface-container-lowest font-mono text-[10px] text-on-surface-variant">
                  {(debugInfo.raw_xml_bytes / 1024).toFixed(1)} KB XML
                </Badge>
              )}
            </div>
            <span className="flex items-center gap-1 font-mono text-xs text-on-surface-variant">
              {showDebug ? (
                <>
                  Hide <ChevronUp className="size-3.5" aria-hidden="true" />
                </>
              ) : (
                <>
                  Details{" "}
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </>
              )}
            </span>
          </button>

          {showDebug && (
            <CardContent className="space-y-4 border-t border-outline-variant bg-surface-container-low p-4">
              {(debugInfo.device_model ||
                debugInfo.device_hostname ||
                debugInfo.device_version) && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded border border-outline-variant bg-surface-container p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Device Model
                    </div>
                    <div className="mt-1 font-mono text-xs text-on-surface">
                      {debugInfo.device_model || "MX204"}
                    </div>
                  </div>
                  <div className="rounded border border-outline-variant bg-surface-container p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Hostname
                    </div>
                    <div className="mt-1 font-mono text-xs text-on-surface">
                      {debugInfo.device_hostname || "mx204-edge"}
                    </div>
                  </div>
                  <div className="rounded border border-outline-variant bg-surface-container p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Junos OS
                    </div>
                    <div className="mt-1 font-mono text-xs text-on-surface">
                      {debugInfo.device_version || "Junos"}
                    </div>
                  </div>
                </div>
              )}

              {debugInfo.logs && debugInfo.logs.length > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    RPC Execution Timeline
                  </div>
                  <div className="space-y-1 rounded border border-outline-variant bg-surface-container-lowest p-3 font-mono text-xs">
                    {debugInfo.logs.map((log, i) => {
                      const isSuccess = log.includes("✓");
                      const isError =
                        log.includes("✗") ||
                        log.toLowerCase().includes("error");
                      return (
                        <div
                          key={i}
                          className={cn(
                            "rounded px-2 py-1 text-xs leading-relaxed",
                            isSuccess && "bg-success/10 text-success",
                            isError && "bg-error/10 text-error",
                            !isSuccess && !isError && "text-on-surface-variant"
                          )}
                        >
                          {log}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Command History */}
      {history.length > 0 && (
        <Card className="overflow-hidden rounded border-outline-variant bg-surface-container-low">
          <CardHeader className="space-y-0 border-b border-outline-variant bg-surface-container px-4 py-2.5">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              <Clock className="size-3.5 text-primary" aria-hidden="true" />
              <span>Session Command History</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded border border-outline-variant bg-surface-container px-3 py-2 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Clock aria-hidden="true" className="size-3 shrink-0 text-primary/70" />
                    <span className="truncate font-mono text-on-surface">
                      {h.cmd}
                    </span>
                  </div>
                  <span className="ml-2 shrink-0 font-mono text-[11px] text-on-surface-variant">
                    {h.time}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
