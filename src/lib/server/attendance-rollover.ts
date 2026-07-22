import { calculateScheduledAttendanceClosure } from "@/lib/attendance";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AttendanceRecord } from "@/types/pos";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const rolloverSelect =
  "id, business_date, clock_in_at, scheduled_hours, shift_start_time, shift_end_time, overnight_shift, note";

export async function closeExpiredAttendanceRecords(
  supabase: SupabaseAdminClient,
  shopId: string,
  now = new Date()
) {
  const { data: openRecords, error } = await supabase
    .from("attendance_records")
    .select(rolloverSelect)
    .eq("shop_id", shopId)
    .is("clock_out_at", null);

  if (error) throw error;

  const closures = (openRecords ?? []).flatMap((record) => {
    const result = calculateScheduledAttendanceClosure(
      {
        businessDate: String(record.business_date),
        clockInAt: String(record.clock_in_at),
        overnightShift: Boolean(record.overnight_shift),
        scheduledHours: Number(record.scheduled_hours ?? 8),
        shiftEndTime: String(record.shift_end_time ?? "16:00"),
        shiftStartTime: String(record.shift_start_time ?? "08:00")
      } satisfies Pick<
        AttendanceRecord,
        | "businessDate"
        | "clockInAt"
        | "overnightShift"
        | "scheduledHours"
        | "shiftEndTime"
        | "shiftStartTime"
      >,
      now
    );

    return result ? [{ record, result }] : [];
  });

  if (!closures.length) return 0;

  const updates = await Promise.all(
    closures.map(({ record, result }) =>
      supabase
        .from("attendance_records")
        .update({
          clock_out_at: result.clockOutAt,
          note:
            record.note ||
            "Auto closed at the employee's scheduled shift end after the work date changed.",
          paid_hours: result.paidHours,
          updated_at: now.toISOString()
        })
        .eq("id", record.id)
        .eq("shop_id", shopId)
        .is("clock_out_at", null)
    )
  );
  const failedUpdate = updates.find((update) => update.error);

  if (failedUpdate?.error) throw failedUpdate.error;
  return closures.length;
}
