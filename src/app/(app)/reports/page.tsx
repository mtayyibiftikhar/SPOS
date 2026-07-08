"use client";

import { ReportsOverview } from "@/components/reports/reports-overview";
import { usePosApp } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/ui/page-header";

export default function ReportsPage() {
  const { t } = usePosApp();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        eyebrow={t("nav.reports")}
      />
      <ReportsOverview />
    </div>
  );
}
