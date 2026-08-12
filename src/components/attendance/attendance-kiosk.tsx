"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, Fingerprint, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type KioskStatus = { attendanceEnabled: boolean; businessDate: string | null; fingerprintEnabled: boolean; message?: string; ok: boolean; pinEnabled: boolean; shopName?: string };

export function AttendanceKiosk() {
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string; employeeName?: string; action?: string } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetch("/api/attendance/kiosk", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as KioskStatus;
      setStatus({ ...payload, ok: response.ok && payload.ok });
    }).catch(() => setStatus({ attendanceEnabled: false, businessDate: null, fingerprintEnabled: false, ok: false, pinEnabled: false, message: "Unable to reach attendance service." }));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setFeedback(null);
    try {
      const response = await fetch("/api/attendance/kiosk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeCode, pin }) });
      const result = await response.json() as { action?: string; employeeName?: string; message?: string; ok?: boolean };
      setFeedback({ ok: response.ok && Boolean(result.ok), message: result.message ?? "Attendance could not be recorded.", employeeName: result.employeeName, action: result.action });
      if (response.ok && result.ok) { setEmployeeCode(""); setPin(""); window.setTimeout(() => setFeedback(null), 7000); }
    } catch { setFeedback({ ok: false, message: "Unable to reach attendance service." }); }
    finally { setPending(false); }
  };

  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.18),transparent_38%),linear-gradient(160deg,#06111c,#12312e)] p-4">
    <Card className="w-full max-w-xl overflow-hidden border-white/10 bg-white shadow-2xl">
      <div className="bg-slate-950 p-7 text-white"><Clock3 className="h-8 w-8 text-emerald-300" /><p className="mt-6 text-xs font-bold uppercase tracking-[.3em] text-emerald-200">Attendance kiosk</p><h1 className="mt-2 text-3xl font-semibold">{status?.shopName ?? "Store attendance"}</h1><p className="mt-2 text-sm text-white/65">{status?.businessDate ? `Business day ${status.businessDate}` : "Waiting for an open business day"}</p></div>
      <form className="space-y-5 p-7" onSubmit={submit}>
        {!status?.ok ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{status?.message ?? "Loading activated device..."}</div> : null}
        {feedback ? <div className={`rounded-3xl border p-5 ${feedback.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-700"}`}>{feedback.ok ? <CheckCircle2 className="mb-3 h-7 w-7" /> : null}<p className="font-semibold">{feedback.message}</p></div> : null}
        <label className="block text-sm font-semibold text-slate-950">Employee ID<Input autoComplete="username" className="mt-2 uppercase" onChange={(event) => setEmployeeCode(event.target.value.toUpperCase())} placeholder="EMP-0042" value={employeeCode} /></label>
        <label className="block text-sm font-semibold text-slate-950">Attendance PIN<Input autoComplete="off" className="mt-2" inputMode="numeric" maxLength={6} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} placeholder="4 to 6 digits" type="password" value={pin} /></label>
        <Button className="h-14 w-full rounded-2xl" disabled={!status?.ok || !status.pinEnabled || !status.businessDate || pending || employeeCode.length < 3 || pin.length < 4} type="submit"><KeyRound className="mr-2 h-5 w-5" />{pending ? "Verifying..." : "Verify attendance"}</Button>
        <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500"><Fingerprint className="mb-2 h-5 w-5 text-emerald-700" />{status?.fingerprintEnabled ? "Fingerprint is enabled. Connect an approved terminal from employee enrollment." : "Fingerprint terminal is not enabled for this store."}</div>
      </form>
    </Card>
  </main>;
}
