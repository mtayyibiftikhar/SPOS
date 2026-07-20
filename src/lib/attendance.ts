import type { AttendanceRecord } from "@/types/pos";

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateElapsedAttendanceHours(clockInAt: string, clockOutAt: string) {
  const startedAt = Date.parse(clockInAt);
  const endedAt = Date.parse(clockOutAt);

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    return 0;
  }

  return roundHours((endedAt - startedAt) / 3_600_000);
}

export function calculateAutoClosedAttendanceHours(
  clockInAt: string,
  clockOutAt: string,
  configuredDailyHours = 8
) {
  const elapsedHours = calculateElapsedAttendanceHours(clockInAt, clockOutAt);
  const dailyLimit =
    Number.isFinite(configuredDailyHours) && configuredDailyHours > 0 ? configuredDailyHours : 8;

  return roundHours(Math.min(elapsedHours, dailyLimit));
}

export function findOpenAttendanceRecord(
  records: AttendanceRecord[],
  shopId: string,
  userId: string,
  preferredBusinessDate?: string
) {
  const openRecords = records
    .filter(
      (record) => record.shopId === shopId && record.userId === userId && !record.clockOutAt
    )
    .sort((left, right) => right.clockInAt.localeCompare(left.clockInAt));

  return (
    openRecords.find((record) => record.businessDate === preferredBusinessDate) ??
    openRecords[0] ??
    null
  );
}
