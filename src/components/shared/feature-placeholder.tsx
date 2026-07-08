"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function FeaturePlaceholder({
  title,
  description,
  phase,
  actionHref,
  actionLabel
}: {
  title: string;
  description: string;
  phase: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const { t } = usePosApp();

  return (
    <Card className="p-6 sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("placeholder.phaseLabel")}</p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ink">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="rounded-3xl border border-dashed border-line bg-shell/60 p-5">
          <p className="text-sm font-semibold text-ink">{t("placeholder.nextStep")}</p>
          <p className="mt-2 text-sm text-slate-600">{phase}</p>
          {actionHref && actionLabel ? (
            <Button asChild className="mt-5 w-full">
              <Link href={actionHref}>
                <span className="inline-flex items-center gap-2">
                  {actionLabel}
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
