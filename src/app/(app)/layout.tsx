"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requiredWorkspace="shop">
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
