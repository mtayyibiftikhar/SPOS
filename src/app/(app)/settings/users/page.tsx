"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Edit3,
  KeyRound,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UsersRound
} from "lucide-react";
import { userRoleLabelKeys } from "@/lib/i18n";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn, formatDateTime } from "@/lib/utils";
import type { RolePermissionKey, User, UserRole } from "@/types/pos";

type UserFormState = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Exclude<UserRole, "super_admin">;
};

type UsersView = "list" | "form" | "roles";

const emptyUserForm: UserFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "cashier"
};

const permissionOptions: Array<{
  key: RolePermissionKey;
  label: string;
  helper: string;
}> = [
  { key: "billing", label: "Billing", helper: "Create checkout bills" },
  { key: "customers", label: "Customers", helper: "Manage customer records" },
  { key: "products", label: "Products", helper: "Add and edit products" },
  { key: "inventory", label: "Inventory", helper: "Stock and supplier control" },
  { key: "timeClock", label: "Time Clock", helper: "Clock-in, attendance, and payroll" },
  { key: "bills", label: "Bills", helper: "View and reprint receipts" },
  { key: "refunds", label: "Refunds", helper: "Create and view returns" },
  { key: "reports", label: "Reports", helper: "View business reports" },
  { key: "settings", label: "Settings", helper: "Change shop configuration" },
  { key: "backup", label: "Backup", helper: "Import and export store data" }
];

const manageableRoles: Array<Exclude<UserRole, "super_admin">> = ["shop_admin", "cashier", "support"];

const defaultRolePermissions: Record<Exclude<UserRole, "super_admin">, RolePermissionKey[]> = {
  shop_admin: permissionOptions.map((option) => option.key),
  cashier: ["billing", "customers", "timeClock", "bills"],
  support: ["customers", "bills", "reports"]
};

function mergeRolePermissions(
  permissions?: Partial<Record<Exclude<UserRole, "super_admin">, RolePermissionKey[]>>
) {
  return manageableRoles.reduce<Record<Exclude<UserRole, "super_admin">, RolePermissionKey[]>>((accumulator, role) => {
    accumulator[role] = permissions?.[role] ?? defaultRolePermissions[role];
    return accumulator;
  }, { ...defaultRolePermissions });
}

