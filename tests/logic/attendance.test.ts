import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAutoClosedAttendanceHours,
  calculateElapsedAttendanceHours,
  calculateScheduledAttendanceClosure,
  findOpenAttendanceRecord
} from "../../src/lib/attendance";
import type { AttendanceRecord } from "../../src/types/pos";

function createAttendanceRecord(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: "attendance-1",
    shopId: "shop-1",
    userId: "user-1",
    businessDate: "2026-07-19",
    status: "open",
    source: "manual",
    clockInAt: "2026-07-19T08:00:00.000Z",
    scheduledHours: 8,
    hourlyRate: 20,
    createdAt: "2026-07-19T08:00:00.000Z",
    ...overrides
  };
}

test("normal clock-out records the exact elapsed attendance hours", () => {
  assert.equal(
    calculateElapsedAttendanceHours(
      "2026-07-19T08:00:00.000Z",
      "2026-07-19T14:30:00.000Z"
    ),
    6.5
  );
});

test("automatic closure caps long attendance at configured daily hours", () => {
  assert.equal(
    calculateAutoClosedAttendanceHours(
      "2026-07-19T08:00:00.000Z",
      "2026-07-19T18:00:00.000Z",
      8
    ),
    8
  );
});

test("automatic closure keeps exact elapsed time when it is below the cap", () => {
  assert.equal(
    calculateAutoClosedAttendanceHours(
      "2026-07-19T08:00:00.000Z",
      "2026-07-19T13:00:00.000Z",
      8
    ),
    5
  );
});

test("an older open attendance record still prevents a duplicate clock-in", () => {
  const previousDayOpen = createAttendanceRecord({ businessDate: "2026-07-18" });

  assert.equal(
    findOpenAttendanceRecord([previousDayOpen], "shop-1", "user-1", "2026-07-19")?.id,
    previousDayOpen.id
  );
});

test("the preferred business-day record wins when duplicate open records exist", () => {
  const previousDayOpen = createAttendanceRecord({
    id: "attendance-previous",
    businessDate: "2026-07-18",
    clockInAt: "2026-07-19T09:00:00.000Z"
  });
  const currentDayOpen = createAttendanceRecord({ id: "attendance-current" });

  assert.equal(
    findOpenAttendanceRecord(
      [previousDayOpen, currentDayOpen],
      "shop-1",
      "user-1",
      "2026-07-19"
    )?.id,
    currentDayOpen.id
  );
});

test("a late employee is auto-closed with only the scheduled time actually worked", () => {
  const result = calculateScheduledAttendanceClosure(
    createAttendanceRecord({
      businessDate: "2026-07-20",
      clockInAt: "2026-07-20T11:00:00.000Z",
      shiftStartTime: "08:00",
      shiftEndTime: "16:00"
    }),
    new Date("2026-07-21T03:00:00.000Z")
  );

  assert.deepEqual(result, {
    clockOutAt: "2026-07-20T13:00:00.000Z",
    paidHours: 2
  });
});

test("a full forgotten day is capped at the employee daily limit", () => {
  const result = calculateScheduledAttendanceClosure(
    createAttendanceRecord({
      businessDate: "2026-07-20",
      clockInAt: "2026-07-20T05:00:00.000Z",
      scheduledHours: 8,
      shiftStartTime: "08:00",
      shiftEndTime: "16:00"
    }),
    new Date("2026-07-21T03:00:00.000Z")
  );

  assert.equal(result?.paidHours, 8);
});

test("an overnight shift remains open until its next-day scheduled end", () => {
  const record = createAttendanceRecord({
    businessDate: "2026-07-20",
    clockInAt: "2026-07-20T19:00:00.000Z",
    overnightShift: true,
    shiftStartTime: "22:00",
    shiftEndTime: "06:00"
  });

  assert.equal(
    calculateScheduledAttendanceClosure(record, new Date("2026-07-21T01:00:00.000Z")),
    null
  );
  assert.deepEqual(
    calculateScheduledAttendanceClosure(record, new Date("2026-07-21T04:00:00.000Z")),
    { clockOutAt: "2026-07-21T03:00:00.000Z", paidHours: 8 }
  );
});
