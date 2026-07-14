"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Banknote, CalendarClock, Clock3, Edit3, ShieldCheck, TimerReset, UserRoundCheck } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn, formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";
import type { AttendanceRecord } from "@/types/pos";

type TimeClockView = "overview" | "timecards" | "payroll" | "adjust";

function hoursForRecord(record: AttendanceRecord) {
  if (typeof record.paidHours === "number") {
    return record.paidHours;
  }

  if (!record.clockOutAt) {
    return record.scheduledHours;
  }

  const startedAt = new Date(record.clockInAt).getTime();
  const endedAt = new Date(record.clockOutAt).getTime();

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    return record.scheduledHours;
  }

  return Math.round(((endedAt - startedAt) / 3_600_000) * 100) / 100;
}

export function TimeClockWorkspace() {
  const {
    clockOut,
    currentBusinessDay,
    currentSettings,
    currentShopId,
    currentUsers,
    locale,
    saveAttendanceRecord,
    savePayrollRate,
    session,
    state
  } = usePosApp();
  const [view, setView] = useState<TimeClockView>("overview");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [manualUserId, setManualUserId] = useState("");
  const [manualDate, setManualDate] = useState(currentBusinessDay?.businessDate ?? new Date().toISOString().slice(0, 10));
  const [manualClockIn, setManualClockIn] = useState("");
  const [manualClockOut, setManualClockOut] = useState("");
  const [manualHours, setManualHours] = useState("8");
  const [manualNote, setManualNote] = useState("");
  const [rateUserId, setRateUserId] = useState("");
  const [hourlyRate, setHourlyRate] = useState("0");
  const [defaultHours, setDefaultHours] = useState("8");

  const currency = currentSettings?.pos.currency ?? "SAR";
  const isAdmin = session?.role === "shop_admin";
  const todayRecords = useMemo(
    () =>
      currentShopId && currentBusinessDay
        ? state.attendanceRecords.filter(
            (record) => record.shopId === currentShopId && record.businessDate === currentBusinessDay.businessDate
          )
        : [],
    [currentBusinessDay, currentShopId, state.attendanceRecords]
  );
  const openRecords = todayRecords.filter((record) => !record.clockOutAt);
  const closedRecords = todayRecords.filter((record) => Boolean(record.clockOutAt));
  const monthKey = (currentBusinessDay?.businessDate ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
  const monthRecords = useMemo(
    () =>
      currentShopId
        ? state.attendanceRecords.filter(
            (record) => record.shopId === currentShopId && record.businessDate.startsWith(monthKey)
          )
        : [],
    [currentShopId, monthKey, state.attendanceRecords]
  );
  const monthHours = monthRecords.reduce((sum, record) => sum + hoursForRecord(record), 0);
  const monthPayroll = monthRecords.reduce((sum, record) => sum + hoursForRecord(record) * record.hourlyRate, 0);
  const filteredRecords = monthRecords.filter((record) => {
    const employee = currentUsers.find((user) => user.id === record.userId);
    const haystack = [employee?.name, employee?.email, record.businessDate, record.status].filter(Boolean).join(" ").toLowerCase();

    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });

  const employeeName = (userId: string) => currentUsers.find((user) => user.id === userId)?.name ?? "Employee";

  const endMyClock = () => {
    const result = clockOut();
    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? "Clock-out saved." : "Clock-out failed.")
    });
  };

  const saveManualRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clockInAt = manualClockIn ? `${manualDate}T${manualClockIn}` : "";
    const clockOutAt = manualClockOut ? `${manualDate}T${manualClockOut}` : undefined;
    const result = saveAttendanceRecord({
      businessDate: manualDate,
      clockInAt,
      clockOutAt,
      note: manualNote,
      paidHours: Number(manualHours),
      scheduledHours: Number(manualHours),
      userId: manualUserId
    });

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? "Attendance saved." : "Attendance was not saved.")
    });
  };

  const saveRate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = savePayrollRate({
      defaultDailyHours: Number(defaultHours),
      hourlyRate: Number(hourlyRate),
      userId: rateUserId
    });

    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? "Payroll rate saved." : "Payroll rate was not saved.")
    });
  };

  const navItems = [
    { id: "overview", label: "Overview", icon: Clock3, active: view === "overview" },
    { id: "timecards", label: "Time cards", icon: CalendarClock, active: view === "timecards" },
    { id: "payroll", label: "Salary calculator", icon: Banknote, active: view === "payroll" },
    { id: "adjust", label: "Manual adjust", icon: Edit3, active: view === "adjust" }
  ];

  return (
    <div className="space-y-5">
      <Card className="rounded-[28px] border-white/80 bg-white/92 p-2 shadow-[0_18px_44px_rgba(15,23,42,0.06)] sm:p-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={cn(
                "flex min-h-[68px] items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.05)]",
                item.active
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_34px_rgba(15,23,42,0.14)]"
                  : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/60"
              )}
              onClick={() => setView(item.id as TimeClockView)}
              type="button"
            >
              <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]", item.active ? "bg-white/12 text-white" : "bg-slate-100 text-slate-700")}>
                <item.icon className="h-4 w-4" />
              </span>
              <span className={cn("text-sm font-semibold", item.active ? "text-white" : "text-ink")}>{item.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Clocked in today</p>
          <p className="mt-3 font-display text-3xl font-semibold text-slate-950">{openRecords.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Closed time cards</p>
          <p className="mt-3 font-display text-3xl font-semibold text-slate-950">{closedRecords.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Month hours</p>
          <p className="mt-3 font-display text-3xl font-semibold text-slate-950">{monthHours.toFixed(2)}</p>
        </Card>
        <Card className="border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Payroll estimate</p>
          <p className="mt-3 font-display text-2xl font-semibold text-slate-950">{formatCurrency(monthPayroll, currency, locale)}</p>
        </Card>
      </div>

      {feedback ? (
        <div
          className={cn(
            "rounded-[24px] border px-4 py-3 text-sm font-semibold",
            feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      {view === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Today</p>
                <h1 className="mt-2 font-display text-3xl font-semibold text-slate-950">
                  {currentBusinessDay ? formatBusinessDate(currentBusinessDay.businessDate, locale) : "No open day"}
                </h1>
              </div>
              <Badge variant={currentBusinessDay ? "success" : "warning"}>{currentBusinessDay ? "Day open" : "Day closed"}</Badge>
            </div>
            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-950">Your time card</p>
              {session ? (
                <p className="mt-2 text-sm text-slate-500">
                  {openRecords.some((record) => record.userId === session.id)
                    ? "You are clocked in. Clock out when your work day is finished."
                    : "You are not currently clocked in."}
                </p>
              ) : null}
              <Button className="mt-5 w-full rounded-[20px]" disabled={!openRecords.some((record) => record.userId === session?.id)} onClick={endMyClock}>
                Clock out
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Live attendance</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">Employees clocked in</h2>
            <div className="mt-5 space-y-3">
              {openRecords.length > 0 ? (
                openRecords.map((record) => (
                  <div key={record.id} className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white p-4">
                    <div>
                      <p className="font-semibold text-slate-950">{employeeName(record.userId)}</p>
                      <p className="text-sm text-slate-500">Since {formatDateTime(record.clockInAt, locale)}</p>
                    </div>
                    <Badge variant="success">{record.source.replace("_", " ")}</Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  No employees are clocked in yet.
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {view === "timecards" ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Time cards</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">{monthKey} attendance</h2>
            </div>
            <Input className="max-w-md" onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, date, or status" value={query} />
          </div>
          <div className="divide-y divide-slate-200">
            {filteredRecords.length > 0 ? (
              filteredRecords.map((record) => (
                <div key={record.id} className="grid gap-3 p-4 text-sm md:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr] md:items-center">
                  <div>
                    <p className="font-semibold text-slate-950">{employeeName(record.userId)}</p>
                    <p className="text-slate-500">{formatBusinessDate(record.businessDate, locale)}</p>
                  </div>
                  <p>{formatDateTime(record.clockInAt, locale)}</p>
                  <p>{record.clockOutAt ? formatDateTime(record.clockOutAt, locale) : "Still clocked in"}</p>
                  <p className="font-semibold">{hoursForRecord(record).toFixed(2)} h</p>
                  <Badge variant={record.status === "open" ? "warning" : "success"}>{record.status.replace("_", " ")}</Badge>
                </div>
              ))
            ) : (
              <div className="p-6 text-sm text-slate-500">No time cards matched this period.</div>
            )}
          </div>
        </Card>
      ) : null}

      {view === "payroll" ? (
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="p-6">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Payroll</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">{monthKey} salary estimate</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Hours</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{monthHours.toFixed(2)}</p>
              </div>
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Estimated salary</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(monthPayroll, currency, locale)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
              <h3 className="font-display text-xl font-semibold text-slate-950">Employee hourly rates</h3>
            </div>
            <form className="mt-5 grid gap-4 sm:grid-cols-3" onSubmit={saveRate}>
              <Select onChange={(event) => setRateUserId(event.target.value)} required value={rateUserId}>
                <option value="">Select employee</option>
                {currentUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
              <Input min="0" onChange={(event) => setHourlyRate(event.target.value)} placeholder="Hourly rate" step="0.01" type="number" value={hourlyRate} />
              <Input min="0.25" onChange={(event) => setDefaultHours(event.target.value)} placeholder="Default hours" step="0.25" type="number" value={defaultHours} />
              <Button className="sm:col-span-3" disabled={!isAdmin} type="submit">
                Save payroll rate
              </Button>
            </form>
          </Card>
        </div>
      ) : null}

      {view === "adjust" ? (
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <TimerReset className="h-5 w-5 text-emerald-700" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-700">Admin control</p>
              <h2 className="mt-1 font-display text-2xl font-semibold text-slate-950">Manual time adjustment</h2>
            </div>
          </div>
          <form className="mt-6 grid gap-4 md:grid-cols-3" onSubmit={saveManualRecord}>
            <Select onChange={(event) => setManualUserId(event.target.value)} required value={manualUserId}>
              <option value="">Select employee</option>
              {currentUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
            <Input onChange={(event) => setManualDate(event.target.value)} type="date" value={manualDate} />
            <Input min="0" onChange={(event) => setManualHours(event.target.value)} step="0.25" type="number" value={manualHours} />
            <Input onChange={(event) => setManualClockIn(event.target.value)} required type="time" value={manualClockIn} />
            <Input onChange={(event) => setManualClockOut(event.target.value)} type="time" value={manualClockOut} />
            <Input className="md:col-span-3" onChange={(event) => setManualNote(event.target.value)} placeholder="Adjustment note" value={manualNote} />
            <Button className="md:col-span-3" disabled={!isAdmin} type="submit">
              Save adjustment
            </Button>
          </form>
          {!isAdmin ? (
            <p className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Only shop admins can adjust attendance and payroll.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
