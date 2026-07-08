import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const port = host.split(":")[1] ?? "";
  const { pathname } = request.nextUrl;

  if (port === "3001" && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/owner";
    return NextResponse.redirect(url);
  }

  if (port === "3001" && pathname !== "/login" && !pathname.startsWith("/owner")) {
    const url = request.nextUrl.clone();
    url.pathname = "/owner";
    return NextResponse.redirect(url);
  }

  if (port === "3000" && pathname.startsWith("/owner")) {
    const url = request.nextUrl.clone();
    url.protocol = "http:";
    url.host = "localhost:3001";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"]
};
