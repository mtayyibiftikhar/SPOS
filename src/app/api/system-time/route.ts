import { NextRequest, NextResponse } from "next/server";
import { getBusinessDateInTimezone } from "@/lib/cash-control";
import { isSupportedBusinessTimezone } from "@/lib/business-timezones";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestedTimezone = request.nextUrl.searchParams.get("timezone") ?? "Asia/Riyadh";
  const timezone = isSupportedBusinessTimezone(requestedTimezone) ? requestedTimezone : "Asia/Riyadh";
  const now = new Date();

  return NextResponse.json(
    {
      now: now.toISOString(),
      businessDate: getBusinessDateInTimezone(timezone, now),
      timezone
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
