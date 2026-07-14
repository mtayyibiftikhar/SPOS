import { hashSecret } from "@/lib/utils";

export function createAttendanceToken(shopId: string, userId: string, businessDate: string) {
  return hashSecret(`${shopId}:${userId}:${businessDate}:attendance`).replace("mock_", "att_");
}

export function buildAttendanceScanUrl({
  businessDate,
  origin,
  shopId,
  userId
}: {
  businessDate: string;
  origin: string;
  shopId: string;
  userId: string;
}) {
  const token = createAttendanceToken(shopId, userId, businessDate);
  const params = new URLSearchParams({
    shopId,
    userId,
    businessDate,
    token
  });

  return `${origin}/time-clock/scan?${params.toString()}`;
}
