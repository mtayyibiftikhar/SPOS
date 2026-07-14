"use client";

import { useState } from "react";
import { CalendarClock, RefreshCcw } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DayShiftSettingsPage() {
  const { currentSettings, t, updateSettings } = usePosApp();
  const [autoDayRolloverEnabled, setAutoDayRolloverEnabled] = useState(
    currentSettings?.pos.autoDayRolloverEnabled ?? false
  );

  if (!currentSettings) {
    return null;
  }

  return (
    <SettingsFormShell title={t("settings.dayShift")} subtitle={t("settings.dayShiftPageSubtitle")}>
      <form
        className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]"
        onSubmit={(event) => {
          event.preventDefault();
          updateSettings("pos", { autoDayRolloverEnabled });
        }}
      >
        <Card className="border-emerald-100 bg-emerald-50/60 p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
              <CalendarClock className="h-6 w-6" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
                  Auto day and shift rollover
                </h2>
                <Badge variant={autoDayRolloverEnabled ? "success" : "neutral"}>
                  {autoDayRolloverEnabled ? "On" : "Off"}
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                If yesterday&apos;s business day or shifts are still open, the POS closes them with expected cash,
                creates the day closing record, opens today&apos;s day, and starts the current staff shift when they sign in.
              </p>
            </div>
          </div>

          <label className="mt-6 flex items-center justify-between gap-4 rounded-[24px] border border-emerald-200 bg-white px-5 py-4">
            <span>
              <span className="block text-sm font-semibold text-ink">Enable automatic rollover</span>
              <span className="mt-1 block text-xs text-slate-500">Useful when staff forget to close at night.</span>
            </span>
            <input
              checked={autoDayRolloverEnabled}
              className="h-5 w-5 accent-emerald-600"
              type="checkbox"
              onChange={(event) => setAutoDayRolloverEnabled(event.target.checked)}
            />
          </label>
        </Card>

        <Card className="p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-slate-700">
              <RefreshCcw className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">How it behaves</h2>
              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <p className="rounded-2xl border border-line bg-shell px-4 py-3">One business day stays open for the shop.</p>
                <p className="rounded-2xl border border-line bg-shell px-4 py-3">Open shifts are still limited by the allowed device count.</p>
                <p className="rounded-2xl border border-line bg-shell px-4 py-3">Manual day and shift controls remain available from Dashboard.</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="xl:col-span-2">
          <Button type="submit">{t("common.saveChanges")}</Button>
        </div>
      </form>
    </SettingsFormShell>
  );
}