export default function UsersPage() {
  const { currentSettings, currentUsers, locale, session, setUserActive, saveShopUser, t, updateSettings } = usePosApp();
  const [view, setView] = useState<UsersView>("list");
  const [query, setQuery] = useState("");
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [roleDraft, setRoleDraft] = useState(() => mergeRolePermissions(currentSettings?.pos.rolePermissions));
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const canManageUsers = session?.role === "shop_admin" || session?.role === "super_admin";

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return currentUsers;
    }

    return currentUsers.filter((user) =>
      [user.name, user.email, user.phone, user.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    );
  }, [currentUsers, query]);

  const resetForm = () => {
    setUserForm(emptyUserForm);
  };

  const openCreateUser = () => {
    setFeedback(null);
    resetForm();
    setView("form");
  };

  const startEditUser = (user: User) => {
    setFeedback(null);
    setUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      password: "",
      role: user.role === "super_admin" ? "shop_admin" : user.role
    });
    setView("form");
  };

  const handleSaveUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageUsers) {
      return;
    }

    const result = saveShopUser({
      id: userForm.id,
      name: userForm.name,
      email: userForm.email,
      phone: userForm.phone,
      password: userForm.password,
      role: userForm.role
    });

    if (!result.ok) {
      setFeedback({
        tone: "error",
        message: result.message ?? t("users.saveError")
      });
      return;
    }

    setFeedback({
      tone: "success",
      message: userForm.id ? t("users.updateSuccess") : t("users.createSuccess")
    });
    resetForm();
    setView("list");
  };

  const handleToggleUser = (userId: string, isActive: boolean) => {
    const result = setUserActive(userId, isActive);

    if (!result.ok) {
      setFeedback({
        tone: "error",
        message: result.message ?? t("users.accessError")
      });
      return;
    }

    setFeedback({
      tone: "success",
      message: isActive ? t("users.reactivateSuccess") : t("users.deactivateSuccess")
    });
  };

  const openRoleAccess = () => {
    setFeedback(null);
    setRoleDraft(mergeRolePermissions(currentSettings?.pos.rolePermissions));
    setView("roles");
  };

  const togglePermission = (role: Exclude<UserRole, "super_admin">, permission: RolePermissionKey) => {
    setRoleDraft((current) => {
      const permissions = new Set(current[role] ?? []);

      if (permissions.has(permission)) {
        permissions.delete(permission);
      } else {
        permissions.add(permission);
      }

      return {
        ...current,
        [role]: Array.from(permissions)
      };
    });
  };

  const saveRoleAccess = () => {
    if (!canManageUsers) {
      return;
    }

    updateSettings("pos", {
      rolePermissions: roleDraft
    });
    setFeedback({
      tone: "success",
      message: "Role access saved."
    });
    setView("list");
  };

  const renderFeedback = () =>
    feedback ? (
      <div
        className={`rounded-2xl px-4 py-3 text-sm font-medium ${
          feedback.tone === "success"
            ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border border-rose-200 bg-rose-50 text-rose-800"
        }`}
      >
        {feedback.message}
      </div>
    ) : null;

  const renderUserList = () => (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Total users</p>
          <p className="mt-4 font-display text-4xl font-semibold text-ink">{currentUsers.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Active access</p>
          <p className="mt-4 font-display text-4xl font-semibold text-ink">
            {currentUsers.filter((user) => user.isActive).length}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Admins</p>
          <p className="mt-4 font-display text-4xl font-semibold text-ink">
            {currentUsers.filter((user) => user.role === "shop_admin").length}
          </p>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("settings.users")}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">User access</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={!canManageUsers} variant="secondary" onClick={openRoleAccess}>
              <span className="inline-flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Role access
              </span>
            </Button>
            <Button disabled={!canManageUsers} onClick={openCreateUser}>
              <span className="inline-flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                New user
              </span>
            </Button>
          </div>
        </div>

        {renderFeedback()}

        {!canManageUsers ? (
          <div className="mt-5 rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
            {t("users.readOnlyNotice")}
          </div>
        ) : null}

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-11"
            placeholder="Search user, email, phone, or role"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="mt-5 grid gap-3">
          {filteredUsers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line bg-shell/70 p-8 text-center text-sm text-slate-600">
              No users matched the current search.
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.id}
                className="rounded-[26px] border border-line bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                      <UsersRound className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-ink">{user.name}</p>
                        <Badge variant={user.role === "shop_admin" ? "warning" : "neutral"}>
                          {t(userRoleLabelKeys[user.role])}
                        </Badge>
                        <Badge variant={user.isActive ? "success" : "danger"}>
                          {user.isActive ? t("common.active") : t("common.inactive")}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{user.email}</p>
                      {user.phone ? <p className="mt-1 text-sm text-slate-600">{user.phone}</p> : null}
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                        {t("users.lastLoginLine", { date: formatDateTime(user.lastLoginAt, locale) })}
                      </p>
                    </div>
                  </div>

                  {canManageUsers ? (
                    <div className="flex flex-wrap gap-3">
                      <Button size="sm" variant="secondary" onClick={() => startEditUser(user)}>
                        <span className="inline-flex items-center gap-2">
                          <Edit3 className="h-4 w-4" />
                          {t("common.edit")}
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant={user.isActive ? "danger" : "secondary"}
                        onClick={() => handleToggleUser(user.id, !user.isActive)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <UserMinus className="h-4 w-4" />
                          {user.isActive ? t("users.removeAccess") : t("users.restoreAccess")}
                        </span>
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );

  const renderUserForm = () => (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("users.manageLabel")}</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
            {userForm.id ? t("users.editTitle") : t("users.createTitle")}
          </h2>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setFeedback(null);
            resetForm();
            setView("list");
          }}
        >
          <span className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to users
          </span>
        </Button>
      </div>

      <div className="mt-5">{renderFeedback()}</div>

      <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={handleSaveUser}>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">User name</label>
          <Input
            disabled={!canManageUsers}
            value={userForm.name}
            onChange={(event) =>
              setUserForm((current) => ({
                ...current,
                name: event.target.value
              }))
            }
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.email")}</label>
          <Input
            disabled={!canManageUsers}
            type="email"
            value={userForm.email}
            onChange={(event) =>
              setUserForm((current) => ({
                ...current,
                email: event.target.value
              }))
            }
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.phone")}</label>
          <Input
            disabled={!canManageUsers}
            value={userForm.phone}
            onChange={(event) =>
              setUserForm((current) => ({
                ...current,
                phone: event.target.value
              }))
            }
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("users.roleLabel")}</label>
          <Select
            disabled={!canManageUsers}
            value={userForm.role}
            onChange={(event) =>
              setUserForm((current) => ({
                ...current,
                role: event.target.value as UserFormState["role"]
              }))
            }
          >
            <option value="shop_admin">{t(userRoleLabelKeys.shop_admin)}</option>
            <option value="cashier">{t(userRoleLabelKeys.cashier)}</option>
            <option value="support">{t(userRoleLabelKeys.support)}</option>
          </Select>
        </div>

        <div className="lg:col-span-2">
          <label className="mb-2 block text-sm font-medium text-ink">{t("login.password")}</label>
          <Input
            disabled={!canManageUsers}
            minLength={8}
            placeholder={userForm.id ? t("users.passwordPlaceholderEdit") : t("users.passwordPlaceholderNew")}
            type="password"
            value={userForm.password}
            onChange={(event) =>
              setUserForm((current) => ({
                ...current,
                password: event.target.value
              }))
            }
          />
          <p className="mt-2 text-xs text-slate-500">Minimum password length is 8 characters.</p>
        </div>

        <div className="flex flex-wrap gap-3 lg:col-span-2">
          <Button disabled={!canManageUsers || !userForm.name.trim() || !userForm.email.trim()} type="submit">
            <span className="inline-flex items-center gap-2">
              {userForm.id ? <Edit3 className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {userForm.id ? t("users.updateAction") : t("users.createAction")}
            </span>
          </Button>
          <Button
            disabled={!canManageUsers}
            type="button"
            variant="secondary"
            onClick={() => {
              setFeedback(null);
              resetForm();
            }}
          >
            {t("common.clearForm")}
          </Button>
        </div>
      </form>
    </Card>
  );

  const renderRoleAccess = () => (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">Permissions</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Role access panel</h2>
        </div>
        <Button variant="secondary" onClick={() => setView("list")}>
          <span className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to users
          </span>
        </Button>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {manageableRoles.map((role) => (
          <div key={role} className="rounded-[28px] border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{t(userRoleLabelKeys[role])}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {roleDraft[role]?.length ?? 0} enabled sections
                </p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {permissionOptions.map((permission) => {
                const enabled = roleDraft[role]?.includes(permission.key) ?? false;

                return (
                  <button
                    key={permission.key}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition",
                      enabled ? "border-emerald-200 bg-emerald-50" : "border-line bg-shell/60 hover:bg-white"
                    )}
                    disabled={!canManageUsers || role === "shop_admin"}
                    type="button"
                    onClick={() => togglePermission(role, permission.key)}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-ink">{permission.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{permission.helper}</span>
                    </span>
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold",
                        enabled ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-slate-400"
                      )}
                    >
                      {enabled ? "ON" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={() => setRoleDraft(mergeRolePermissions(currentSettings?.pos.rolePermissions))}>
          Reset draft
        </Button>
        <Button disabled={!canManageUsers} onClick={saveRoleAccess}>
          {t("common.saveChanges")}
        </Button>
      </div>
    </Card>
  );

  return (
    <SettingsFormShell title={t("settings.users")} subtitle="">
      {view === "list" ? renderUserList() : null}
      {view === "form" ? renderUserForm() : null}
      {view === "roles" ? renderRoleAccess() : null}
    </SettingsFormShell>
  );
}
