"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Button } from "@/components/ui/button";

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const { state, logout, t } = usePosApp();
  const lockedShops = state.licenses.filter((license) => license.status === "locked").length;
  const activeLicenses = state.licenses.filter((license) => license.status === "active").length;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),linear-gradient(180deg,#f6f0e5_0%,#e7edf7_46%,#eef4f2_100%)]">
      <div className="mx-auto max-w-[1560px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[36px] border border-white/15 bg-slate-950 p-4 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
          <div className="pointer-events-none absolute -left-24 top-0 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-amber-300/12 blur-3xl" />
          <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="flex min-w-0 items-center gap-4">
                {state.brand.logoUrl ? (
                  <img
                    alt={state.brand.companyName}
                    className="h-16 w-16 rounded-[24px] border border-white/15 bg-white object-cover p-1 shadow-[0_18px_42px_rgba(0,0,0,0.22)]"
                    src={state.brand.logoUrl}
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/10 font-display text-xl font-semibold text-white ring-1 ring-white/15">
                    {state.brand.posName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-200">{t("owner.controlLabel")}</p>
                <h1 className="mt-1 truncate font-display text-3xl font-semibold sm:text-4xl">{state.brand.posName}</h1>
                <p className="mt-1 truncate text-sm text-white/62">{state.brand.companyName || "POS company workspace"}</p>
                </div>
              </div>

            <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                <LocaleSwitcher className="min-w-[170px] bg-white text-slate-950" showLabel={false} />
              <Button asChild className="h-11 rounded-[18px] bg-white text-slate-950 ring-0 hover:bg-emerald-50" variant="secondary">
                  <Link href="/dashboard">
                    <span className="inline-flex items-center gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      {t("owner.backToShop")}
                    </span>
                  </Link>
                </Button>
              <Button className="h-11 rounded-[18px] bg-white/10 px-4 text-white ring-1 ring-white/15 hover:bg-white/15" variant="secondary" onClick={logout}>
                  {t("common.signOut")}
                </Button>
              </div>
          </div>

          <div className="relative mt-5 grid gap-3 md:grid-cols-3">
            {[
              { label: t("owner.totalShops"), value: state.shops.length, tone: "from-white/14 to-white/6" },
              { label: t("owner.activeLicenses"), value: activeLicenses, tone: "from-emerald-300/22 to-emerald-300/5" },
              { label: "Locked stores", value: lockedShops, tone: "from-amber-300/24 to-amber-300/5" }
            ].map((metric) => (
              <div
                className={`rounded-[26px] border border-white/10 bg-gradient-to-br ${metric.tone} px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`}
                key={metric.label}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/58">{metric.label}</p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="font-display text-4xl font-semibold text-white">{metric.value}</p>
                  <span className="h-2 w-12 rounded-full bg-emerald-300/50" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
