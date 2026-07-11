"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Button } from "@/components/ui/button";

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const { state, logout, t } = usePosApp();
  const lockedShops = state.licenses.filter((license) => license.status === "locked").length;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f3efe6_0%,#e9eef8_100%)]">
      <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[34px] border border-white/80 bg-white/95 shadow-[0_28px_70px_rgba(15,23,42,0.12)]">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_1.5fr]">
            <div className="relative overflow-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.28),transparent_34%),linear-gradient(135deg,#020617_0%,#0f2a2a_55%,#111827_100%)] p-5 text-white">
              <div className="relative z-10 flex items-center gap-4">
                {state.brand.logoUrl ? (
                  <img
                    alt={state.brand.companyName}
                    className="h-16 w-16 rounded-[22px] border border-white/20 bg-white object-cover p-1"
                    src={state.brand.logoUrl}
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/12 font-display text-xl font-semibold text-white ring-1 ring-white/18">
                    {state.brand.posName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200">{t("owner.controlLabel")}</p>
                  <h1 className="mt-1 truncate font-display text-3xl font-semibold sm:text-4xl">{state.brand.posName}</h1>
                  <p className="mt-1 truncate text-sm text-white/62">{state.brand.companyName}</p>
                </div>
              </div>
              <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl" />
            </div>

            <div className="p-4 lg:p-5">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <LocaleSwitcher className="min-w-[170px]" showLabel={false} />
                <Button asChild className="h-11 rounded-[18px] px-4" variant="secondary">
                  <Link href="/dashboard">
                    <span className="inline-flex items-center gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      {t("owner.backToShop")}
                    </span>
                  </Link>
                </Button>
                <Button className="h-11 rounded-[18px] px-4" variant="secondary" onClick={logout}>
                  {t("common.signOut")}
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-[24px] border border-slate-100 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t("owner.totalShops")}</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-ink">{state.shops.length}</p>
                </div>
                <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">{t("owner.activeLicenses")}</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-ink">
                    {state.licenses.filter((license) => license.status === "active").length}
                  </p>
                </div>
                <div className="rounded-[24px] border border-amber-100 bg-amber-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Locked stores</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-ink">{lockedShops}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
