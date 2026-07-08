"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePosApp } from "@/components/providers/app-provider";
import { BrandedLoadingScreen } from "@/components/shared/branded-loading-screen";
import type { WorkspaceKind } from "@/types/pos";

export function AuthGuard({
  children,
  requiredWorkspace
}: {
  children: React.ReactNode;
  requiredWorkspace: WorkspaceKind;
}) {
  const { isHydrated, session, t } = usePosApp();

  if (!isHydrated) {
    return <BrandedLoadingScreen />;
  }

  if (!session || session.workspace !== requiredWorkspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-shell p-6">
        <Card className="max-w-lg p-8 text-center">
          <h1 className="font-display text-3xl font-semibold text-ink">{t("auth.requiredTitle")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("auth.requiredDescription")}</p>
          <Button asChild className="mt-6">
            <Link href="/login">{t("common.backToLogin")}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
