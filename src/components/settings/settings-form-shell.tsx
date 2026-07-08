"use client";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { usePosApp } from "@/components/providers/app-provider";

export function SettingsFormShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { t } = usePosApp();

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} eyebrow={t("nav.settings")} />
      <Card className="p-6 sm:p-8">{children}</Card>
    </div>
  );
}
