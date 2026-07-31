"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Edit3,
  KeyRound,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  UsersRound
} from "lucide-react";
import { sanitizePhoneInput } from "@/lib/phone";
import {
  getAccessRoles,
  getUserAccessRoleId,
  reassignUsersFromAccessRole,
  SHOP_PERMISSION_OPTIONS
} from "@/lib/access-control";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn, formatDateTime } from "@/lib/utils";
import type { RolePermissionKey, ShopAccessRole, User } from "@/types/pos";

type UserFormState = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
};

type UsersView = "list" | "form" | "roles";

const emptyUserForm: UserFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "cashier"
};

export default function UsersPage() {
  const { currentSettings, currentUsers, deleteShopUser, locale, session, setUserActive, saveShopUser, t, updateSettings } = usePosApp();
  const [view, setView] = useState<UsersView>("list");
  const [query, setQuery] = useState("");
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<ShopAccessRole[]>(() => getAccessRoles(currentSettings?.pos));
  const [roleAssignmentDraft, setRoleAssignmentDraft] = useState<Record<string, string>>(
    () => ({ ...(currentSettings?.pos.userAccessRoleIds ?? {}) })
  );
  const [roleDeleteTargetId, setRoleDeleteTargetId] = useState<string | null>(null);
  const [roleReplacementId, setRoleReplacementId] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const canManageUsers = session?.role === "shop_admin" || session?.role === "super_admin";
  const accessRoles = useMemo(() => getAccessRoles(currentSettings?.pos), [currentSettings?.pos]);
  const accessRoleNames = useMemo(
    () => new Map(accessRoles.map((role) => [role.id, role.name])),
    [accessRoles]
  );
  const visibleUsers = useMemo(() => {
    const archived = new Set(currentSettings?.pos.archivedUserIds ?? []);
    return currentUsers.filter((user) => !archived.has(user.id));
  }, [currentSettings?.pos.archivedUserIds, currentUsers]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return visibleUsers;
    }

    return visibleUsers.filter((user) =>
      [user.name, user.email, user.phone, user.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    );
  }, [query, visibleUsers]);

  const resetForm = () => {
    setUserForm(emptyUserForm);
  };

  const openCreateUser = () => {
    setFeedback(null);
    setUserForm({ ...emptyUserForm, role: accessRoles[0]?.id ?? "cashier" });
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
      role: getUserAccessRoleId(user, currentSettings?.pos)
    });
    setView("form");
  };

  const handleSaveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageUsers) {
      return;
    }

    setIsSavingUser(true);
    const result = await saveShopUser({
      id: userForm.id,
      name: userForm.name,
      email: userForm.email,
      phone: userForm.phone,
      password: userForm.password,
      role: userForm.role === "shop_admin" ? "shop_admin" : "cashier"
    });

    setIsSavingUser(false);

    if (!result.ok) {
      setFeedback({
        tone: "error",
        message: result.message ?? t("users.saveError")
      });
      return;
    }

    if (result.userId) {
      const nextAssignments = { ...(currentSettings?.pos.userAccessRoleIds ?? {}) };
      if (userForm.role === "shop_admin") delete nextAssignments[result.userId];
      else nextAssignments[result.userId] = userForm.role;
      updateSettings("pos", { userAccessRoleIds: nextAssignments });
    }

    setFeedback({
      tone: "success",
      message: userForm.id ? t("users.updateSuccess") : t("users.createSuccess")
    });
    resetForm();
    setView("list");
  };

  const handleToggleUser = async (userId: string, isActive: boolean) => {
    setUpdatingUserId(userId);
    const result = await setUserActive(userId, isActive);
    setUpdatingUserId(null);

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

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Delete ${user.name}? Login access will be removed, but historical sales and reports will keep the user's name.`)) return;
    setDeletingUserId(user.id);
    const result = await deleteShopUser(user.id);
    setDeletingUserId(null);
    setFeedback(result.ok
      ? { tone: "success", message: `${user.name} was deleted. Historical report records were retained.` }
      : { tone: "error", message: result.message ?? "Unable to delete user." });
  };

  const openRoleAccess = () => {
    setFeedback(null);
    setRoleDraft(getAccessRoles(currentSettings?.pos));
    setRoleAssignmentDraft({ ...(currentSettings?.pos.userAccessRoleIds ?? {}) });
    setRoleDeleteTargetId(null);
    setRoleReplacementId("");
    setNewRoleName("");
    setView("roles");
  };

  const togglePermission = (roleId: string, permission: RolePermissionKey) => {
    setRoleDraft((current) => current.map((role) => {
      if (role.id !== roleId) return role;
      const permissions = new Set(role.permissions);

      if (permissions.has(permission)) {
        permissions.delete(permission);
      } else {
        permissions.add(permission);
      }

      return { ...role, permissions: Array.from(permissions), updatedAt: new Date().toISOString() };
    }));
  };

  const addRole = () => {
    const name = newRoleName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    setRoleDraft((current) => [
      ...current,
      { id: `role-${crypto.randomUUID()}`, name, permissions: [], createdAt: now, updatedAt: now }
    ]);
    setNewRoleName("");
  };

  const removeRole = (roleId: string) => {
    const affectedUsers = visibleUsers.filter(
      (user) => user.role !== "shop_admin" && (roleAssignmentDraft[user.id] ?? user.role) === roleId
    );
    if (!affectedUsers.length) {
      setRoleDraft((current) => current.filter((role) => role.id !== roleId));
      return;
    }

    const replacement = roleDraft.find((role) => role.id !== roleId);
    if (!replacement) {
      setFeedback({ tone: "error", message: "Create another role before deleting the only role in this shop." });
      return;
    }

    setRoleDeleteTargetId(roleId);
    setRoleReplacementId(replacement.id);
  };

  const confirmRoleDeletion = () => {
    if (!roleDeleteTargetId || !roleReplacementId || roleDeleteTargetId === roleReplacementId) return;
    const result = reassignUsersFromAccessRole(
      visibleUsers,
      roleAssignmentDraft,
      roleDeleteTargetId,
      roleReplacementId
    );
    setRoleAssignmentDraft(result.assignments);
    setRoleDraft((current) => current.filter((role) => role.id !== roleDeleteTargetId));
    setFeedback({
      tone: "success",
      message: `${result.reassignedUserIds.length} user${result.reassignedUserIds.length === 1 ? "" : "s"} will move to the selected role when you save.`
    });
    setRoleDeleteTargetId(null);
    setRoleReplacementId("");
  };

  const saveRoleAccess = () => {
    if (!canManageUsers) {
      return;
    }

    const normalizedNames = roleDraft.map((role) => role.name.trim().toLowerCase());
    if (normalizedNames.some((name) => !name) || new Set(normalizedNames).size !== normalizedNames.length) {
      setFeedback({ tone: "error", message: "Every role needs a unique name." });
      return;
    }

    updateSettings("pos", {
      accessRoles: roleDraft.map((role) => ({ ...role, name: role.name.trim() })),
      userAccessRoleIds: roleAssignmentDraft
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
          <p className="mt-4 font-display text-4xl font-semibold text-ink">{visibleUsers.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Active access</p>
          <p className="mt-4 font-display text-4xl font-semibold text-ink">
            {visibleUsers.filter((user) => user.isActive).length}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Admins</p>
          <p className="mt-4 font-display text-4xl font-semibold text-ink">
            {visibleUsers.filter((user) => user.role === "shop_admin").length}
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
                          {user.role === "shop_admin"
                            ? "Admin"
                            : accessRoleNames.get(getUserAccessRoleId(user, currentSettings?.pos)) ?? "Staff"}
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
                        disabled={updatingUserId === user.id}
                        onClick={() => void handleToggleUser(user.id, !user.isActive)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <UserMinus className="h-4 w-4" />
                          {user.isActive ? t("users.removeAccess") : t("users.restoreAccess")}
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={deletingUserId === user.id || user.id === session?.id}
                        onClick={() => void handleDeleteUser(user)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          Delete
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
            inputMode="tel"
            value={userForm.phone}
            onChange={(event) =>
              setUserForm((current) => ({
                ...current,
                phone: sanitizePhoneInput(event.target.value)
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
            <option value="shop_admin">Admin (full access)</option>
            {accessRoles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
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
          <Button disabled={isSavingUser || !canManageUsers || !userForm.name.trim() || !userForm.email.trim()} type="submit">
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

      <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-800 bg-[linear-gradient(135deg,#07111f_0%,#102a2b_100%)] p-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/20">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-xl font-semibold">Create a custom role</p>
            <p className="mt-1 text-sm text-white/65">Give it a clear name, then choose exactly which POS sections it can access.</p>
          </div>
        </div>
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            addRole();
          }}
        >
          <Input
            className="h-12 flex-1 border-white/15 bg-white text-slate-950 placeholder:text-slate-400"
            placeholder="Supervisor, Stock Controller, Accountant..."
            value={newRoleName}
            onChange={(event) => setNewRoleName(event.target.value)}
          />
          <Button
            className="h-12 min-w-40 rounded-2xl bg-emerald-500 px-6 text-white hover:bg-emerald-400"
            disabled={!canManageUsers || !newRoleName.trim()}
            type="submit"
          >
            <UserPlus className="mr-2 h-4 w-4" />Create role
          </Button>
        </form>
      </div>

      {roleDeleteTargetId ? (
        <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5">
          <p className="font-display text-lg font-semibold text-slate-950">
            Delete &quot;{roleDraft.find((role) => role.id === roleDeleteTargetId)?.name}&quot; and move its users
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Choose the role these users should receive. Their access changes together when you save.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-semibold text-slate-700">
              Move users to
              <Select
                className="mt-2"
                value={roleReplacementId}
                onChange={(event) => setRoleReplacementId(event.target.value)}
              >
                {roleDraft.filter((role) => role.id !== roleDeleteTargetId).map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </Select>
            </label>
            <Button variant="secondary" onClick={() => setRoleDeleteTargetId(null)}>Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-700" onClick={confirmRoleDeletion}>
              Move users and delete role
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {roleDraft.map((role) => (
          <div key={role.id} className="rounded-[28px] border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Input
                  className="h-10 font-semibold"
                  value={role.name}
                  onChange={(event) => setRoleDraft((current) => current.map((entry) =>
                    entry.id === role.id
                      ? { ...entry, name: event.target.value, updatedAt: new Date().toISOString() }
                      : entry
                  ))}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {role.permissions.length} enabled sections
                </p>
              </div>
              <button
                aria-label={`Delete ${role.name} role`}
                className="grid h-10 w-10 place-items-center rounded-2xl bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                onClick={() => removeRole(role.id)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {SHOP_PERMISSION_OPTIONS.map((permission) => {
                const enabled = role.permissions.includes(permission.key);

                return (
                  <button
                    key={permission.key}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition",
                      enabled ? "border-emerald-200 bg-emerald-50" : "border-line bg-shell/60 hover:bg-white"
                    )}
                    disabled={!canManageUsers}
                    type="button"
                    onClick={() => togglePermission(role.id, permission.key)}
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
        <Button variant="secondary" onClick={() => {
          setRoleDraft(getAccessRoles(currentSettings?.pos));
          setRoleAssignmentDraft({ ...(currentSettings?.pos.userAccessRoleIds ?? {}) });
          setRoleDeleteTargetId(null);
          setRoleReplacementId("");
        }}>
          Reset draft
        </Button>
        <Button disabled={!canManageUsers} onClick={saveRoleAccess}>
          {t("common.saveChanges")}
        </Button>
      </div>
    </Card>
  );

  if (!canManageUsers) {
    return (
      <SettingsFormShell title={t("settings.users")} subtitle="">
        <Card className="border-amber-200 bg-amber-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Admin only</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">User and role management is protected</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Only the shop admin can view users, create roles, or change access.</p>
        </Card>
      </SettingsFormShell>
    );
  }

  return (
    <SettingsFormShell title={t("settings.users")} subtitle="">
      {view === "list" ? renderUserList() : null}
      {view === "form" ? renderUserForm() : null}
      {view === "roles" ? renderRoleAccess() : null}
    </SettingsFormShell>
  );
}
