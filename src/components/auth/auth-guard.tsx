"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const router = useRouter();
  const { isHydrated, isShopCloudReady, logout, session } = usePosApp();
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

  useEffect(() => {
    if (isHydrated && (!session || session.workspace !== requiredWorkspace)) {
      router.replace("/login");
    }
  }, [isHydrated, requiredWorkspace, router, session]);

  useEffect(() => {
    if (!isHydrated || requiredWorkspace !== "shop" || session?.workspace !== "shop") return;

    const hostname = window.location.hostname;
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    if (isLocal) return;

    let active = true;

    void fetch("/api/auth/shop-login", { cache: "no-store" })
      .then((response) => {
        if (active && !response.ok) logout();
      })
      .catch(() => {
        if (active) logout();
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
    return <BrandedLoadingScreen message="Returning to sign in..." />;
  }

  return <>{children}</>;
}
