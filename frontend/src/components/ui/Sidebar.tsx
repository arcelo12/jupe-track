"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Network, Handshake, ShieldAlert, Search, Settings, Archive, Compass, ChevronLeft, ChevronRight, X, Globe, Bookmark, Users } from 'lucide-react';
import { useWebSocket } from '@/components/WebSocketProvider';
import { useAuth } from '@/components/AuthProvider';
import { authFetch } from '@/lib/auth';
import { canAccessPath } from '@/lib/rbac';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (val: boolean) => void;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen, menuButtonRef }: SidebarProps) => {
  const pathname = usePathname();
  const { user } = useAuth();
  const [lastScrape, setLastScrape] = React.useState<string | null>(null);
  const drawerRef = React.useRef<HTMLElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const wasMobileOpen = React.useRef(false);

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

  React.useEffect(() => {
    if (isMobileOpen) {
      closeButtonRef.current?.focus();
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setIsMobileOpen(false);
        if (event.key !== 'Tab') return;

        const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', closeOnEscape);
      wasMobileOpen.current = true;
      return () => document.removeEventListener('keydown', closeOnEscape);
    }
    if (wasMobileOpen.current) menuButtonRef.current?.focus();
    wasMobileOpen.current = false;
  }, [isMobileOpen, menuButtonRef, setIsMobileOpen]);

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
        { name: 'Settings', path: '/settings', icon: Settings },
        { name: 'User Management', path: '/settings/users', icon: Users },
        { name: 'Data Retention', path: '/settings/retention', icon: Archive },
        { name: 'AS Mappings', path: '/settings/as-mapping', icon: Bookmark },
      ]
    }
  ];

  // RBAC: hide items the current user cannot access (e.g. admin-only settings).
  // Drop groups that become empty so non-admins don't see a bare header.
  const visibleGroups = menuGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => canAccessPath(user, item.path)),
    }))
    .filter(group => group.items.length > 0);

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-surface-dim/80 z-40 md:hidden"
          aria-hidden="true"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        ref={drawerRef}
        id="primary-navigation-drawer"
        aria-label="Main navigation"
        aria-hidden={!isMobileOpen ? undefined : false}
        role={isMobileOpen ? 'dialog' : undefined}
        aria-modal={isMobileOpen ? true : undefined}
        className={`h-[calc(100vh-2rem)] border border-outline-variant bg-surface-container-low flex flex-col fixed top-4 z-50 rounded transition-all duration-300 overflow-hidden ${
        isMobileOpen ? 'visible left-4 w-64' : 'invisible -left-72 md:visible md:left-4'
      } ${
        'md:left-[var(--shell-main-padding)] md:w-[var(--sidebar-width)]'
      }`}>
        {/* Header / Brand Logo */}
        <div className="h-16 flex items-center justify-between px-4 md:px-5 border-b border-outline-variant relative z-10">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary font-bold border border-primary/20">
              J
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <span className="text-lg font-bold font-display tracking-tight text-primary whitespace-nowrap">
                JupeTrack
              </span>
            )}
          </div>

          {/* Close mobile drawer or collapse button */}
          <div className="flex items-center">
            <button 
              ref={closeButtonRef}
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close navigation"
              className="flex size-11 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface md:hidden"
            >
              <X aria-hidden="true" size={18} />
            </button>
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
              aria-controls="primary-navigation"
              className="hidden size-9 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface md:flex"
            >
              {isCollapsed ? <ChevronRight aria-hidden="true" size={16} /> : <ChevronLeft aria-hidden="true" size={16} />}
            </button>
          </div>
        </div>
        
        {/* Navigation Items */}
        <nav id="primary-navigation" aria-label="Primary" className="px-3 py-4 flex-1 overflow-y-auto overflow-x-hidden space-y-4 relative z-10">
          {visibleGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-4">
              {!isCollapsed || isMobileOpen ? (
                <p className="px-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 whitespace-nowrap">
                  {group.title}
                </p>
              ) : (
                <div className="h-px bg-outline-variant my-3" />
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.path}
                      title={isCollapsed && !isMobileOpen ? item.name : undefined}
                      onClick={() => setIsMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded transition-all duration-300 relative overflow-hidden group ${
                        isActive 
                          ? 'bg-primary/10 text-primary border border-primary/20' 
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-transparent'
                      }`}
                    >
                      <Icon aria-hidden="true" size={18} className={`flex-shrink-0 transition-transform duration-300 ${isActive ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
                      {(!isCollapsed || isMobileOpen) && <span className="font-medium text-[13px] whitespace-nowrap">{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer connected state */}
        <div className="mt-auto p-4 border-t border-outline-variant bg-surface-container-lowest relative z-10">
          <div className={`flex items-center rounded border border-outline-variant bg-surface-container-low transition-colors ${
            isCollapsed && !isMobileOpen ? 'justify-center p-2' : 'gap-3 p-3'
          }`}>
            <div className="relative flex items-center justify-center flex-shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-primary' : 'bg-error'}`}></div>
              {isConnected && <div className="absolute w-2.5 h-2.5 rounded-full bg-primary animate-ping opacity-75"></div>}
            </div>
            {(!isCollapsed || isMobileOpen) && (
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
