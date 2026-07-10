"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { usePosApp } from "@/components/providers/app-provider";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { endSupportSession, session, state } = usePosApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isBillingRoute = pathname === "/billing";
  const supportSession =
    session?.supportSessionId
      ? state.supportSessions.find((entry) => entry.id === session.supportSessionId && !entry.endedAt)
      : null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.10),_transparent_28%),linear-gradient(180deg,#f8fbf9_0%,#f2f6f4_100%)]">
      {isBillingRoute ? (
        <>
          <button
            aria-label="Open navigation"
            className="fixed left-3 top-3 z-[70] inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-slate-200 bg-white/95 text-slate-950 shadow-[0_16px_36px_rgba(15,23,42,0.12)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white print:hidden"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>

          {drawerOpen ? (
            <div className="fixed inset-0 z-[80] print:hidden">
              <button
                aria-label="Close navigation"
                className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
                onClick={() => setDrawerOpen(false)}
                type="button"
              />
              <div className="absolute inset-y-0 left-0 w-[min(86vw,320px)] border-r border-white/80 bg-white/96 p-4 shadow-[30px_0_80px_rgba(15,23,42,0.22)] backdrop-blur">
                <button
                  aria-label="Close navigation"
                  className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setDrawerOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
                <Sidebar onNavigate={() => setDrawerOpen(false)} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <div
        className={cn(
          "mx-auto flex px-4 py-4 sm:px-6 lg:px-8 print:block print:max-w-none print:px-0 print:py-0",
          isBillingRoute
            ? "min-h-screen max-w-none gap-0 px-2 py-2 sm:px-3 sm:py-3 lg:h-screen lg:min-h-0 lg:px-3 lg:py-3"
            : "min-h-screen max-w-[1600px] gap-6"
        )}
      >
        {!isBillingRoute ? (
          <div className="hidden rounded-[24px] border border-white/80 bg-white/92 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur lg:static lg:z-auto lg:block lg:w-[280px] print:hidden">
            <Sidebar />
          </div>
        ) : null}

        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col lg:pl-0 print:block print:min-w-0",
            isBillingRoute ? "gap-3 pl-12 lg:min-h-0" : "gap-6"
          )}
        >
          {!isBillingRoute ? (
            <div className="print:hidden">
              <Topbar />
            </div>
          ) : null}
          {supportSession ? (
            <div className="print:hidden rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-[0_14px_34px_rgba(180,83,9,0.08)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  <span className="font-semibold">Support session active.</span> Reason: {supportSession.reason}
                </p>
                <button className="font-semibold text-amber-950 underline-offset-4 hover:underline" onClick={endSupportSession}>
                  End support session
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex-1 min-h-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
