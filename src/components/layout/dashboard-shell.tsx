"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, Film } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { Sidebar } from "@/components/layout/sidebar";
import type { UserRole } from "@/types/database";

interface DashboardShellProps {
  role: UserRole;
  userName: string;
  preview: boolean;
  children: React.ReactNode;
}

export function DashboardShell({
  role,
  userName,
  preview,
  children,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  // Load preferences from localStorage on mount
  useEffect(() => {
    const collapsed = localStorage.getItem("sidebar_collapsed");
    if (collapsed === "true") {
      const timer = setTimeout(() => setIsCollapsed(true), 0);
      return () => clearTimeout(timer);
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  // Automatically close the mobile sidebar when the route changes (e.g. user clicked a link)
  useEffect(() => {
    const timer = setTimeout(() => setSidebarOpen(false), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div className="flex h-screen bg-stone-100 overflow-hidden font-sans">
      {/* Mobile Drawer Backdrop Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/60 backdrop-blur-xs lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Drawer Container */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex transform flex-col transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isCollapsed ? "lg:w-16 w-60" : "w-60"
        } ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          role={role}
          userName={userName}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header (Sticky top navigation bar) */}
        <header className="flex h-16 items-center justify-between border-b border-stone-200 bg-white px-4 lg:hidden shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus:outline-none"
              aria-label="Open sidebar"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2">
              <Film className="h-5 w-5 text-amber-500" />
              <span className="font-semibold text-stone-900 text-sm tracking-tight">
                {APP_NAME}
              </span>
            </div>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="print:bg-white flex-1 overflow-y-auto overflow-x-hidden text-stone-900 relative">
          {preview && (
            <div className="border-b border-amber-200 bg-amber-100 px-6 py-2 text-center text-sm text-amber-950">
              Preview mode — UI only, no database. Set{" "}
              <code className="rounded bg-white px-1">
                NEXT_PUBLIC_PREVIEW_MODE=false
              </code>{" "}
              after Supabase is ready.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
