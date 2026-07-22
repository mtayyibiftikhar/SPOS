"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock3, LocateFixed, QrCode, ShieldCheck } from "lucide-react";
import { buildQrCodeImageUrl } from "@/lib/qr-code";
import { resizeImageFileToDataUrl } from "@/lib/image-upload";
import { findOpenAttendanceRecord } from "@/lib/attendance";
import { cn, formatBusinessDate, formatDateTime } from "@/lib/utils";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AttendanceLocation } from "@/types/pos";

async function readJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text) as {
      attendanceId?: string;
      clockedIn?: boolean;
      message?: string;
      ok?: boolean;
      scanUrl?: string;
    };
  } catch {
    return { ok: false, message: text.trim() || `Attendance service returned HTTP ${response.status}.` };
  }
}

async function optimizeSelfie(file: File) {
  const optimized = await resizeImageFileToDataUrl(file, {
    maxBytes: 360 * 1024,
    maxHeight: 720,
    maxWidth: 720,
    minQuality: 0.52,
    outputType: "image/jpeg",
    quality: 0.78
  });
  const blob = await fetch(optimized.dataUrl).then((response) => response.blob());

  return {
    file: new File([blob], `attendance-selfie-${Date.now()}.jpg`, { type: "image/jpeg" }),
    preview: optimized.dataUrl
  };
}

