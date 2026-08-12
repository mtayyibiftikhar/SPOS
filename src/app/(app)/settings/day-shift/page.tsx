"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Camera, Fingerprint, KeyRound, LocateFixed, QrCode, RefreshCcw, Smartphone } from "lucide-react";
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
  const [attendanceEnabled, setAttendanceEnabled] = useState(
    currentSettings?.pos.attendanceEnabled ?? true
  );
  const [attendanceAllowQrLink, setAttendanceAllowQrLink] = useState(
    currentSettings?.pos.attendanceAllowQrLink ?? true
  );
  const [attendanceRequireLocation, setAttendanceRequireLocation] = useState(
    currentSettings?.pos.attendanceRequireLocation ?? true
  );
  const [attendanceRequireSelfie, setAttendanceRequireSelfie] = useState(
    currentSettings?.pos.attendanceRequireSelfie ?? false
  );
  const [attendanceAllowKioskPin, setAttendanceAllowKioskPin] = useState(currentSettings?.pos.attendanceAllowKioskPin ?? true);
  const [attendanceAllowFingerprint, setAttendanceAllowFingerprint] = useState(currentSettings?.pos.attendanceAllowFingerprint ?? false);
  const [attendanceAllowPersonalBiometric, setAttendanceAllowPersonalBiometric] = useState(currentSettings?.pos.attendanceAllowPersonalBiometric ?? false);
  const [attendanceGeofenceRadiusMeters, setAttendanceGeofenceRadiusMeters] = useState(currentSettings?.pos.attendanceGeofenceRadiusMeters ?? 100);
  const [attendanceLatitude, setAttendanceLatitude] = useState<number | undefined>(currentSettings?.pos.attendanceLatitude);
  const [attendanceLongitude, setAttendanceLongitude] = useState<number | undefined>(currentSettings?.pos.attendanceLongitude);
  const [locationFeedback, setLocationFeedback] = useState<string | null>(null);

  if (!currentSettings) {
    return null;
  }

  return (
    <SettingsFormShell title={t("settings.dayShift")} subtitle={t("settings.dayShiftPageSubtitle")}>
      <form
        className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]"
        onSubmit={(event) => {
          event.preventDefault();
          updateSettings("pos", {
            attendanceEnabled,
            attendanceAllowQrLink,
            attendanceRequireLocation,
            attendanceRequireSelfie,
            attendanceAllowKioskPin,
            attendanceAllowFingerprint,
            attendanceAllowPersonalBiometric,
            attendanceGeofenceRadiusMeters,
            attendanceLatitude,
            attendanceLongitude,
            autoDayRolloverEnabled
          });
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

        <Card className="p-6 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-emerald-700">Attendance rules</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">Choose what staff must capture</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Clock-in can use location, a selfie, both, or a simple confirmation. Admin bypass remains available for emergencies.
              </p>
            </div>
            <Badge variant={attendanceEnabled ? "success" : "neutral"}>{attendanceEnabled ? "Required" : "Off"}</Badge>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <span className="flex items-center gap-3">
                <CalendarClock className="h-5 w-5 text-slate-700" />
                <span className="text-sm font-semibold text-slate-950">Require clock-in</span>
              </span>
              <input checked={attendanceEnabled} className="h-5 w-5 accent-emerald-600" onChange={(event) => setAttendanceEnabled(event.target.checked)} type="checkbox" />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border border-slate-200 bg-white px-4 py-4">
              <span className="flex items-center gap-3">
                <QrCode className="h-5 w-5 text-emerald-700" />
                <span>
                  <span className="block text-sm font-semibold text-slate-950">Staff-phone QR</span>
                  <span className="mt-1 block text-xs text-slate-500">Allow the employee-bound mobile link.</span>
                </span>
              </span>
              <input checked={attendanceAllowQrLink} className="h-5 w-5 accent-emerald-600" disabled={!attendanceEnabled} onChange={(event) => setAttendanceAllowQrLink(event.target.checked)} type="checkbox" />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border border-slate-200 bg-white px-4 py-4">
              <span className="flex items-center gap-3">
                <LocateFixed className="h-5 w-5 text-emerald-700" />
                <span className="text-sm font-semibold text-slate-950">Capture location</span>
              </span>
              <input checked={attendanceRequireLocation} className="h-5 w-5 accent-emerald-600" disabled={!attendanceEnabled} onChange={(event) => setAttendanceRequireLocation(event.target.checked)} type="checkbox" />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border border-slate-200 bg-white px-4 py-4">
              <span className="flex items-center gap-3">
                <Camera className="h-5 w-5 text-emerald-700" />
                <span className="text-sm font-semibold text-slate-950">Capture selfie</span>
              </span>
              <input checked={attendanceRequireSelfie} className="h-5 w-5 accent-emerald-600" disabled={!attendanceEnabled} onChange={(event) => setAttendanceRequireSelfie(event.target.checked)} type="checkbox" />
            </label>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Store kiosk and biometrics</p>
                <p className="mt-1 text-xs text-slate-500">The kiosk works only on an activated store device. Fingerprint becomes operational after supported hardware is enrolled.</p>
              </div>
              <Link className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white" href="/time-clock/kiosk">Open attendance kiosk</Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                { checked: attendanceAllowKioskPin, icon: KeyRound, label: "Employee ID + PIN", setter: setAttendanceAllowKioskPin },
                { checked: attendanceAllowFingerprint, icon: Fingerprint, label: "Fingerprint terminal", setter: setAttendanceAllowFingerprint },
                { checked: attendanceAllowPersonalBiometric, icon: Smartphone, label: "Personal device biometric", setter: setAttendanceAllowPersonalBiometric }
              ].map(({ checked, icon: Icon, label, setter }) => (
                <label className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-4" key={label}>
                  <span className="flex items-center gap-3 text-sm font-semibold text-slate-950"><Icon className="h-5 w-5 text-emerald-700" />{label}</span>
                  <input checked={checked} className="h-5 w-5 accent-emerald-600" disabled={!attendanceEnabled} onChange={(event) => setter(event.target.checked)} type="checkbox" />
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,24rem)_auto] md:items-end">
              <label className="block text-sm font-semibold text-slate-950">
                Store boundary radius (metres)
                <input className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4" max={5000} min={25} onChange={(event) => setAttendanceGeofenceRadiusMeters(Math.max(25, Math.min(5000, Number(event.target.value) || 100)))} type="number" value={attendanceGeofenceRadiusMeters} />
              </label>
              <Button
                onClick={() => {
                  setLocationFeedback("Capturing store location...");
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      setAttendanceLatitude(position.coords.latitude);
                      setAttendanceLongitude(position.coords.longitude);
                      setLocationFeedback(`Store location captured (accuracy ${Math.round(position.coords.accuracy)}m). Save changes to activate the boundary.`);
                    },
                    () => setLocationFeedback("Location could not be captured. Allow location access and try again."),
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
                  );
                }}
                type="button"
                variant="secondary"
              >
                <LocateFixed className="mr-2 h-4 w-4" /> Set this device as store location
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {locationFeedback ?? (attendanceLatitude != null && attendanceLongitude != null ? `Boundary centre saved at ${attendanceLatitude.toFixed(5)}, ${attendanceLongitude.toFixed(5)}.` : "No store boundary centre is saved yet; GPS will be recorded but not distance-restricted.")}
            </p>
          </div>
        </Card>

        <div className="xl:col-span-2">
          <Button type="submit">{t("common.saveChanges")}</Button>
        </div>
      </form>
    </SettingsFormShell>
  );
}
