import "server-only";

import { NextResponse } from "next/server";

export function rejectOutsideLocalDevelopment() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  }

  return null;
}
