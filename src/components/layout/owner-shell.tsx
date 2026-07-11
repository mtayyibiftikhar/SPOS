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
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-line bg-panel p-4 shadow-card sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("owner.controlLabel")}</p>
              <h1 className="mt-2 font-display text-3xl font-semibold text-ink">{state.brand.posName}</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <LocaleSwitcher className="min-w-[170px]" showLabel={false} />
              <Button asChild variant="secondary">
                <Link href="/dashboard">
                  <span className="inline-flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    {t("owner.backToShop")}
                  </span>
                </Link>
              </Button>
              <Button variant="secondary" onClick={logout}>
                {t("common.signOut")}
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl bg-shell p-4">
              <p className="text-sm text-slate-500">{t("owner.totalShops")}</p>
              <p className="mt-2 font-display text-3xl font-semibold text-ink">{state.shops.length}</p>
            </div>
            <div className="rounded-3xl bg-cloud p-4">
              <p className="text-sm text-slate-500">{t("owner.activeLicenses")}</p>
              <p className="mt-2 font-display text-3xl font-semibold text-ink">
                {state.licenses.filter((license) => license.status === "active").length}
              </p>
            </div>
            <div className="rounded-3xl bg-accentSoft p-4">
              <p className="text-sm text-slate-500">Locked stores</p>
              <p className="mt-2 font-display text-3xl font-semibold text-ink">{lockedShops}</p>
            </div>
          </div>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
