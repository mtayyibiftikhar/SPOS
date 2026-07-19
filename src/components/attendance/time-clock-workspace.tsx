"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Banknote,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Eye,
  FileSpreadsheet,
  LogOut,
  MapPin,
  Printer,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
  X
} from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { calculateShiftSummary } from "@/lib/cash-control";
import { cn, formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";
import type { AttendanceRecord, User } from "@/types/pos";

type TimeClockView = "overview" | "timecards" | "payroll" | "adjust";
type Feedback = { tone: "success" | "error"; message: string };

const PAGE_SIZE = 10;

function recordHours(record: AttendanceRecord, now = Date.now()) {
  if (typeof record.paidHours === "number") return record.paidHours;

  const startedAt = Date.parse(record.clockInAt);
  const endedAt = record.clockOutAt ? Date.parse(record.clockOutAt) : now;

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return 0;
  return Math.round(((endedAt - startedAt) / 3_600_000) * 100) / 100;
}

function localTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sourceLabel(record: AttendanceRecord) {
  if (record.source === "qr") return "Verified clock-in";
  if (record.source === "manual") return "Manual record";
  return "Legacy admin bypass";
}

export function TimeClockWorkspace() {
  const {
    clockOut,
    currentBusinessDay,
    currentSettings,
    currentShop,
    currentShopId,
    currentShift,
    currentUsers,
    endShift,
    locale,
    saveAttendanceRecord,
    savePayrollRate,
    session,
    state
  } = usePosApp();
  const isAdmin = session?.role === "shop_admin";
  const currency = currentSettings?.pos.currency ?? "SAR";
  const today = currentBusinessDay?.businessDate ?? new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [view, setView] = useState<TimeClockView>("overview");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [now, setNow] = useState(Date.now());
  const [selectedEvidence, setSelectedEvidence] = useState<AttendanceRecord | null>(null);
  const [clockOutPassword, setClockOutPassword] = useState("");
  const [closeShiftOnClockOut, setCloseShiftOnClockOut] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [shiftClosingNote, setShiftClosingNote] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(session?.id ?? "");
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [timecardPage, setTimecardPage] = useState(1);
  const [rateUserId, setRateUserId] = useState(session?.id ?? "");
  const [hourlyRate, setHourlyRate] = useState("0");
  const [defaultHours, setDefaultHours] = useState("8");
  const [manualUserId, setManualUserId] = useState("");
  const [manualPage, setManualPage] = useState(1);
  const [manualRecordId, setManualRecordId] = useState<string | undefined>();
  const [manualDate, setManualDate] = useState(today);
  const [manualClockIn, setManualClockIn] = useState("");
  const [manualClockOut, setManualClockOut] = useState("");
  const [manualHours, setManualHours] = useState("8");
  const [manualNote, setManualNote] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId && currentUsers[0]) setSelectedEmployeeId(isAdmin ? currentUsers[0].id : session?.id ?? "");
    if (!rateUserId && currentUsers[0]) setRateUserId(currentUsers[0].id);
  }, [currentUsers, isAdmin, rateUserId, selectedEmployeeId, session?.id]);

  useEffect(() => {
    if (!rateUserId) return;
    const rate = state.payrollRates.find((entry) => entry.shopId === currentShopId && entry.userId === rateUserId);
    setHourlyRate(String(rate?.hourlyRate ?? 0));
    setDefaultHours(String(rate?.defaultDailyHours ?? 8));
  }, [currentShopId, rateUserId, state.payrollRates]);

  const shopRecords = useMemo(
    () => state.attendanceRecords.filter((record) => record.shopId === currentShopId),
    [currentShopId, state.attendanceRecords]
  );
  const todayRecords = shopRecords.filter((record) => record.businessDate === today);
  const currentRecord = todayRecords.find((record) => record.userId === session?.id && !record.clockOutAt) ?? null;
  const employeeName = (userId: string) => currentUsers.find((user) => user.id === userId)?.name ?? "Employee";
  const employeeStatus = (user: User) => todayRecords.find((record) => record.userId === user.id && !record.clockOutAt) ?? null;
  const visibleEmployees = isAdmin ? currentUsers : currentUsers.filter((user) => user.id === session?.id);
  const selectedEmployee = visibleEmployees.find((user) => user.id === selectedEmployeeId) ?? visibleEmployees[0];
  const filteredTimecards = useMemo(
    () =>
      shopRecords
        .filter((record) => record.userId === selectedEmployee?.id)
        .filter((record) => record.businessDate >= dateFrom && record.businessDate <= dateTo)
        .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.clockInAt.localeCompare(a.clockInAt)),
    [dateFrom, dateTo, selectedEmployee?.id, shopRecords]
  );
  const timecardPages = Math.max(1, Math.ceil(filteredTimecards.length / PAGE_SIZE));
  const pagedTimecards = filteredTimecards.slice((timecardPage - 1) * PAGE_SIZE, timecardPage * PAGE_SIZE);
  const totalTimecardHours = filteredTimecards.reduce((sum, record) => sum + recordHours(record, now), 0);
  const selectedRate = state.payrollRates.find(
    (rate) => rate.shopId === currentShopId && rate.userId === rateUserId
  );
  const rateRecords = shopRecords.filter((record) => record.userId === rateUserId && record.businessDate.startsWith(today.slice(0, 7)));
  const rateHours = rateRecords.reduce((sum, record) => sum + recordHours(record, now), 0);
  const rateEstimate = rateHours * Number(selectedRate?.hourlyRate ?? hourlyRate);
  const manualRecords = shopRecords
    .filter((record) => record.userId === manualUserId)
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.clockInAt.localeCompare(a.clockInAt));
  const manualPages = Math.max(1, Math.ceil(manualRecords.length / PAGE_SIZE));
  const pagedManualRecords = manualRecords.slice((manualPage - 1) * PAGE_SIZE, manualPage * PAGE_SIZE);
  const shiftSummary = currentShift
    ? calculateShiftSummary({
        shift: currentShift,
        bills: state.bills,
        cashMovements: state.cashMovements,
        customerAccountPayments: state.customerAccountPayments,
        refunds: state.refunds
      })
    : null;

  useEffect(() => setTimecardPage(1), [dateFrom, dateTo, selectedEmployeeId]);
  useEffect(() => setManualPage(1), [manualUserId]);

  const endMyClock = async () => {
    setFeedback(null);
    if (!clockOutPassword.trim()) {
      setFeedback({ tone: "error", message: "Enter your password to verify clock-out." });
      return;
    }

    if (closeShiftOnClockOut && currentShift) {
      if (!countedCash.trim() || Number.isNaN(Number(countedCash)) || Number(countedCash) < 0) {
        setFeedback({ tone: "error", message: "Enter counted register cash before closing the shift." });
        return;
      }
      const shiftResult = await endShift({ countedCash: Number(countedCash), note: shiftClosingNote });
      if (!shiftResult.ok) {
        setFeedback({ tone: "error", message: shiftResult.message ?? "The shift could not be closed." });
        return;
      }
    }

    const result = await clockOut({ password: clockOutPassword });
    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? "Clock-out saved." : "Clock-out failed.")
    });
    if (result.ok) setClockOutPassword("");
  };

  const adminClockOut = async (record: AttendanceRecord) => {
    const result = await clockOut({ note: "Closed by shop admin from attendance overview.", userId: record.userId });
    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? "Employee clocked out." : "Clock-out failed.")
    });
    if (result.ok) setSelectedEvidence(null);
  };

  const loadManualRecord = (record?: AttendanceRecord) => {
    setManualRecordId(record?.id);
    setManualDate(record?.businessDate ?? today);
    setManualClockIn(localTime(record?.clockInAt));
    setManualClockOut(localTime(record?.clockOutAt));
    setManualHours(String(record ? recordHours(record, now) || record.scheduledHours : 8));
    setManualNote("");
  };

  const saveManualRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await saveAttendanceRecord({
      businessDate: manualDate,
      clockInAt: manualClockIn ? `${manualDate}T${manualClockIn}:00` : "",
      clockOutAt: manualClockOut ? `${manualDate}T${manualClockOut}:00` : undefined,
      id: manualRecordId,
      note: manualNote,
      paidHours: Number(manualHours),
      scheduledHours: Number(manualHours),
      userId: manualUserId
    });

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? "Attendance saved." : "Attendance was not saved.")
    });
    if (result.ok) loadManualRecord();
  };

  const saveRate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await savePayrollRate({
      defaultDailyHours: Number(defaultHours),
      hourlyRate: Number(hourlyRate),
      userId: rateUserId
    });
    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? "Payroll rate saved." : "Payroll rate was not saved.")
    });
  };

  const reportRows = filteredTimecards
    .map(
      (record) => `<tr><td>${escapeHtml(record.businessDate)}</td><td>${escapeHtml(formatDateTime(record.clockInAt, locale))}</td><td>${escapeHtml(record.clockOutAt ? formatDateTime(record.clockOutAt, locale) : "Open")}</td><td>${recordHours(record, now).toFixed(2)}</td><td>${escapeHtml(sourceLabel(record))}</td><td>${escapeHtml(record.note)}</td></tr>`
    )
    .join("");

  const reportMarkup = () => `<!doctype html><html><head><meta charset="utf-8"><title>Timecard - ${escapeHtml(selectedEmployee?.name)}</title><style>body{font-family:Arial,sans-serif;color:#0f172a;padding:32px}header{display:flex;align-items:center;gap:18px;border-bottom:2px solid #10b981;padding-bottom:18px;margin-bottom:24px}img{width:64px;height:64px;object-fit:contain}.muted{color:#64748b}.summary{display:flex;gap:16px;margin:18px 0}.pill{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:12px 18px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0f172a;color:white;text-align:left}th,td{padding:10px;border:1px solid #dbe4ee}footer{margin-top:24px;color:#64748b;font-size:11px}</style></head><body><header>${currentSettings?.pos.logoUrl ? `<img src="${escapeHtml(currentSettings.pos.logoUrl)}" alt="Logo">` : ""}<div><h1>${escapeHtml(currentSettings?.pos.shopName ?? currentShop?.name ?? "Store")}</h1><div class="muted">Employee timecard report</div></div></header><h2>${escapeHtml(selectedEmployee?.name)}</h2><p class="muted">${escapeHtml(selectedEmployee?.email)} | ${escapeHtml(dateFrom)} to ${escapeHtml(dateTo)}</p><div class="summary"><div class="pill"><strong>${filteredTimecards.length}</strong><br>Entries</div><div class="pill"><strong>${totalTimecardHours.toFixed(2)}</strong><br>Total hours</div></div><table><thead><tr><th>Date</th><th>Clock in</th><th>Clock out</th><th>Hours</th><th>Source</th><th>Note</th></tr></thead><tbody>${reportRows || '<tr><td colspan="6">No attendance records.</td></tr>'}</tbody></table><footer>Generated ${escapeHtml(formatDateTime(new Date().toISOString(), locale))}</footer></body></html>`;

  const printReport = () => {
    const reportWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!reportWindow) {
      setFeedback({ tone: "error", message: "Allow pop-ups to print or save the timecard PDF." });
      return;
    }
    reportWindow.document.write(reportMarkup());
    reportWindow.document.close();
    reportWindow.setTimeout(() => reportWindow.print(), 350);
  };

  const exportExcel = () => {
    const blob = new Blob([reportMarkup()], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `timecard-${selectedEmployee?.name ?? "employee"}-${dateFrom}-to-${dateTo}.xls`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const navItems = [
    { id: "overview" as const, label: "Overview", icon: Clock3 },
    { id: "timecards" as const, label: "Timecard by employee", icon: CalendarClock },
    ...(isAdmin
      ? [
          { id: "payroll" as const, label: "Salary calculator", icon: Banknote },
          { id: "adjust" as const, label: "Manual adjust", icon: Edit3 }
        ]
      : [])
  ];

  return (
    <div className="space-y-5">
      <Card className="rounded-[28px] border-white/80 bg-white/92 p-2 shadow-[0_18px_44px_rgba(15,23,42,0.06)] sm:p-3">
        <div className={cn("grid gap-2", isAdmin ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2")}>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={cn(
                "flex min-h-[64px] items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg",
                view === item.id
                  ? "border-slate-950 bg-slate-950 text-white shadow-xl"
                  : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/60"
              )}
              onClick={() => setView(item.id)}
              type="button"
            >
              <span className={cn("grid h-10 w-10 place-items-center rounded-[15px]", view === item.id ? "bg-white/12" : "bg-slate-100 text-slate-700")}>
                <item.icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {feedback ? (
        <div className={cn("rounded-[22px] border px-4 py-3 text-sm font-semibold", feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>
          {feedback.message}
        </div>
      ) : null}

      {view === "overview" && !isAdmin ? (
        <Card className="mx-auto max-w-3xl overflow-hidden">
          <div className="bg-[linear-gradient(135deg,#07111f,#12312e)] p-7 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-200">My work day</p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl font-semibold">{session?.name}</h1>
                <p className="mt-2 text-white/65">{formatBusinessDate(today, locale)}</p>
              </div>
              <Badge variant={currentRecord ? "success" : "neutral"}>{currentRecord ? "Clocked in" : "Not clocked in"}</Badge>
            </div>
          </div>
          <div className="p-7">
            {currentRecord ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Clocked in</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatDateTime(currentRecord.clockInAt, locale)}</p>
                  </div>
                  <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Hours today</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-950">{recordHours(currentRecord, now).toFixed(2)}</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  <Input autoComplete="current-password" onChange={(event) => setClockOutPassword(event.target.value)} placeholder="Enter password to verify clock-out" type="password" value={clockOutPassword} />
                  {currentShift ? (
                    <label className="flex cursor-pointer items-start gap-3 rounded-[22px] border border-slate-200 bg-white p-4">
                      <input checked={closeShiftOnClockOut} className="mt-1 h-4 w-4 accent-emerald-600" onChange={(event) => setCloseShiftOnClockOut(event.target.checked)} type="checkbox" />
                      <span><span className="block text-sm font-semibold text-slate-950">Close my register shift too</span><span className="mt-1 block text-xs text-slate-500">Attendance and register shifts stay separate unless you choose this.</span></span>
                    </label>
                  ) : null}
                  {closeShiftOnClockOut && shiftSummary ? (
                    <div className="grid gap-3 rounded-[22px] border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                      <p className="text-sm text-slate-600">Expected cash <strong className="block text-slate-950">{formatCurrency(shiftSummary.expectedCash, currency, locale)}</strong></p>
                      <Input min="0" onChange={(event) => setCountedCash(event.target.value)} placeholder="Counted cash" step="0.01" type="number" value={countedCash} />
                      <Input className="sm:col-span-2" onChange={(event) => setShiftClosingNote(event.target.value)} placeholder="Shift closing note (optional)" value={shiftClosingNote} />
                    </div>
                  ) : null}
                  <Button className="h-14 w-full gap-2 rounded-[20px]" onClick={() => void endMyClock()}><LogOut className="h-4 w-4" />Clock out securely</Button>
                </div>
              </>
            ) : (
              <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <Clock3 className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-4 font-semibold text-slate-950">No active timecard</p>
                <p className="mt-2 text-sm text-slate-500">Sign in again to complete the configured clock-in check.</p>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {view === "overview" && isAdmin ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 p-6">
            <div><p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Live attendance</p><h1 className="mt-2 font-display text-3xl font-semibold text-slate-950">Employee status</h1></div>
            <Badge variant="success">{todayRecords.filter((record) => !record.clockOutAt).length} clocked in</Badge>
          </div>
          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
            {currentUsers.map((user) => {
              const record = employeeStatus(user);
              return (
                <div key={user.id} className={cn("rounded-[26px] border p-5", record ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white")}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-[17px] bg-slate-950 text-white"><UserRound className="h-5 w-5" /></span>
                    <Badge variant={record ? "success" : "neutral"}>{record ? "Clocked in" : "Not clocked in"}</Badge>
                  </div>
                  <p className="mt-4 font-semibold text-slate-950">{user.name}</p><p className="mt-1 text-sm text-slate-500">{user.email}</p>
                  {record ? <><p className="mt-4 text-sm text-slate-600">Since {formatDateTime(record.clockInAt, locale)} · {recordHours(record, now).toFixed(2)} h</p><Button className="mt-4 w-full gap-2" onClick={() => setSelectedEvidence(record)} variant="secondary"><Eye className="h-4 w-4" />View verification</Button></> : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {selectedEvidence ? (
        <Card className="fixed inset-4 z-50 m-auto h-fit max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto border-white bg-white p-6 shadow-[0_30px_100px_rgba(15,23,42,0.32)]">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-700">Attendance evidence</p><h2 className="mt-2 font-display text-2xl font-semibold">{employeeName(selectedEvidence.userId)}</h2></div><button aria-label="Close evidence" className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 transition hover:bg-slate-200" onClick={() => setSelectedEvidence(null)} type="button"><X className="h-4 w-4" /></button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Clock in</p><p className="mt-2 font-semibold">{formatDateTime(selectedEvidence.clockInAt, locale)}</p><p className="mt-2 text-sm text-slate-500">{sourceLabel(selectedEvidence)}</p></div>
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Recorded hours</p><p className="mt-2 text-2xl font-semibold">{recordHours(selectedEvidence, now).toFixed(2)} h</p></div>
          </div>
          {selectedEvidence.clockInSelfieUrl ? <img alt={`Clock-in selfie for ${employeeName(selectedEvidence.userId)}`} className="mt-5 max-h-80 w-full rounded-[28px] bg-slate-100 object-contain" src={selectedEvidence.clockInSelfieUrl} /> : <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 p-5 text-sm text-slate-500">No selfie was required or captured.</div>}
          {selectedEvidence.clockInLocation ? <a className="mt-4 flex items-center gap-3 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-800 transition hover:-translate-y-0.5 hover:shadow-lg" href={`https://www.google.com/maps?q=${selectedEvidence.clockInLocation.latitude},${selectedEvidence.clockInLocation.longitude}`} rel="noreferrer" target="_blank"><MapPin className="h-5 w-5" />Open verified location</a> : null}
          {!selectedEvidence.clockOutAt ? <Button className="mt-4 w-full" onClick={() => void adminClockOut(selectedEvidence)} variant="danger">Clock out this employee</Button> : null}
        </Card>
      ) : null}

      {view === "timecards" ? (
        <Card className="overflow-hidden">
          <div className="grid gap-4 border-b border-slate-200 p-5 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
            <div><p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Timecard by employee</p><Select className="mt-3" onChange={(event) => setSelectedEmployeeId(event.target.value)} value={selectedEmployee?.id ?? ""}>{visibleEmployees.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</Select></div>
            <label className="text-xs font-semibold text-slate-500">From<Input className="mt-2" onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} /></label>
            <label className="text-xs font-semibold text-slate-500">To<Input className="mt-2" onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} /></label>
            <div className="flex gap-2"><Button className="gap-2" onClick={printReport} variant="secondary"><Printer className="h-4 w-4" />Print / PDF</Button><Button className="gap-2" onClick={exportExcel} variant="secondary"><FileSpreadsheet className="h-4 w-4" />Excel</Button></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-3 text-sm"><span><strong>{filteredTimecards.length}</strong> entries</span><span><strong>{totalTimecardHours.toFixed(2)}</strong> total hours</span></div>
          <div className="divide-y divide-slate-200">
            {pagedTimecards.length ? pagedTimecards.map((record) => <button key={record.id} className="grid w-full gap-3 p-4 text-left text-sm transition hover:bg-emerald-50/50 md:grid-cols-[1fr_1.2fr_1.2fr_0.6fr_0.8fr] md:items-center" onClick={() => setSelectedEvidence(record)} type="button"><span className="font-semibold text-slate-950">{formatBusinessDate(record.businessDate, locale)}</span><span>{formatDateTime(record.clockInAt, locale)}</span><span>{record.clockOutAt ? formatDateTime(record.clockOutAt, locale) : "Still clocked in"}</span><span className="font-semibold">{recordHours(record, now).toFixed(2)} h</span><Badge variant={record.clockOutAt ? "success" : "warning"}>{record.clockOutAt ? "Closed" : "Open"}</Badge></button>) : <div className="p-8 text-center text-sm text-slate-500">No timecards in this date range.</div>}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 p-4"><Button disabled={timecardPage <= 1} onClick={() => setTimecardPage((page) => page - 1)} size="sm" variant="secondary"><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-slate-500">Page {timecardPage} of {timecardPages}</span><Button disabled={timecardPage >= timecardPages} onClick={() => setTimecardPage((page) => page + 1)} size="sm" variant="secondary"><ChevronRight className="h-4 w-4" /></Button></div>
        </Card>
      ) : null}

      {view === "payroll" && isAdmin ? (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-6"><p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Salary estimate</p><h2 className="mt-2 font-display text-2xl font-semibold">{employeeName(rateUserId)}</h2><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Month hours</p><p className="mt-2 text-3xl font-semibold">{rateHours.toFixed(2)}</p></div><div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Estimated salary</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(rateEstimate, currency, locale)}</p></div></div></Card>
          <Card className="p-6"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-700" /><h3 className="font-display text-xl font-semibold">Employee hourly rate</h3></div><form className="mt-5 grid gap-4 sm:grid-cols-3" onSubmit={(event) => void saveRate(event)}><Select onChange={(event) => setRateUserId(event.target.value)} required value={rateUserId}><option value="">Select employee</option>{currentUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</Select><Input min="0" onChange={(event) => setHourlyRate(event.target.value)} placeholder="Hourly rate" step="0.01" type="number" value={hourlyRate} /><Input min="0.25" onChange={(event) => setDefaultHours(event.target.value)} placeholder="Default daily hours" step="0.25" type="number" value={defaultHours} /><Button className="sm:col-span-3" type="submit">Save payroll rate</Button></form></Card>
        </div>
      ) : null}

      {view === "adjust" && isAdmin ? (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="overflow-hidden"><div className="border-b border-slate-200 p-5"><p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Choose employee</p><Select className="mt-3" onChange={(event) => { setManualUserId(event.target.value); loadManualRecord(); }} value={manualUserId}><option value="">Select employee first</option>{currentUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</Select></div>{manualUserId ? <><div className="divide-y divide-slate-200">{pagedManualRecords.length ? pagedManualRecords.map((record) => <button key={record.id} className={cn("w-full p-4 text-left transition hover:bg-emerald-50", manualRecordId === record.id && "bg-emerald-50")} onClick={() => loadManualRecord(record)} type="button"><div className="flex items-center justify-between gap-3"><span className="font-semibold">{formatBusinessDate(record.businessDate, locale)}</span><Badge variant={record.clockOutAt ? "success" : "warning"}>{recordHours(record, now).toFixed(2)} h</Badge></div><p className="mt-1 text-xs text-slate-500">{formatDateTime(record.clockInAt, locale)}</p></button>) : <div className="p-6 text-sm text-slate-500">No records for this employee.</div>}</div><div className="flex items-center justify-between border-t border-slate-200 p-3"><Button disabled={manualPage <= 1} onClick={() => setManualPage((page) => page - 1)} size="sm" variant="secondary"><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs text-slate-500">{manualPage}/{manualPages}</span><Button disabled={manualPage >= manualPages} onClick={() => setManualPage((page) => page + 1)} size="sm" variant="secondary"><ChevronRight className="h-4 w-4" /></Button></div></> : <div className="p-8 text-center text-sm text-slate-500"><UserRoundCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3">Select an employee to view and adjust their timecards.</p></div>}</Card>
          <Card className="p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Admin adjustment</p><h2 className="mt-1 font-display text-2xl font-semibold">{manualRecordId ? "Edit selected timecard" : "Create manual timecard"}</h2></div>{manualUserId ? <Button onClick={() => loadManualRecord()} size="sm" variant="secondary">New record</Button> : null}</div><form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={(event) => void saveManualRecord(event)}><Input disabled={!manualUserId} onChange={(event) => setManualDate(event.target.value)} required type="date" value={manualDate} /><Input disabled={!manualUserId} min="0" onChange={(event) => setManualHours(event.target.value)} placeholder="Paid hours" step="0.25" type="number" value={manualHours} /><Input disabled={!manualUserId} onChange={(event) => setManualClockIn(event.target.value)} required type="time" value={manualClockIn} /><Input disabled={!manualUserId} onChange={(event) => setManualClockOut(event.target.value)} type="time" value={manualClockOut} /><Input className="md:col-span-2" disabled={!manualUserId} onChange={(event) => setManualNote(event.target.value)} placeholder="Required adjustment reason" required value={manualNote} /><Button className="md:col-span-2" disabled={!manualUserId} type="submit">Save audited adjustment</Button></form></Card>
        </div>
      ) : null}
    </div>
  );
}
