"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type WorkspaceSectionsNavItem = {
  active?: boolean;
  description?: string;
  href?: string;
  icon?: ComponentType<{ className?: string }>;
  id?: string;
  label: string;
};

export function WorkspaceSectionsNav({
  items,
  compact = false
}: {
  compact?: boolean;
  items: WorkspaceSectionsNavItem[];
}) {
  return (
    <Card className="rounded-[28px] border-white/80 bg-white/92 p-2 shadow-[0_18px_44px_rgba(15,23,42,0.06)] sm:p-3">
      <div
        className={cn(
          "grid gap-2",
          compact
            ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        )}
      >
          {items.map((item) => (
            <Link
              key={item.id ?? item.href ?? item.label}
              className={cn(
                "flex min-h-[68px] items-center gap-3 rounded-[20px] border px-3 py-3 transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.05)]",
                item.active
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_34px_rgba(15,23,42,0.14)]"
                  : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/60"
              )}
              href={item.href ?? `#${item.id}`}
            >
              <span
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]",
                  item.active ? "bg-white/12 text-white" : "bg-slate-100 text-slate-700"
                )}
              >
                {item.icon ? <item.icon className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
              </span>
              <p className={cn("line-clamp-2 text-sm font-semibold leading-tight", item.active ? "text-white" : "text-ink")}>{item.label}</p>
            </Link>
          ))}
      </div>
    </Card>
  );
}
