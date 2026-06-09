"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Users,
  FileText,
  ShoppingBag,
  Calculator,
  Heart,
  Settings,
  Shield,
  Clapperboard,
  LogOut,
  ChevronDown,
  X,
  ChevronLeft,
  ChevronRight,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, MASTER_LINKS } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { getNavForRole } from "@/lib/auth/roles";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Tooltip } from "@/components/ui/tooltip";

const icons: Record<string, React.ElementType> = {
  LayoutDashboard,
  Database,
  Users,
  FileText,
  ShoppingBag,
  Calculator,
  Heart,
  Settings,
  Shield,
  Clapperboard,
};

export function Sidebar({
  role,
  userName,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: {
  role: UserRole;
  userName: string;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mastersOpen, setMastersOpen] = useState(pathname.startsWith("/masters"));
  const nav = getNavForRole(role);

  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSigningOut(false);
      setSignOutConfirmOpen(false);
    }
  }

  const getInitials = (name: string) => {
    if (!name) return "FS";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return "FS";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Group items into logical sections for premium layout
  const workflowHrefs = ["/dashboard", "/leads", "/quotations", "/orders", "/customers"];
  const workflowItems = nav.filter((item) => workflowHrefs.includes(item.href));

  const managementHrefs = ["/masters/services", "/accounting", "/settings", "/users"];
  const managementItems = nav.filter(
    (item) => managementHrefs.includes(item.href) || item.href.startsWith("/masters")
  );

  // Fallback for any other navigation items
  const otherItems = nav.filter(
    (item) =>
      !workflowHrefs.includes(item.href) &&
      !managementHrefs.includes(item.href) &&
      !item.href.startsWith("/masters")
  );

  const workflowSection = [...workflowItems, ...otherItems];
  const managementSection = managementItems;

  const renderNavSection = (title: string, items: typeof nav, showHeader = true) => {
    if (items.length === 0) return null;
    return (
      <div
        className={cn(
          "w-full space-y-1",
          isCollapsed ? "lg:flex lg:flex-col lg:items-center lg:space-y-1.5" : ""
        )}
      >
        {!isCollapsed ? (
          showHeader && (
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-stone-500 mt-3 mb-1.5 select-none">
              {title}
            </p>
          )
        ) : (
          showHeader && <div className="w-8 h-px bg-stone-900 my-2 self-center shrink-0 animate-fade-in" />
        )}
        {items.map((item) => {
          if (item.href === "/masters/services" || item.href.startsWith("/masters")) {
            const isMastersActive = pathname.startsWith("/masters");
            return (
              <div
                key="masters"
                className={cn(
                  "group relative w-full flex flex-col",
                  isCollapsed ? "lg:items-center" : ""
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isCollapsed) {
                      onToggleCollapse?.();
                      setMastersOpen(true);
                    } else {
                      setMastersOpen(!mastersOpen);
                    }
                  }}
                  className={cn(
                    "flex items-center transition-all duration-300 cursor-pointer w-full text-left overflow-hidden",
                    isCollapsed
                      ? "lg:w-10 lg:h-9 lg:justify-center lg:px-0 lg:py-0 rounded-md p-2 w-full gap-0 px-3 py-1.5 text-sm"
                      : "gap-2 rounded-md px-3 py-1.5 text-sm",
                    isMastersActive
                      ? "bg-amber-600/10 text-amber-400 font-semibold"
                      : "text-stone-455 hover:bg-stone-900 hover:text-stone-200"
                  )}
                >
                  <span className={cn("flex items-center w-full", isCollapsed ? "lg:justify-center" : "gap-2")}>
                    <Database className="h-4 w-4 shrink-0" />
                    <span className={cn(
                      "select-none transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap",
                      isCollapsed ? "lg:w-0 lg:opacity-0 lg:ml-0" : "lg:w-auto lg:opacity-100 lg:ml-2"
                    )}>
                      Masters
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-all duration-300 ml-auto",
                      mastersOpen && "rotate-180",
                      isCollapsed ? "lg:opacity-0 lg:w-0 lg:pointer-events-none" : "lg:opacity-100 lg:w-auto"
                    )}
                  />
                </button>

                {/* Collapsed Hover Flyout Popover */}
                <div
                  className={cn(
                    "absolute left-[calc(100%-4px)] top-0 pl-3 z-50 transition-all duration-200 origin-left",
                    isCollapsed
                      ? "invisible opacity-0 scale-95 translate-x-2 lg:group-hover:visible lg:group-hover:opacity-100 lg:group-hover:translate-x-0"
                      : "hidden"
                  )}
                >
                  <div className="bg-stone-950 border border-stone-850 rounded-md p-2.5 whitespace-nowrap shadow-2xl space-y-1 min-w-[160px]">
                    <p className="font-semibold text-stone-500 text-[10px] uppercase tracking-wider px-2 pb-1 border-b border-stone-850 mb-1.5 select-none">
                      Masters
                    </p>
                    {MASTER_LINKS.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "block rounded-md px-2.5 py-1.5 text-xs transition-colors",
                          pathname === link.href
                            ? "text-amber-400 bg-amber-600/10 font-semibold"
                            : "text-stone-400 hover:text-white hover:bg-stone-900"
                        )}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Expanded Inline Submenu (smooth max-height slide transition) */}
                <div className={cn(
                  "ml-6 mt-1 space-y-0.5 transition-all duration-300 overflow-hidden",
                  (mastersOpen && !isCollapsed) ? "max-h-60 opacity-100 animate-fade-in" : "max-h-0 opacity-0 pointer-events-none"
                )}>
                  {MASTER_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "block rounded-md px-3 py-1 text-[13px] font-normal transition-colors whitespace-nowrap",
                        pathname === link.href
                          ? "text-amber-400 bg-stone-900"
                          : "text-stone-300 hover:text-white hover:bg-stone-900/50"
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          }

          const Icon = icons[item.icon] ?? LayoutDashboard;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");

          const navLink = (
            <Link
              href={item.href}
              className={cn(
                "flex items-center transition-all duration-300 group relative overflow-hidden w-full",
                isCollapsed
                  ? "lg:w-10 lg:h-9 lg:justify-center lg:px-0 lg:py-0 rounded-md p-2 gap-0 px-3 py-1.5 text-sm"
                  : "gap-2 rounded-md px-3 py-1.5 text-sm w-full",
                active
                  ? "bg-amber-600 text-white font-semibold shadow-md shadow-amber-600/10"
                  : "text-stone-455 hover:bg-stone-900 hover:text-stone-200"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn(
                "select-none transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap",
                isCollapsed ? "lg:w-0 lg:opacity-0 lg:ml-0" : "lg:w-auto lg:opacity-100 lg:ml-2"
              )}>{item.label}</span>
            </Link>
          );

          return isCollapsed ? (
            <Tooltip key={item.href} content={item.label} position="right" className="w-full lg:flex lg:justify-center">
              {navLink}
            </Tooltip>
          ) : (
            <div key={item.href} className="w-full">
              {navLink}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "print:hidden flex h-full flex-col border-r border-stone-900 bg-stone-950 text-stone-100 transition-all duration-300 ease-in-out select-none",
        isCollapsed ? "lg:w-16 w-60" : "w-60"
      )}
    >
      {/* Sidebar Header */}
      <div className={cn(
        "flex items-center border-b border-stone-900 px-4 py-5 shrink-0 h-[72px] transition-all duration-300 relative",
        isCollapsed ? "lg:justify-center lg:px-2" : "justify-between"
      )}>
        <div className="flex items-center gap-2 overflow-hidden justify-start">
          <div className="relative shrink-0 flex items-center justify-center">
            <Film className="h-7 w-7 text-amber-500 shrink-0" />
            <div className="absolute inset-0 bg-amber-500/10 blur-sm rounded-full -z-10" />
          </div>
          <div className={cn(
            "transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap",
            isCollapsed ? "lg:w-0 lg:opacity-0 lg:ml-0 lg:pointer-events-none" : "lg:w-40 lg:opacity-100 lg:ml-2"
          )}>
            <p className="text-xl font-wedding font-semibold leading-tight text-stone-100 tracking-wide">
              {APP_NAME}
            </p>
            <p className="text-[10px] font-medium text-stone-455 capitalize truncate mt-0.5">
              {role}
            </p>
          </div>
        </div>

        <div className={cn(
          "flex items-center gap-1 transition-all duration-300",
          isCollapsed ? "lg:opacity-0 lg:w-0 lg:pointer-events-none" : "lg:opacity-100"
        )}>
          <Tooltip content="Collapse" position="right">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden lg:flex items-center justify-center rounded-md p-1.5 text-stone-400 hover:bg-stone-900 hover:text-white transition-all cursor-pointer border border-transparent hover:border-stone-850"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        {/* Collapsed Mode Floating Expand Overlay */}
        {isCollapsed && (
          <div className="absolute inset-0 hidden lg:flex items-center justify-center bg-stone-950 opacity-0 hover:opacity-100 transition-opacity duration-200">
            <Tooltip content="Expand" position="right">
              <button
                type="button"
                onClick={onToggleCollapse}
                className="flex h-10 w-10 items-center justify-center rounded-md text-stone-400 hover:bg-stone-900 hover:text-white transition-all cursor-pointer border border-stone-800 bg-stone-950"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </Tooltip>
          </div>
        )}

        {/* Mobile close button inside drawer */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-stone-400 hover:bg-stone-900 hover:text-white lg:hidden cursor-pointer focus:outline-none ml-auto"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation items grouped cleanly */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto p-3 space-y-4",
          isCollapsed ? "lg:overflow-visible lg:p-2 lg:space-y-3" : ""
        )}
      >
        {renderNavSection("Navigation", [...workflowSection, ...managementSection], false)}
      </nav>

      {/* User profile & sign-out bottom area */}
      <div
        className={cn(
          "border-t border-stone-900 p-4 flex items-center justify-center shrink-0",
          isCollapsed ? "lg:py-4 lg:px-2" : ""
        )}
      >
        {/* Desktop Profile Card (smoothly transition between expanded and collapsed) */}
        <div className={cn(
          "hidden lg:flex items-center transition-all duration-300 w-full overflow-hidden relative",
          isCollapsed 
            ? "justify-center p-0 bg-transparent border-transparent" 
            : "justify-between bg-stone-900/30 border border-stone-900/60 rounded-xl p-3"
        )}>
          {/* Avatar / Initials */}
          <div 
            onClick={() => {
              if (isCollapsed) {
                setSignOutConfirmOpen(true);
              }
            }}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md font-bold transition-all duration-300 cursor-pointer select-none",
              isCollapsed
                ? "h-10 w-10 bg-amber-600/10 text-amber-400 border border-amber-500/20 hover:bg-amber-600/20 text-xs"
                : "h-9 w-9 bg-amber-600 text-stone-950 text-xs"
            )}
          >
            {getInitials(userName)}
          </div>

          {/* User Details */}
          <div className={cn(
            "transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap flex-1",
            isCollapsed ? "w-0 opacity-0 ml-0 pointer-events-none" : "w-auto opacity-100 ml-3"
          )}>
            <p className="truncate text-xs font-semibold text-stone-100 leading-tight">
              {userName}
            </p>
            <p className="text-[10px] text-stone-455 capitalize truncate mt-0.5">{role}</p>
          </div>

          {/* Sign Out Button */}
          <div className={cn(
            "transition-all duration-300 shrink-0",
            isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-auto opacity-100"
          )}>
            <Tooltip content="Sign out" position="top">
              <button
                type="button"
                onClick={() => setSignOutConfirmOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-900 hover:text-rose-400 transition-all cursor-pointer border border-transparent hover:border-stone-850"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Mobile Expanded view fallback inside drawer */}
        <div className="lg:hidden w-full flex flex-col gap-2 animate-fade-in">
          <div className="flex items-center gap-3 bg-stone-900/30 border border-stone-900/60 rounded-xl p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-600 text-stone-950 font-bold text-xs">
              {getInitials(userName)}
            </div>
            <div>
              <p className="truncate text-xs font-semibold text-stone-100">{userName}</p>
              <p className="text-[10px] text-stone-455 capitalize">{role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSignOutConfirmOpen(true)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-455 transition-colors hover:bg-stone-900 hover:text-rose-400 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={signOutConfirmOpen}
        onClose={() => setSignOutConfirmOpen(false)}
        onConfirm={handleSignOut}
        title="Sign Out"
        message="Are you sure you want to sign out of first story films?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        variant="warning"
        loading={signingOut}
      />
    </aside>
  );
}
