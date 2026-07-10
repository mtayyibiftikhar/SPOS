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
    <Card className="overflow-hidden rounded-[28px] border-white/80 bg-white/92">
      <div className="overflow-x-auto p-2 sm:p-3">
        <div className={cn("grid min-w-max gap-2", compact ? "grid-flow-col auto-cols-[190px]" : "grid-flow-col auto-cols-[210px]")}>
          {items.map((item) => (
            <Link
              key={item.id ?? item.href ?? item.label}
              className={cn(
                "flex items-center gap-3 rounded-[18px] border px-3 py-2.5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.05)]",
                item.active
                  ? "border-slate-950 bg-slate-950 text-white"
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
              <p className={cn("truncate text-sm font-semibold", item.active ? "text-white" : "text-ink")}>{item.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}
