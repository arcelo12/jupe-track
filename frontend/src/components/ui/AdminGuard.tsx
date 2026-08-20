"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

/**
 * Blocks admin-only content for non-admin users. Rendered by LayoutShell for
 * any path in ADMIN_PATHS. The backend still enforces authorization; this is a
 * UX guard so viewers get a clear message instead of silent 403s from the API.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.is_admin) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center h-full w-full p-6">
      <div className="glass-panel max-w-md w-full text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-error/10 border border-error/30 flex items-center justify-center text-error">
          <ShieldAlert size={24} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-on-surface mb-1">Admin access required</h2>
          <p className="text-sm text-on-surface-variant">
            This section is restricted to administrators. Contact an admin if you
            need access.
          </p>
        </div>
        <Link
          href="/"
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
