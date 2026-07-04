"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Network, Handshake, ShieldAlert, Search, Settings, Archive, Compass, ChevronLeft, ChevronRight, X, Globe } from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (val: boolean) => void;
}

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }: SidebarProps) => {
  const pathname = usePathname();

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
      ]
    }
  ];

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside className={`h-screen border-r border-white/5 bg-[#0f172a]/90 md:bg-[#0f172a]/70 backdrop-blur-2xl flex flex-col fixed top-0 z-50 shadow-[4px_0_24px_rgba(0,0,0,0.2)] transition-all duration-300 ${
        isMobileOpen ? 'left-0 w-64' : '-left-64 md:left-0'
      } ${
        isCollapsed ? 'md:w-20' : 'md:w-64'
      }`}>
        {/* Header / Brand Logo */}
        <div className="h-16 flex items-center justify-between px-4 md:px-5 border-b border-white/5">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex-shrink-0 flex items-center justify-center text-emerald-400 font-bold border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              J
            </div>
            {!isCollapsed && (
              <span className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 whitespace-nowrap">
                JupeTrack
              </span>
            )}
          </div>

          {/* Close mobile drawer or collapse button */}
          <div className="flex items-center">
            <button 
              onClick={() => setIsMobileOpen(false)}
              className="md:hidden text-slate-400 hover:text-slate-200 p-1"
            >
              <X size={18} />
            </button>
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:flex text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 p-1.5 rounded-lg transition-colors"
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
        </div>
        
        {/* Navigation Items */}
        <div className="px-3 py-4 flex-1 overflow-y-auto overflow-x-hidden space-y-4">
          {menuGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-4">
              {!isCollapsed ? (
                <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 whitespace-nowrap">
                  {group.title}
                </p>
              ) : (
                <div className="h-px bg-white/5 my-3" />
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
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden group ${
                        isActive 
                          ? 'bg-gradient-to-r from-emerald-500/10 to-transparent text-emerald-400 border border-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.05)]' 
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border border-transparent'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] rounded-r"></div>
                      )}
                      <Icon size={18} className={`flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'group-hover:scale-110'}`} />
                      {!isCollapsed && <span className="font-medium text-[13px] whitespace-nowrap">{item.name}</span>}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Footer connected state */}
        <div className="mt-auto p-4 border-t border-white/5 bg-black/20">
          <div className={`glass-card flex items-center border-white/5 hover:border-emerald-500/30 transition-all ${
            isCollapsed ? 'justify-center p-2' : 'gap-3 p-3'
          }`}>
            <div className="relative flex items-center justify-center flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
            </div>
            {!isCollapsed && (
              <div className="text-[11px] overflow-hidden">
                <p className="text-slate-200 font-semibold leading-none mb-0.5">Online</p>
                <p className="text-slate-500 leading-none truncate">MX204 SSH</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
