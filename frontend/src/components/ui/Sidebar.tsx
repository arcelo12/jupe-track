"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Sidebar = () => {
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: '📊' },
    { name: 'Interfaces', path: '/interfaces', icon: '📈' },
    { name: 'BGP Neighbors', path: '/bgp', icon: '🤝' },
    { name: 'Routing Policy', path: '/policy', icon: '🛡️' },
    { name: 'Looking Glass', path: '/lg', icon: '🔍' },
    { name: 'Settings', path: '/settings', icon: '⚙️' },
  ];

  return (
    <aside className="w-64 h-screen border-r border-slate-700/50 bg-slate-900/80 backdrop-blur-xl flex flex-col fixed left-0 top-0 z-40">
      <div className="h-16 flex items-center px-6 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold border border-emerald-500/30">
            J
          </div>
          <span className="text-xl font-bold tracking-tight">JupeTrack</span>
        </div>
      </div>
      
      <div className="px-4 py-6">
        <p className="px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          MX204 Monitoring
        </p>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.name}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-slate-700/50">
        <div className="glass-card flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <div className="text-sm">
            <p className="text-slate-300 font-medium">System Online</p>
            <p className="text-slate-500 text-xs">Juniper PyEZ Connected</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
