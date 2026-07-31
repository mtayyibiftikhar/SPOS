import type { POSSettings, RolePermissionKey, SessionUser, ShopAccessRole, User } from "@/types/pos";

export const SHOP_PERMISSION_OPTIONS: Array<{
  key: RolePermissionKey;
  label: string;
  helper: string;
}> = [
  { key: "dashboard", label: "Dashboard", helper: "View shop overview and cash controls" },
  { key: "billing", label: "Billing", helper: "Create checkout bills and take payments" },
  { key: "customers", label: "Customers", helper: "View and manage customer records" },
  { key: "accounts", label: "Accounts", helper: "View customer balances and account payments" },
  { key: "products", label: "Products", helper: "View and manage products and categories" },
  { key: "inventory", label: "Inventory", helper: "Manage stock, suppliers, and purchase orders" },
  { key: "timeClock", label: "Time Clock", helper: "Use attendance, shifts, and payroll tools" },
  { key: "bills", label: "Bills", helper: "View and reprint sales receipts" },
  { key: "refunds", label: "Refunds", helper: "View and create refunds" },
  { key: "reports", label: "Reports", helper: "View sales and financial reports" },
  { key: "settings", label: "Settings", helper: "Change shop configuration (excluding users)" },
  { key: "backup", label: "Backup", helper: "Import and export store data" }
];

export const ALL_SHOP_PERMISSIONS = SHOP_PERMISSION_OPTIONS.map((option) => option.key);

export const DEFAULT_ACCESS_ROLES: ShopAccessRole[] = [
  {
    id: "cashier",
    name: "Cashier",
    permissions: ["dashboard", "billing", "customers", "accounts", "timeClock", "bills"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "support",
    name: "Support",
    permissions: ["dashboard", "customers", "bills", "reports"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

function uniquePermissions(permissions: RolePermissionKey[] | undefined) {
  const allowed = new Set<RolePermissionKey>(ALL_SHOP_PERMISSIONS);
  return Array.from(new Set(permissions ?? [])).filter((permission) => allowed.has(permission));
}

export function getAccessRoles(settings?: POSSettings | null): ShopAccessRole[] {
  const configured = settings?.accessRoles;

  if (configured?.length) {
    return configured.map((role) => ({ ...role, permissions: uniquePermissions(role.permissions) }));
  }

  return DEFAULT_ACCESS_ROLES.map((role) => ({
    ...role,
    permissions: uniquePermissions(settings?.rolePermissions?.[role.id as "cashier" | "support"] ?? role.permissions)
  }));
}

export function getUserAccessRoleId(user: Pick<User, "id" | "role">, settings?: POSSettings | null) {
  if (user.role === "shop_admin" || user.role === "super_admin") return "shop_admin";
  return settings?.userAccessRoleIds?.[user.id] ?? user.role;
}

export function mergeArchivedUserIds(
  ...sources: Array<ReadonlyArray<string | null | undefined> | null | undefined>
) {
  return Array.from(new Set(sources.flatMap((source) => source ?? []).filter((id): id is string => Boolean(id))));
}

export function reassignUsersFromAccessRole(
  users: Array<Pick<User, "id" | "role">>,
  assignments: Record<string, string> | undefined,
  removedRoleId: string,
  replacementRoleId: string
) {
  const nextAssignments = { ...(assignments ?? {}) };
  const reassignedUserIds: string[] = [];

  for (const user of users) {
    if (user.role === "shop_admin" || user.role === "super_admin") continue;
    if ((nextAssignments[user.id] ?? user.role) !== removedRoleId) continue;
    nextAssignments[user.id] = replacementRoleId;
    reassignedUserIds.push(user.id);
  }

  return { assignments: nextAssignments, reassignedUserIds };
}

export function hasShopPermission(
  session: Pick<SessionUser, "id" | "role" | "workspace"> | null | undefined,
  settings: POSSettings | null | undefined,
  permission: RolePermissionKey
) {
  if (!session || session.workspace !== "shop") return false;
  if (session.role === "shop_admin" || session.role === "super_admin") return true;

  const roleId = settings?.userAccessRoleIds?.[session.id] ?? session.role;
  const role = getAccessRoles(settings).find((entry) => entry.id === roleId);
  return role?.permissions.includes(permission) ?? false;
}

export function getSessionAccessRoleName(
  session: Pick<SessionUser, "id" | "role" | "workspace"> | null | undefined,
  settings?: POSSettings | null
) {
  if (!session) return "";
  if (session.role === "shop_admin" || session.role === "super_admin") return "Admin";
  const roleId = settings?.userAccessRoleIds?.[session.id] ?? session.role;
  return getAccessRoles(settings).find((role) => role.id === roleId)?.name ?? "Staff";
}

export function permissionForPath(pathname: string): RolePermissionKey | null {
  if (pathname === "/" || pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/billing")) return "billing";
  if (pathname.startsWith("/customers")) return "customers";
  if (pathname.startsWith("/accounts")) return "accounts";
  if (pathname.startsWith("/products")) return "products";
  if (pathname.startsWith("/inventory")) return "inventory";
  if (pathname.startsWith("/time-clock")) return "timeClock";
  if (pathname.startsWith("/bills")) return "bills";
  if (pathname.startsWith("/refunds")) return "refunds";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/settings/backup")) return "backup";
  if (pathname.startsWith("/settings")) return "settings";
  return null;
}
