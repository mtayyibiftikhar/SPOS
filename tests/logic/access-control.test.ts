import assert from "node:assert/strict";
import test from "node:test";
import {
  getAccessRoles,
  getSessionAccessRoleName,
  hasShopPermission,
  mergeArchivedUserIds,
  permissionForPath,
  reassignUsersFromAccessRole
} from "../../src/lib/access-control";
import type { POSSettings, SessionUser } from "../../src/types/pos";

const cashier: SessionUser = {
  id: "user-1",
  shopId: "shop-1",
  name: "Cashier",
  email: "cashier@example.com",
  role: "cashier",
  workspace: "shop"
};

const baseSettings: POSSettings = {
  shopName: "Shop",
  address: "",
  phone: "",
  currency: "SAR"
};

test("shop admin always has full access", () => {
  assert.equal(hasShopPermission({ ...cashier, role: "shop_admin" }, baseSettings, "settings"), true);
  assert.equal(hasShopPermission({ ...cashier, role: "shop_admin" }, baseSettings, "refunds"), true);
});

test("custom role assignment controls permissions immediately", () => {
  const settings: POSSettings = {
    ...baseSettings,
    accessRoles: [{
      id: "stock-controller",
      name: "Stock Controller",
      permissions: ["products", "inventory"],
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z"
    }],
    userAccessRoleIds: { "user-1": "stock-controller" }
  };

  assert.equal(hasShopPermission(cashier, settings, "inventory"), true);
  assert.equal(hasShopPermission(cashier, settings, "billing"), false);
  assert.equal(getSessionAccessRoleName(cashier, settings), "Stock Controller");

  settings.accessRoles![0] = { ...settings.accessRoles![0], permissions: ["billing"] };
  assert.equal(hasShopPermission(cashier, settings, "inventory"), false);
  assert.equal(hasShopPermission(cashier, settings, "billing"), true);
});

test("legacy role permissions migrate into built-in access roles", () => {
  const roles = getAccessRoles({
    ...baseSettings,
    rolePermissions: { cashier: ["billing", "refunds"] }
  });
  const legacyCashier = roles.find((role) => role.id === "cashier");

  assert.deepEqual(legacyCashier?.permissions, ["billing", "refunds"]);
});

test("route permissions include every primary POS section", () => {
  assert.equal(permissionForPath("/accounts"), "accounts");
  assert.equal(permissionForPath("/settings/backup"), "backup");
  assert.equal(permissionForPath("/refunds/ref-1"), "refunds");
});

test("archived users remain hidden when the durable audit record outlives the snapshot", () => {
  assert.deepEqual(
    mergeArchivedUserIds(["snapshot-user"], ["audit-user", "snapshot-user", null]),
    ["snapshot-user", "audit-user"]
  );
});

test("deleting a role reassigns explicit and legacy role users", () => {
  const result = reassignUsersFromAccessRole(
    [
      { id: "legacy-cashier", role: "cashier" },
      { id: "custom-cashier", role: "cashier" },
      { id: "admin", role: "shop_admin" }
    ],
    { "custom-cashier": "cashier", admin: "cashier" },
    "cashier",
    "support"
  );

  assert.deepEqual(result.reassignedUserIds, ["legacy-cashier", "custom-cashier"]);
  assert.equal(result.assignments["legacy-cashier"], "support");
  assert.equal(result.assignments["custom-cashier"], "support");
  assert.equal(result.assignments.admin, "cashier");
});
