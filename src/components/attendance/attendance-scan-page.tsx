"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, CheckCircle2, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resizeImageFileToDataUrl } from "@/lib/image-upload";
import { cn, formatBusinessDate } from "@/lib/utils";
import type { AttendanceLocation } from "@/types/pos";

async function readJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text) as { message?: string; ok?: boolean };
  } catch {
    return {
      ok: false,
      message: text.trim() || `Attendance service returned HTTP ${response.status}.`
    };
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

export function AttendanceScanPage() {
  const params = useSearchParams();
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const [location, setLocation] = useState<AttendanceLocation | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfieUrl, setSelfieUrl] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [identity, setIdentity] = useState<{
    employeeName: string;
    requireLocation: boolean;
    requireSelfie: boolean;
    shopName: string;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);

  const shopId = params.get("shopId") ?? "";
  const userId = params.get("userId") ?? "";
  const businessDate = params.get("businessDate") ?? "";
  const token = params.get("token") ?? "";

  useEffect(() => {
    if (!shopId || !userId || !businessDate || !token) return;

    const query = new URLSearchParams({ businessDate, shopId, token, userId });

    void fetch(`/api/attendance/scan?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await readJsonResponse(response)) as {
          employeeName?: string;
          message?: string;
          ok?: boolean;
          requireLocation?: boolean;
          requireSelfie?: boolean;
          shopName?: string;
        };

        if (!response.ok || !payload.ok || !payload.employeeName || !payload.shopName) {
          throw new Error(payload.message ?? "This attendance link is not available.");
        }

        setIdentity({
          employeeName: payload.employeeName,
          requireLocation: payload.requireLocation ?? true,
          requireSelfie: payload.requireSelfie ?? false,
          shopName: payload.shopName
        });
      })
      .catch((error) => {
        setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Invalid attendance link." });
      });
  }, [businessDate, shopId, token, userId]);

  const captureLocation = () => {
    setFeedback(null);

    if (!navigator.geolocation) {
      setFeedback({ tone: "error", message: "This phone does not support location capture." });
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
      () => setFeedback({ tone: "error", message: "Allow location access to complete clock-in." }),
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
        message: error instanceof Error ? error.message : "Unable to read selfie. Try again."
      });
    }
  };

  const submit = async () => {
    if (identity?.requireLocation && !location) {
      setFeedback({ tone: "error", message: "Capture location first." });
      return;
    }

    if (identity?.requireSelfie && !selfieFile) {
      setFeedback({ tone: "error", message: "Capture a selfie first." });
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
      body.set("businessDate", businessDate);
      if (selfieFile) body.set("selfie", selfieFile);
      body.set("shopId", shopId);
      body.set("token", token);
      body.set("userId", userId);
      const response = await fetch("/api/attendance/scan", { body, method: "POST" });
      const result = await readJsonResponse(response);

      setFeedback({
        tone: response.ok && result.ok ? "success" : "error",
        message:
          result.message ??
          (response.ok ? "Clock-in saved. You can return to the POS." : `Clock-in failed (HTTP ${response.status}).`)
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to reach the POS. Check the connection and try again."
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_35%),linear-gradient(180deg,#f8fbf9,#eef4f1)] p-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-2xl place-items-center">
        <Card className="w-full overflow-hidden border-white/80 bg-white/96 shadow-[0_28px_90px_rgba(15,23,42,0.12)]">
          <div className="bg-slate-950 p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-200/75">POS attendance</p>
            <h1 className="mt-3 font-display text-3xl font-semibold">Clock in</h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              {identity?.employeeName ?? "Employee"} at {identity?.shopName ?? "this shop"} for{" "}
              {businessDate ? formatBusinessDate(businessDate, "en") : "today"}.
            </p>
          </div>

          <div className="space-y-4 p-6">
            {identity?.requireLocation ? <button
              className={cn(
                "flex w-full items-center gap-4 rounded-[24px] border p-4 text-left",
                location ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
              )}
              onClick={captureLocation}
              type="button"
            >
              <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-slate-950 text-white">
                {location ? <CheckCircle2 className="h-5 w-5" /> : <LocateFixed className="h-5 w-5" />}
              </span>
              <span>
                <span className="block font-semibold text-slate-950">Location</span>
                <span className="mt-1 block text-sm text-slate-500">
                  {location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : "Capture exact clock-in position"}
                </span>
              </span>
            </button> : null}

            {identity?.requireSelfie ? <button
              className={cn(
                "flex w-full items-center gap-4 rounded-[24px] border p-4 text-left",
                selfieUrl ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
              )}
              onClick={() => selfieInputRef.current?.click()}
              type="button"
            >
              <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-slate-950 text-white">
                {selfieUrl ? <CheckCircle2 className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
              </span>
              <span>
                <span className="block font-semibold text-slate-950">Selfie</span>
                <span className="mt-1 block text-sm text-slate-500">
                  {selfieUrl ? "Selfie ready" : "Take a quick attendance selfie"}
                </span>
              </span>
            </button> : null}

            {identity && !identity.requireLocation && !identity.requireSelfie ? (
              <div className="flex items-center gap-4 rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
                <span className="grid h-12 w-12 place-items-center rounded-[18px] bg-emerald-700 text-white">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-slate-950">Ready</span>
                  <span className="mt-1 block text-sm text-slate-600">No location or selfie is required.</span>
                </span>
              </div>
            ) : null}

            <input
              ref={selfieInputRef}
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(event) => void captureSelfie(event.target.files?.[0])}
              type="file"
            />

            {selfieUrl ? <img alt="Selfie preview" className="h-28 w-28 rounded-[24px] object-cover" src={selfieUrl} /> : null}

            {feedback ? (
              <div
                className={cn(
                  "rounded-[20px] border px-4 py-3 text-sm font-semibold",
                  feedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                )}
              >
                {feedback.message}
              </div>
            ) : null}

            <Button
              className="h-14 w-full rounded-[22px]"
              disabled={!identity || isPending}
              onClick={() => void submit()}
            >
              {isPending ? "Saving securely..." : "Save clock-in"}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
