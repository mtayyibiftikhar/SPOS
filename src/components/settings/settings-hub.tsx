"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { settingsLinks } from "@/lib/constants";
import { usePosApp } from "@/components/providers/app-provider";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export function SettingsHub() {
  const { t } = usePosApp();

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} eyebrow={t("nav.settings")} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {settingsLinks.map((item) => (
          <Link
            key={item.href}
            className="rounded-3xl border border-line bg-panel p-5 shadow-card transition hover:-translate-y-0.5"
            href={item.href}
          >
            <p className="text-base font-semibold text-ink">{t(item.titleKey)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(item.subtitleKey)}</p>
            <span className="mt-5 inline-flex items-center text-sm font-medium text-ink">
              <span className="inline-flex items-center gap-2">
                {t("common.open")}
                <ArrowRight className="h-4 w-4" />
              </span>
            </span>
          </Link>
        ))}
      </div>

      <Card className="p-6">
        <p className="text-sm leading-6 text-slate-600">{t("settings.hubNotice")}</p>
      </Card>
    </div>
  );
}
