import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const port = host.split(":")[1] ?? "";
  const { pathname } = request.nextUrl;
  const isOwnerHost = hostname === "owner.globalfsms.com" || hostname.startsWith("owner.");
  const isShopHost = hostname === "shop.globalfsms.com" || hostname.startsWith("shop.");

  if ((isOwnerHost || port === "3001") && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if ((isOwnerHost || port === "3001") && pathname !== "/login" && !pathname.startsWith("/owner")) {
    const url = request.nextUrl.clone();
    url.pathname = "/owner";
    return NextResponse.redirect(url);
  }

  if (isShopHost && pathname.startsWith("/owner")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!isShopHost && port === "3000" && pathname.startsWith("/owner")) {
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
