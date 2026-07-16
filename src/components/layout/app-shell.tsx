"use client";

import { usePathname } from "next/navigation";
import { AlertTriangle, CheckCircle2, LockKeyhole, Mail, MessageCircle, Phone } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { usePosApp } from "@/components/providers/app-provider";
import { AttendanceGate } from "@/components/attendance/attendance-gate";
import { cn, formatDateTime } from "@/lib/utils";

function getBlockedStatus(license: ReturnType<typeof usePosApp>["currentLicense"]) {
  if (!license) {
    return null;
  }

  if (license.status === "locked" || license.status === "expired") {
    return license.status;
  }

  if (!license.expiresAt) {
    return null;
  }

  const expiresAt = new Date(license.expiresAt);

  if (!Number.isFinite(expiresAt.getTime()) || Date.now() <= expiresAt.getTime()) {
    return null;
  }

  const daysExpired = Math.floor((Date.now() - expiresAt.getTime()) / 86_400_000);
  const autoLockDays = license.autoLockDaysAfterExpiry ?? 0;

  return daysExpired >= autoLockDays ? "locked" : "expired";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentLicense, currentSettings, currentShop, endSupportSession, locale, logout, saveFeedback, session, state } = usePosApp();
  const isBillingRoute = pathname === "/billing";
  const blockedStatus = session?.workspace === "shop" ? getBlockedStatus(currentLicense) : null;
  const isLocked = blockedStatus === "locked";
  const supportSession =
    session?.supportSessionId
      ? state.supportSessions.find((entry) => entry.id === session.supportSessionId && !entry.endedAt)
      : null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.10),_transparent_28%),linear-gradient(180deg,#f8fbf9_0%,#f2f6f4_100%)]">
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
            isBillingRoute ? "gap-3 lg:min-h-0" : "gap-6"
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
          <div className="flex-1 min-h-0">
            {blockedStatus ? (
              <div className="grid min-h-[68vh] place-items-center">
                <div className="w-full max-w-3xl rounded-[34px] border border-slate-200 bg-white p-6 text-center shadow-[0_28px_80px_rgba(15,23,42,0.12)] sm:p-8">
                  <span className={cn("mx-auto inline-flex h-16 w-16 items-center justify-center rounded-[24px] text-white", isLocked ? "bg-slate-950" : "bg-amber-500")}>
                    {isLocked ? <LockKeyhole className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
                  </span>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{currentShop?.name ?? "Store POS"}</p>
                  <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-slate-950">
                    {isLocked ? "Your POS is locked" : "Your POS license has expired"}
                  </h1>
                  <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-600">
                    {isLocked
                      ? "Billing, product editing, and store operations are temporarily blocked by the POS owner."
                      : "This shop license is past its expiry date. Please contact support to renew access."}
                  </p>

                  <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Status</p>
                      <p className="mt-2 font-display text-2xl font-semibold capitalize text-slate-950">{blockedStatus}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Expiry</p>
                      <p className="mt-2 font-semibold text-slate-950">
                        {currentLicense?.expiresAt ? formatDateTime(currentLicense.expiresAt, locale) : "Not set"}
                      </p>
                    </div>
                    {currentLicense?.lockReason ? (
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Reason</p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">{currentLicense.lockReason}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-7 flex flex-wrap justify-center gap-3">
                    {state.brand.supportWhatsapp ? (
                      <a className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white" href={`https://wa.me/${state.brand.supportWhatsapp.replace(/\D/g, "")}`} rel="noreferrer" target="_blank">
                        <MessageCircle className="h-4 w-4" />
                        WhatsApp support
                      </a>
                    ) : null}
                    {(currentSettings?.pos.phone || state.brand.supportPhone) ? (
                      <a className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-950" href={`tel:${currentSettings?.pos.phone || state.brand.supportPhone}`}>
                        <Phone className="h-4 w-4" />
                        Call
                      </a>
                    ) : null}
                    {state.brand.supportEmail ? (
                      <a className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-950" href={`mailto:${state.brand.supportEmail}?subject=${encodeURIComponent(`${currentShop?.name ?? "POS"} license ${blockedStatus}`)}`}>
                        <Mail className="h-4 w-4" />
                        Email
                      </a>
                    ) : null}
                    <button className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-950" onClick={logout} type="button">
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <AttendanceGate>{children}</AttendanceGate>
            )}
          </div>
        </main>
      </div>
      {saveFeedback ? (
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-full border border-emerald-200 bg-white/96 px-4 py-3 text-sm font-bold text-emerald-800 shadow-[0_20px_55px_rgba(15,23,42,0.16)] backdrop-blur print:hidden"
          role="status"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <span>Saved</span>
        </div>
      ) : null}
    </div>
  );
}
