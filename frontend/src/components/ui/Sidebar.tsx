"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Network, Handshake, ShieldAlert, Search, Settings, Archive, Compass, ChevronLeft, ChevronRight, X, Globe, Bookmark } from 'lucide-react';
import { useWebSocket } from '@/components/WebSocketProvider';
import { authFetch } from '@/lib/auth';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (val: boolean) => void;
}

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }: SidebarProps) => {
  const pathname = usePathname();
  const [lastScrape, setLastScrape] = React.useState<string | null>(null);

  const { isConnected } = useWebSocket();
  React.useEffect(() => {
    let alive = true;
    authFetch('/api/proxy/metrics/status').then(r => r.ok ? r.json() : null).then(d => {
      if (!alive || !d?.last_scrape_bgp) return;
      const ts = new Date(d.last_scrape_bgp as string).getTime();
      const mins = Math.floor((Date.now() - ts) / 60000);
      setLastScrape(mins < 1 ? 'just now' : mins === 1 ? '1m ago' : `${mins}m ago`);
    }).catch(() => {});
    return () => { alive = false; };
  }, [isConnected]);

  const menuGroups = [
    {
      title: "Monitoring",
      items: [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Interfaces', path: '/interfaces', icon: Network },
        { name: 'BGP Neighbors', path: '/bgp', icon: Handshake },
      ]
    },
    {
      title: "Tools & Diagnostics",
      items: [
        { name: 'Routing Policy', path: '/policy', icon: ShieldAlert },
        { name: 'Looking Glass', path: '/lg', icon: Search },
        { name: 'Route Lookup', path: '/route-lookup', icon: Compass },
        { name: 'Global Lookup', path: '/lookup', icon: Globe },
      ]
    },
    {
      title: "Configuration",
      items: [
        { name: 'Device Settings', path: '/settings', icon: Settings },
        { name: 'Data Retention', path: '/settings/retention', icon: Archive },
        { name: 'AS Mappings', path: '/settings/as-mapping', icon: Bookmark },
      ]
    }
  ];

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-surface-container-lowest/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside className={`h-[calc(100vh-2rem)] border border-[#2A2E35] bg-surface-container-low backdrop-blur-xl flex flex-col fixed top-4 z-50 rounded shadow-none transition-all duration-300 overflow-hidden ${
        isMobileOpen ? 'left-4 w-64' : '-left-72 md:left-4'
      } ${
        isCollapsed ? 'md:w-20' : 'md:w-64'
      }`}>
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        {/* Header / Brand Logo */}
        <div className="h-16 flex items-center justify-between px-4 md:px-5 border-b border-[#2A2E35] relative z-10">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary font-bold border border-primary/20">
              J
            </div>
            {!isCollapsed && (
              <span className="text-lg font-bold font-display tracking-tight text-primary whitespace-nowrap">
                JupeTrack
              </span>
            )}
          </div>

          {/* Close mobile drawer or collapse button */}
          <div className="flex items-center">
            <button 
              onClick={() => setIsMobileOpen(false)}
              className="md:hidden text-on-surface-variant hover:text-on-surface p-1"
            >
              <X size={18} />
            </button>
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:flex text-on-surface-variant hover:text-on-surface hover:bg-[#2A2E35]/50 p-1.5 rounded transition-colors"
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
        </div>
        
        {/* Navigation Items */}
        <div className="px-3 py-4 flex-1 overflow-y-auto overflow-x-hidden space-y-4 relative z-10">
          {menuGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-4">
              {!isCollapsed ? (
                <p className="px-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 whitespace-nowrap">
                  {group.title}
                </p>
              ) : (
                <div className="h-px bg-[#2A2E35] my-3" />
              )}
              <nav className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.path}
                      title={isCollapsed ? item.name : undefined}
                      onClick={() => setIsMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded transition-all duration-300 relative overflow-hidden group ${
                        isActive 
                          ? 'bg-primary/10 text-primary border border-primary/20' 
                          : 'text-on-surface-variant hover:text-on-surface hover:bg-[#2A2E35]/50 border border-transparent'
                      }`}
                    >
                      <Icon size={18} className={`flex-shrink-0 transition-transform duration-300 ${isActive ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
                      {!isCollapsed && <span className="font-medium text-[13px] whitespace-nowrap">{item.name}</span>}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Footer connected state */}
        <div className="mt-auto p-4 border-t border-[#2A2E35] bg-surface-container-lowest relative z-10">
          <div className={`glass-card flex items-center border-[#2A2E35] hover:border-primary/30 transition-all ${
            isCollapsed ? 'justify-center p-2' : 'gap-3 p-3'
          }`}>
            <div className="relative flex items-center justify-center flex-shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-primary' : 'bg-error'}`}></div>
              {isConnected && <div className="absolute w-2.5 h-2.5 rounded-full bg-primary animate-ping opacity-75"></div>}
            </div>
            {!isCollapsed && (
              <div className="text-[11px] overflow-hidden">
                <p className="text-on-surface font-semibold leading-none mb-0.5">{isConnected ? 'Online' : 'Disconnected'}</p>
                <p className="text-on-surface-variant leading-none truncate">
                  {lastScrape ? `Scraped ${lastScrape}` : 'MX204 SSH'}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
