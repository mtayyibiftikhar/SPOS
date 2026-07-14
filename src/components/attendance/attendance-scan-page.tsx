"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, CheckCircle2, LocateFixed } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatBusinessDate } from "@/lib/utils";
import type { AttendanceLocation } from "@/types/pos";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read selfie."));
    reader.readAsDataURL(file);
  });
}

export function AttendanceScanPage() {
  const params = useSearchParams();
  const { locale, state, submitAttendanceScan } = usePosApp();
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const [location, setLocation] = useState<AttendanceLocation | null>(null);
  const [selfieUrl, setSelfieUrl] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const shopId = params.get("shopId") ?? "";
  const userId = params.get("userId") ?? "";
  const businessDate = params.get("businessDate") ?? "";
  const token = params.get("token") ?? "";
  const employee = state.users.find((user) => user.id === userId && user.shopId === shopId);
  const shop = state.shops.find((entry) => entry.id === shopId);

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
      setSelfieUrl(await fileToDataUrl(file));
      setFeedback({ tone: "success", message: "Selfie captured." });
    } catch {
      setFeedback({ tone: "error", message: "Unable to read selfie. Try again." });
    }
  };

  const submit = () => {
    if (!location || !selfieUrl) {
      setFeedback({ tone: "error", message: "Capture location and selfie first." });
      return;
    }

    const result = submitAttendanceScan({
      businessDate,
      location,
      selfieUrl,
      shopId,
      token,
      userId
    });

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? "Clock-in saved." : "Clock-in failed.")
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_35%),linear-gradient(180deg,#f8fbf9,#eef4f1)] p-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-2xl place-items-center">
        <Card className="w-full overflow-hidden border-white/80 bg-white/96 shadow-[0_28px_90px_rgba(15,23,42,0.12)]">
          <div className="bg-slate-950 p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-200/75">POS attendance</p>
            <h1 className="mt-3 font-display text-3xl font-semibold">Clock in</h1>
            <p className="mt-3 text-sm leading-6 text-white/70">
              {employee?.name ?? "Employee"} at {shop?.name ?? "this shop"} for{" "}
              {businessDate ? formatBusinessDate(businessDate, locale) : "today"}.
            </p>
          </div>

          <div className="space-y-4 p-6">
            <button
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
            </button>

            <button
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
            </button>

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

            <Button className="h-14 w-full rounded-[22px]" disabled={!location || !selfieUrl} onClick={submit}>
              Save clock-in
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
