"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Button } from "@/components/ui/button";

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { state, logout, t } = usePosApp();

  const signOut = async () => {
    await fetch("/api/auth/owner-login", { method: "DELETE" }).catch(() => undefined);
    logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(124,58,237,0.13),transparent_32%),linear-gradient(180deg,#f7f4ee_0%,#eef3fb_48%,#eef7f2_100%)]">
      <div className="mx-auto max-w-[1560px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[30px] border border-white/75 bg-white/72 p-4 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute -left-24 top-0 h-56 w-56 rounded-full bg-emerald-300/24 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-purple-300/18 blur-3xl" />
          <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="flex min-w-0 items-center gap-4">
                {state.brand.logoUrl ? (
                  <img
                    alt={state.brand.companyName}
                    className="h-16 w-16 rounded-[24px] border border-white/80 bg-white object-cover p-1 shadow-[0_18px_42px_rgba(15,23,42,0.14)]"
                    src={state.brand.logoUrl}
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#059669_0%,#7c3aed_100%)] font-display text-xl font-semibold text-white shadow-[0_18px_42px_rgba(124,58,237,0.22)]">
                    {state.brand.posName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-700">{t("owner.controlLabel")}</p>
                <h1 className="mt-1 truncate font-display text-3xl font-semibold text-slate-950 sm:text-4xl">{state.brand.posName}</h1>
                <p className="mt-1 truncate text-sm text-slate-500">{state.brand.companyName || "POS company workspace"}</p>
                </div>
              </div>

            <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                <LocaleSwitcher className="min-w-[170px]" showLabel={false} />
              <Button asChild className="h-11 rounded-[18px] border border-white/80 bg-white/80 text-slate-950 ring-0 hover:bg-white" variant="secondary">
                  <Link href="/dashboard">
                    <span className="inline-flex items-center gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      {t("owner.backToShop")}
                    </span>
                  </Link>
                </Button>
              <Button className="h-11 rounded-[18px] bg-[linear-gradient(135deg,#ecfdf5_0%,#f5f3ff_100%)] px-4 text-slate-950 ring-1 ring-white/80 hover:bg-white" variant="secondary" onClick={signOut}>
                  {t("common.signOut")}
                </Button>
              </div>
          </div>

        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