export function AttendanceGate({ children }: { children: React.ReactNode }) {
  const {
    currentBusinessDay,
    currentSettings,
    currentShop,
    currentShopId,
    locale,
    session,
    state
  } = usePosApp();
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const [location, setLocation] = useState<AttendanceLocation | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfieUrl, setSelfieUrl] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [scanUrl, setScanUrl] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [remoteClockedIn, setRemoteClockedIn] = useState(false);
  const [adminBypassActive, setAdminBypassActive] = useState(false);
  const attendanceEnabled = currentSettings?.pos.attendanceEnabled ?? true;
  const allowQrLink = currentSettings?.pos.attendanceAllowQrLink ?? true;
  const requireLocation = currentSettings?.pos.attendanceRequireLocation ?? true;
  const requireSelfie = currentSettings?.pos.attendanceRequireSelfie ?? false;
  const openAttendance = useMemo(
    () =>
      currentShopId && session?.workspace === "shop"
        ? findOpenAttendanceRecord(
            state.attendanceRecords,
            currentShopId,
            session.id,
            currentBusinessDay?.businessDate
          )
        : null,
    [currentBusinessDay, currentShopId, session, state.attendanceRecords]
  );
  const bypassStorageKey =
    currentShopId && session?.workspace === "shop" && currentBusinessDay
      ? `pos-attendance-bypass:${currentShopId}:${session.id}:${currentBusinessDay.businessDate}`
      : "";

  useEffect(() => {
    if (!bypassStorageKey || typeof window === "undefined") {
      setAdminBypassActive(false);
      return;
    }

    setAdminBypassActive(window.sessionStorage.getItem(bypassStorageKey) === "1");
  }, [bypassStorageKey]);

  useEffect(() => {
    if (
      !attendanceEnabled ||
      openAttendance ||
      !currentShopId ||
      !session ||
      !currentBusinessDay ||
      typeof window === "undefined"
    ) {
      return;
    }

    let active = true;

    const prepareAttendance = async () => {
      const query = new URLSearchParams({ businessDate: currentBusinessDay.businessDate });
      const statusResponse = await fetch(`/api/attendance/session?${query.toString()}`, { cache: "no-store" });
      const status = await readJsonResponse(statusResponse);

      if (statusResponse.ok && status.clockedIn) {
        if (active) setRemoteClockedIn(true);
        return;
      }

      if (!statusResponse.ok) {
        throw new Error(status.message ?? "Unable to check attendance status.");
      }

      if (!allowQrLink) {
        if (active) {
          setScanUrl("");
          setFeedback(null);
        }
        return;
      }

      const response = await fetch("/api/attendance/session", {
        body: JSON.stringify({ businessDate: currentBusinessDay.businessDate }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok || !payload.scanUrl) {
        throw new Error(payload.message ?? "Unable to prepare attendance check-in.");
      }

      if (active) setScanUrl(payload.scanUrl);
    };

    void prepareAttendance()
      .catch((error) => {
        if (active) {
          setFeedback({
            tone: "error",
            message: error instanceof Error ? error.message : "Unable to prepare attendance check-in."
          });
        }
      });

    return () => {
      active = false;
    };
  }, [allowQrLink, attendanceEnabled, currentBusinessDay?.businessDate, currentShopId, openAttendance?.id, session?.id]);

  useEffect(() => {
    if (!scanUrl || !currentBusinessDay || openAttendance || remoteClockedIn) return;

    const interval = window.setInterval(() => {
      const query = new URLSearchParams({ businessDate: currentBusinessDay.businessDate });

      void fetch(`/api/attendance/session?${query.toString()}`, { cache: "no-store" })
        .then((response) => readJsonResponse(response))
        .then((result) => {
          if (result.clockedIn) setRemoteClockedIn(true);
        })
        .catch(() => undefined);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [currentBusinessDay, openAttendance, remoteClockedIn, scanUrl]);

  if (
    !session ||
    session.workspace !== "shop" ||
    !attendanceEnabled ||
    !currentBusinessDay ||
    openAttendance ||
    remoteClockedIn ||
    adminBypassActive
  ) {
    return <>{children}</>;
  }

  const isAdmin = session.role === "shop_admin";
  const qrImageUrl = buildQrCodeImageUrl(scanUrl, 220);

  const captureLocation = () => {
    setFeedback(null);

    if (!navigator.geolocation) {
      setFeedback({ tone: "error", message: "This device does not support location capture." });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString()
        });
        setFeedback({ tone: "success", message: "Location captured." });
      },
      () => {
        setFeedback({ tone: "error", message: "Location permission was blocked. Allow location to clock in." });
      },
      { enableHighAccuracy: true, timeout: 12_000 }
    );
  };

  const captureSelfie = async (file?: File) => {
    setFeedback(null);

    if (!file) {
      return;
    }

    try {
      const optimized = await optimizeSelfie(file);
      setSelfieFile(optimized.file);
      setSelfieUrl(optimized.preview);
      setFeedback({ tone: "success", message: "Selfie captured and optimized." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Selfie could not be read. Try again."
      });
    }
  };

  const submitClockIn = async () => {
    if (requireLocation && !location) {
      setFeedback({ tone: "error", message: "Capture location before clocking in." });
      return;
    }

    if (requireSelfie && !selfieFile) {
      setFeedback({ tone: "error", message: "Capture a selfie before clocking in." });
      return;
    }

    if (allowQrLink && !scanUrl) {
      setFeedback({ tone: "error", message: "Secure clock-in is still loading. Try again in a moment." });
      return;
    }

    setIsPending(true);
    setFeedback(null);

    try {
      const body = new FormData();
      if (location) {
        body.set("accuracy", String(location.accuracy ?? 0));
        body.set("latitude", String(location.latitude));
        body.set("longitude", String(location.longitude));
      }
      if (selfieFile) body.set("selfie", selfieFile);

      if (allowQrLink) {
        const scan = new URL(scanUrl);
        body.set("businessDate", scan.searchParams.get("businessDate") ?? "");
        body.set("shopId", scan.searchParams.get("shopId") ?? "");
        body.set("token", scan.searchParams.get("token") ?? "");
        body.set("userId", scan.searchParams.get("userId") ?? "");
      } else {
        body.set("businessDate", currentBusinessDay.businessDate);
        body.set("direct", "1");
      }

      const response = await fetch("/api/attendance/scan", { body, method: "POST" });
      const result = await readJsonResponse(response);

      if (!response.ok || !result.ok) {
        setFeedback({ tone: "error", message: result.message ?? "Clock-in failed." });
        return;
      }

      setFeedback({ tone: "success", message: result.message ?? "Clock-in saved securely." });
      setRemoteClockedIn(true);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to reach the POS. Check the connection and try again."
      });
    } finally {
      setIsPending(false);
    }
  };

  const bypassClockIn = () => {
    setFeedback(null);
    if (bypassStorageKey && typeof window !== "undefined") {
      window.sessionStorage.setItem(bypassStorageKey, "1");
    }
    setAdminBypassActive(true);
  };

  return (
    <div className="grid min-h-[72vh] place-items-center">
      <Card className="w-full max-w-6xl overflow-hidden border-white/80 bg-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.12)]">
        <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.22),transparent_36%),linear-gradient(145deg,#07111f_0%,#12312e_100%)] p-7 text-white sm:p-9">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-[22px] bg-white/12 ring-1 ring-white/15">
              <Clock3 className="h-6 w-6" />
            </span>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.32em] text-emerald-100/70">Time clock required</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight">
              Clock in before opening the POS.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/76">
              {currentSettings?.pos.shopName ?? currentShop?.name ?? "This store"} is open for{" "}
              {formatBusinessDate(currentBusinessDay.businessDate, locale)}. Complete the configured attendance check once,
              then continue using the POS normally.
            </p>

            {allowQrLink ? <div className="mt-8 rounded-[30px] border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/54">Scan QR from staff phone</p>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid h-44 w-44 shrink-0 place-items-center rounded-[26px] bg-white p-4">
                  {qrImageUrl ? <img alt="Clock-in QR" className="h-full w-full" src={qrImageUrl} /> : <QrCode className="h-16 w-16 text-slate-300" />}
                </div>
                <div className="text-sm leading-6 text-white/75">
                  <p className="font-semibold text-white">QR clock-in link</p>
                  <p className="mt-2 break-all text-xs text-white/55">{scanUrl || "Preparing secure clock-in link..."}</p>
                </div>
              </div>
            </div> : (
              <div className="mt-8 rounded-[30px] border border-white/15 bg-white/10 p-5 text-sm leading-6 text-white/75">
                Staff-phone QR clock-in is disabled. Complete attendance on this POS device.
              </div>
            )}
          </div>

          <div className="p-7 sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Employee</p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950">{session.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{session.email}</p>
              </div>
              {isAdmin ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                  <ShieldCheck className="h-4 w-4" />
                  Admin bypass available
                </span>
              ) : null}
            </div>

            <div className={cn("mt-8 grid gap-4", requireLocation && requireSelfie ? "sm:grid-cols-2" : "grid-cols-1")}>
              {requireLocation ? <button
                className={cn(
                  "rounded-[28px] border p-5 text-left transition hover:-translate-y-0.5",
                  location ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-200"
                )}
                onClick={captureLocation}
                type="button"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] bg-slate-950 text-white">
                  {location ? <CheckCircle2 className="h-5 w-5" /> : <LocateFixed className="h-5 w-5" />}
                </span>
                <p className="mt-4 font-semibold text-slate-950">Capture location</p>
                <p className="mt-2 text-sm leading-5 text-slate-500">
                  {location
                    ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                    : "Required for verified daily attendance."}
                </p>
              </button> : null}

              {requireSelfie ? <button
                className={cn(
                  "rounded-[28px] border p-5 text-left transition hover:-translate-y-0.5",
                  selfieUrl ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-200"
                )}
                onClick={() => selfieInputRef.current?.click()}
                type="button"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] bg-slate-950 text-white">
                  {selfieUrl ? <CheckCircle2 className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                </span>
                <p className="mt-4 font-semibold text-slate-950">Take selfie</p>
                <p className="mt-2 text-sm leading-5 text-slate-500">
                  {selfieUrl ? "Selfie captured for this clock-in." : "Use the device camera or upload a selfie."}
                </p>
              </button> : null}

              {!requireLocation && !requireSelfie ? (
                <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-5">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] bg-emerald-700 text-white">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <p className="mt-4 font-semibold text-slate-950">Ready to clock in</p>
                  <p className="mt-2 text-sm leading-5 text-slate-600">No location or selfie is required by this store.</p>
                </div>
              ) : null}
            </div>

            <input
              ref={selfieInputRef}
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(event) => void captureSelfie(event.target.files?.[0])}
              type="file"
            />

            {selfieUrl ? (
              <div className="mt-5 flex items-center gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                <img alt="Selfie preview" className="h-16 w-16 rounded-[18px] object-cover" src={selfieUrl} />
                <div className="text-sm">
                  <p className="font-semibold text-slate-950">Selfie ready</p>
                  <p className="text-slate-500">Captured at {formatDateTime(new Date().toISOString(), locale)}</p>
                </div>
              </div>
            ) : null}

            {feedback ? (
              <div
                className={cn(
                  "mt-5 rounded-[22px] border px-4 py-3 text-sm font-semibold",
                  feedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                )}
              >
                {feedback.message}
              </div>
            ) : null}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button
                className="h-14 flex-1 rounded-[22px] text-base"
                disabled={isPending}
                onClick={() => void submitClockIn()}
              >
                {isPending ? "Saving clock-in..." : "Clock in and enter POS"}
              </Button>
              {isAdmin ? (
                <Button
                  className="h-14 rounded-[22px]"
                  disabled={isPending}
                  onClick={bypassClockIn}
                  variant="secondary"
                >
                  Admin bypass
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
