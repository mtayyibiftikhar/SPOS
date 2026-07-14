"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const { isHydrated, isShopCloudReady, logout, session, t } = usePosApp();
  const [ownerSessionStatus, setOwnerSessionStatus] = useState<"checking" | "valid" | "invalid">(
    requiredWorkspace === "owner" ? "checking" : "valid"
  );

  useEffect(() => {
    if (!isHydrated || requiredWorkspace !== "owner" || session?.workspace !== "owner") {
      return;
    }

    let active = true;

    void fetch("/api/auth/owner-login", { cache: "no-store" })
      .then((response) => {
        if (!active) return;
        setOwnerSessionStatus(response.ok ? "valid" : "invalid");

        if (!response.ok) logout();
      })
      .catch(() => {
        if (!active) return;
        setOwnerSessionStatus("invalid");
        logout();
      });

    return () => {
      active = false;
    };
  }, [isHydrated, logout, requiredWorkspace, session?.workspace]);

  if (!isHydrated) {
    return <BrandedLoadingScreen />;
  }

  if (requiredWorkspace === "shop" && session?.workspace === "shop" && !isShopCloudReady) {
    return <BrandedLoadingScreen message="Syncing the latest shop data from cloud..." />;
  }

  if (requiredWorkspace === "owner" && session?.workspace === "owner" && ownerSessionStatus === "checking") {
    return <BrandedLoadingScreen message="Verifying the secure owner session..." />;
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
