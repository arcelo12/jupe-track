import type { User } from "@/lib/auth";

/**
 * RBAC helpers — single source of truth for role-gated navigation and pages.
 *
 * Backend already enforces authorization (AdminMiddleware on mutating routes);
 * these helpers keep the UI honest so non-admins never see controls they cannot
 * use. Defense in depth, not the security boundary itself.
 */

/** Route prefixes that require an admin (is_admin) user. */
export const ADMIN_PATHS = [
  "/settings",
] as const;

export function isAdmin(user: User | null): boolean {
  return !!user?.is_admin;
}

/** True when the given path requires admin privileges. */
export function isAdminPath(path: string): boolean {
  return ADMIN_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

/** True when the user may access the given path. */
export function canAccessPath(user: User | null, path: string): boolean {
  return isAdminPath(path) ? isAdmin(user) : true;
}
