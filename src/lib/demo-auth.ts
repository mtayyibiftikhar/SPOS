import type { User } from "@/types/pos";
import { hashSecret } from "@/lib/utils";

export const SHOP_DEMO_PASSWORD = "demo1234";

export type OwnerBootstrapAccount = {
  email: string;
  passwordHash: string;
};

export const OWNER_ADMIN_CREDENTIALS = {
  email: "owner.admin@simplepos.sa",
  password: "Owner#POS2026!"
} as const;

export const DEFAULT_OWNER_BOOTSTRAP: OwnerBootstrapAccount = {
  email: OWNER_ADMIN_CREDENTIALS.email,
  passwordHash: hashSecret(OWNER_ADMIN_CREDENTIALS.password)
};

export function normalizeDemoUsers(
  users: User[],
  ownerSeed: User,
  ownerBootstrap: OwnerBootstrapAccount = DEFAULT_OWNER_BOOTSTRAP
) {
  let ownerFound = false;

  const normalizedUsers = users.map((user) => {
    if (user.role !== "super_admin") {
      return user;
    }

    ownerFound = true;

    return {
      ...user,
      email: ownerBootstrap.email,
      passwordHash: ownerBootstrap.passwordHash,
      isActive: true
    };
  });

  if (ownerFound) {
    return normalizedUsers;
  }

  return [
    {
      ...ownerSeed,
      email: ownerBootstrap.email,
      passwordHash: ownerBootstrap.passwordHash,
      isActive: true
    },
    ...normalizedUsers
  ];
}
