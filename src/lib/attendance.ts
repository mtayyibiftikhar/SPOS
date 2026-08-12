import type { AttendanceRecord } from "@/types/pos";

export const DEFAULT_SHIFT_START_TIME = "08:00";
export const DEFAULT_SHIFT_END_TIME = "16:00";
const RIYADH_OFFSET = "+03:00";
const EARTH_RADIUS_METERS = 6_371_000;

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateAttendanceDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
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

function validTime(value: string | undefined, fallback: string) {
  return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

function addCalendarDay(value: string) {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed + 86_400_000).toISOString().slice(0, 10);
}

function riyadhCalendarDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Riyadh",
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getAttendanceScheduleWindow(record: Pick<
  AttendanceRecord,
  "businessDate" | "clockInAt" | "shiftStartTime" | "shiftEndTime" | "overnightShift"
>) {
  const clockInDate = riyadhCalendarDate(record.clockInAt);
  // Older imported records can carry a stale business date. Anchor those to the
  // real clock-in date so rollover never creates a negative or multi-day shift.
  const scheduleDate =
    record.overnightShift || clockInDate === record.businessDate
      ? record.businessDate
      : clockInDate;
  const startTime = validTime(record.shiftStartTime, DEFAULT_SHIFT_START_TIME);
  const endTime = validTime(record.shiftEndTime, DEFAULT_SHIFT_END_TIME);
  const endDate = record.overnightShift ? addCalendarDay(scheduleDate) : scheduleDate;

  return {
    endAt: new Date(`${endDate}T${endTime}:00${RIYADH_OFFSET}`),
    scheduleDate,
    startAt: new Date(`${scheduleDate}T${startTime}:00${RIYADH_OFFSET}`)
  };
}

export function calculateScheduledAttendanceClosure(
  record: Pick<
    AttendanceRecord,
    | "businessDate"
    | "clockInAt"
    | "scheduledHours"
    | "shiftStartTime"
    | "shiftEndTime"
    | "overnightShift"
  >,
  now = new Date()
) {
  const { endAt, scheduleDate, startAt } = getAttendanceScheduleWindow(record);
  const currentDate = riyadhCalendarDate(now);
  const shouldClose = record.overnightShift
    ? now.getTime() >= endAt.getTime()
    : currentDate > scheduleDate;

  if (!shouldClose) return null;

  const clockInTime = Date.parse(record.clockInAt);
  const workedFrom = Math.max(clockInTime, startAt.getTime());
  const scheduledEnd = endAt.getTime();
  const elapsedWithinSchedule =
    Number.isFinite(workedFrom) && scheduledEnd > workedFrom
      ? (scheduledEnd - workedFrom) / 3_600_000
      : 0;
  const dailyLimit =
    Number.isFinite(record.scheduledHours) && record.scheduledHours > 0
      ? record.scheduledHours
      : 8;

  return {
    clockOutAt: endAt.toISOString(),
    paidHours: roundHours(Math.min(elapsedWithinSchedule, dailyLimit))
  };
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
