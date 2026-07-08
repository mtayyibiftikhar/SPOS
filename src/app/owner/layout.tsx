"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { OwnerShell } from "@/components/layout/owner-shell";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requiredWorkspace="owner">
      <OwnerShell>{children}</OwnerShell>
    </AuthGuard>
  );
}
