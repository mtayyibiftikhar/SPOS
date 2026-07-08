import type { User } from "@/types/pos";
import { hashSecret } from "@/lib/utils";

export const SHOP_DEMO_PASSWORD = "demo1234";

export const OWNER_ADMIN_CREDENTIALS = {
  email: "owner.admin@simplepos.sa",
  password: "Owner#POS2026!"
} as const;

export function normalizeDemoUsers(users: User[], ownerSeed: User) {
  let ownerFound = false;

  const normalizedUsers = users.map((user) => {
    if (user.role !== "super_admin") {
      return user;
    }

    ownerFound = true;

    return {
      ...user,
      email: OWNER_ADMIN_CREDENTIALS.email,
      passwordHash: hashSecret(OWNER_ADMIN_CREDENTIALS.password),
      isActive: true
    };
  });

  if (ownerFound) {
    return normalizedUsers;
  }

  return [
    {
      ...ownerSeed,
      email: OWNER_ADMIN_CREDENTIALS.email,
      passwordHash: hashSecret(OWNER_ADMIN_CREDENTIALS.password),
      isActive: true
    },
    ...normalizedUsers
  ];
}
