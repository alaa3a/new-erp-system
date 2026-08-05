"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { ToastProvider } from "@/components/ui/toast/ToastProvider";
import { useRouter, usePathname } from "next/navigation";
import React, { useEffect } from "react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();

  // Validate the session on the client. The middleware only checks that a
  // cookie *exists*, so a stale/invalid cookie still lets pages render while
  // every write action fails with 401 — which looks like "everything is
  // broken". If /api/auth/me says the session is invalid, send the user back
  // to sign in instead of leaving them on a half-working page.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => {
        if (cancelled) return;
        if (res.status === 401) {
          const redirect = pathname || "/";
          router.replace(`/signin?redirect=${encodeURIComponent(redirect)}`);
        }
      })
      .catch(() => {
        // Network errors are transient; leave the page alone.
      });
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  // Dynamic class for main content margin based on sidebar state
  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  return (
    <div className="min-h-screen xl:flex">
      {/* Sidebar and Backdrop */}
      <AppSidebar />
      <Backdrop />
      {/* Main Content Area */}
      <div
        className={`flex-1 transition-all  duration-300 ease-in-out ${mainContentMargin}`}
      >
        {/* Header */}
        <AppHeader />
        {/* Page Content */}
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          <ToastProvider>{children}</ToastProvider>
        </div>
      </div>
    </div>
  );
}
