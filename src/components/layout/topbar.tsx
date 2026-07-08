"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePosApp } from "@/components/providers/app-provider";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { mainNavItems } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Topbar({ minimal = false }: { minimal?: boolean }) {
  const pathname = usePathname();
  const { t } = usePosApp();

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/70 px-1 py-2 backdrop-blur",
        minimal && "lg:hidden"
      )}
    >
      <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {mainNavItems.map((item) => {
          const active = item.href === "/settings" ? pathname.startsWith("/settings") : pathname === item.href;

          return (
            <Link
              className={cn(
                "shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition",
                active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white hover:text-slate-950"
              )}
              href={item.href}
              key={item.href}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <LocaleSwitcher className="w-[132px] shrink-0" showLabel={false} />
    </div>
  );
}
