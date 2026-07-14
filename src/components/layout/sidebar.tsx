"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  LayoutGrid,
  LogOut,
  Boxes,
  Clock3,
  Package,
  Receipt,
  RotateCcw,
  Settings2,
  ShoppingCart,
  Users2
} from "lucide-react";
import { mainNavItems } from "@/lib/constants";
import { userRoleLabelKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";

const icons = {
  "/dashboard": LayoutGrid,
  "/time-clock": Clock3,
  "/billing": ShoppingCart,
  "/customers": Users2,
  "/products": Package,
  "/inventory": Boxes,
  "/bills": Receipt,
  "/refunds": RotateCcw,
  "/reports": ChartColumn,
  "/settings": Settings2
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { currentSettings, currentShop, logout, session, t } = usePosApp();
  const isBillingRoute = pathname === "/billing";
  const shopName = currentSettings?.pos.shopName ?? currentShop?.name ?? t("brand.name");
  const shopLogo = currentSettings?.pos.logoUrl;
  const logoFallback =
    shopName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "SP";

  return (
    <aside className="flex h-full flex-col">
      <div
        className={cn(
          "rounded-[26px] bg-[radial-gradient(circle_at_16%_16%,rgba(16,185,129,0.16),transparent_34%),linear-gradient(145deg,#070b1a_0%,#102a2b_100%)] text-white shadow-[0_18px_34px_rgba(15,23,42,0.16)]",
          isBillingRoute ? "px-3 py-3" : "px-4 py-4"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-white/10 ring-1 ring-white/15">
            {shopLogo ? (
              <img alt={shopName} className="h-full w-full object-cover" src={shopLogo} />
            ) : (
              <span className="text-sm font-semibold tracking-[0.12em] text-white">{logoFallback}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55">
              {t("brand.platformLabel")}
            </p>
            <h2
              className={cn(
                "mt-1 line-clamp-2 break-words text-[1.05rem] font-semibold leading-snug text-white",
                isBillingRoute ? "text-[0.95rem]" : "text-[1.05rem]"
              )}
            >
              {shopName}
            </h2>
          </div>
        </div>
      </div>

      <nav className={cn("mt-5", isBillingRoute ? "space-y-2" : "space-y-2.5")}>
        {mainNavItems.map((item) => {
          const isActive =
            item.href === "/settings" ? pathname.startsWith("/settings") : pathname === item.href;
          const Icon = icons[item.href as keyof typeof icons];

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-3xl transition",
                isBillingRoute ? "px-3 py-3" : "px-4 py-3.5",
                isActive
                  ? "border border-slate-200/80 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)]"
                  : "border border-transparent hover:bg-slate-50"
              )}
              onClick={onNavigate}
            >
              <span
                className={cn(
                  "rounded-2xl p-2",
                  isActive ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="block text-sm font-semibold text-ink">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-5">
        <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <p className="truncate text-sm font-semibold text-slate-950">{session?.name ?? t("common.notAvailable")}</p>
          <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-slate-500">
            {session?.role ? t(userRoleLabelKeys[session.role]) : ""}
          </p>
          <Button className="mt-4 h-10 w-full justify-center gap-2 rounded-[16px]" onClick={logout} variant="secondary">
            <LogOut className="h-4 w-4" />
            {t("common.signOut")}
          </Button>
        </div>
      </div>
    </aside>
  );
}
