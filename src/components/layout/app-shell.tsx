"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { usePosApp } from "@/components/providers/app-provider";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { endSupportSession, session, state } = usePosApp();
  const isBillingRoute = pathname === "/billing";
  const supportSession =
    session?.supportSessionId
      ? state.supportSessions.find((entry) => entry.id === session.supportSessionId && !entry.endedAt)
      : null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.10),_transparent_28%),linear-gradient(180deg,#f8fbf9_0%,#f2f6f4_100%)]">
      <div
        className={cn(
          "mx-auto flex px-4 py-4 sm:px-6 lg:px-8 print:block print:max-w-none print:px-0 print:py-0",
          isBillingRoute ? "min-h-screen max-w-[1920px] gap-3 lg:h-[calc(100dvh-2rem)] lg:min-h-0" : "min-h-screen max-w-[1600px] gap-6"
        )}
      >
        <div
          className={cn(
            "hidden rounded-[24px] border border-white/80 bg-white/92 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur lg:static lg:z-auto lg:block print:hidden",
            isBillingRoute ? "lg:w-[218px]" : "lg:w-[280px]"
          )}
        >
          <Sidebar />
        </div>

        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col lg:pl-0 print:block print:min-w-0",
            isBillingRoute ? "gap-3 lg:min-h-0" : "gap-6"
          )}
        >
          {isBillingRoute ? (
            <div className="print:hidden lg:hidden">
              <Topbar minimal />
            </div>
          ) : (
            <div className="print:hidden">
              <Topbar />
            </div>
          )}
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
