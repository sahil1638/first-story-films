import type { UserRole } from "@/types/database";
import { NAV_ITEMS } from "@/lib/constants";

export function canAccess(role: UserRole, href: string): boolean {
  if (href.startsWith("/masters")) {
    return role === "admin" || role === "manager";
  }
  if (href.startsWith("/users")) {
    return role === "admin";
  }
  if (
    href.startsWith("/accounting") ||
    href.startsWith("/customers") ||
    href.startsWith("/settings")
  ) {
    return role === "admin" || role === "manager";
  }

  const item = NAV_ITEMS.find((n) => href === n.href || href.startsWith(n.href + "/"));
  if (!item) return true;
  return item.roles.includes(role);
}

export function getNavForRole(role: UserRole) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
