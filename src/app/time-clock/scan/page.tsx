import { Suspense } from "react";
import { AttendanceScanPage } from "@/components/attendance/attendance-scan-page";

export default function ClockInScanRoute() {
  return (
    <Suspense fallback={null}>
      <AttendanceScanPage />
    </Suspense>
  );
}
