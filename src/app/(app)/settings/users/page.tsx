"use client";

import { useState } from "react";
import { Edit3, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { userRoleLabelKeys } from "@/lib/i18n";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import type { User } from "@/types/pos";

type UserFormState = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Exclude<User["role"], "super_admin">;
};

const emptyUserForm: UserFormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "cashier"
};

export default function UsersPage() {
  const { currentUsers, locale, session, setUserActive, saveShopUser, t } = usePosApp();
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const canManageUsers = session?.role === "shop_admin" || session?.role === "super_admin";

  const resetForm = () => {
    setUserForm(emptyUserForm);
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
  };

  const handleSaveUser = (event: React.FormEvent<HTMLFormElement>) => {
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

  return (
    <SettingsFormShell
      title={t("settings.users")}
      subtitle={t("settings.usersPageSubtitle")}
    >
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("users.manageLabel")}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
                {userForm.id ? t("users.editTitle") : t("users.createTitle")}
              </h2>
            </div>
            <ShieldCheck className="h-5 w-5 text-ink" />
          </div>

          {!canManageUsers ? (
            <div className="mt-5 rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
              {t("users.readOnlyNotice")}
            </div>
          ) : null}

          {feedback ? (
            <div
              className={`mt-5 rounded-2xl px-4 py-3 text-sm font-medium ${
                feedback.tone === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {feedback.message}
            </div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSaveUser}>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("common.customerName")}</label>
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

            <div className="grid gap-4 md:grid-cols-2">
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
            </div>

            <div>
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
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!canManageUsers || !userForm.name.trim() || !userForm.email.trim()}
                type="submit"
              >
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

        <div className="space-y-4">
          {currentUsers.map((user) => (
            <Card key={user.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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

                <div className="flex flex-wrap gap-3">
                  {canManageUsers ? (
                    <>
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
                    </>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </SettingsFormShell>
  );
}
