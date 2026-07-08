"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type WorkspaceSectionsNavItem = {
  active?: boolean;
  description?: string;
  href?: string;
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
    <Card className="overflow-hidden">
      <div className="bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfa_100%)] p-3 sm:p-4">
        <div className={cn("grid gap-2", compact ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-5")}>
          {items.map((item) => (
            <Link
              key={item.id ?? item.href ?? item.label}
              className={cn(
                "rounded-[20px] border px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.05)]",
                item.active
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/60"
              )}
              href={item.href ?? `#${item.id}`}
            >
              <p className={cn("text-sm font-semibold", item.active ? "text-white" : "text-ink")}>{item.label}</p>
              {item.description ? (
                <p className={cn("mt-1 text-xs leading-5", item.active ? "text-white/72" : "text-slate-500")}>
                  {item.description}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}
