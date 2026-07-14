"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgePercent,
  CalendarClock,
  ContactRound,
  Headset,
  Printer,
  ReceiptText,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Store,
  UploadCloud
} from "lucide-react";
import { settingsLinks } from "@/lib/constants";
import { usePosApp } from "@/components/providers/app-provider";
import { cn } from "@/lib/utils";

const settingIcons = {
  "/settings/shop": Store,
  "/settings/day-shift": CalendarClock,
  "/settings/printers": Printer,
  "/settings/receipt": ReceiptText,
  "/settings/tax": ShieldCheck,
  "/settings/discounts": BadgePercent,
  "/settings/trash": RotateCcw,
  "/settings/users": ContactRound,
  "/settings/backup": UploadCloud,
  "/settings/support": Headset
} as const;

const staffVisibleSettings = new Set(["/settings/support"]);

export function SettingsSectionNav() {
  const pathname = usePathname();
  const { session, t } = usePosApp();
  const canManageSettings = session?.role === "shop_admin" || session?.role === "super_admin";
  const visibleLinks = canManageSettings
    ? settingsLinks
    : settingsLinks.filter((item) => staffVisibleSettings.has(item.href));

  return (
    <div className="rounded-[30px] border border-white/80 bg-white/90 p-3 shadow-[0_22px_70px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {visibleLinks.map((item) => {
          const Icon = settingIcons[item.href as keyof typeof settingIcons] ?? Settings2;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              className={cn(
                "group flex min-h-[74px] items-center gap-3 rounded-[22px] border px-4 py-3 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/60",
                isActive
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)]"
                  : "border-slate-200 bg-white text-slate-950"
              )}
              href={item.href}
            >
              <span
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition",
                  isActive ? "bg-white/12 text-white" : "bg-slate-50 text-slate-700 group-hover:bg-white"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{t(item.titleKey)}</span>
                <span className={cn("mt-1 block truncate text-xs", isActive ? "text-white/70" : "text-slate-500")}>
                  {t(item.subtitleKey)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
