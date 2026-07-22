export function isMissingAttendanceScheduleColumns(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const details = error as { code?: string; details?: string; hint?: string; message?: string };
  const text = `${details.message ?? ""} ${details.details ?? ""} ${details.hint ?? ""}`;

  return (
    ["42703", "PGRST204"].includes(details.code ?? "") &&
    /shift_start_time|shift_end_time|overnight_shift/i.test(text)
  );
}
