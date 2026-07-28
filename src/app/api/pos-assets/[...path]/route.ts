import { NextResponse } from "next/server";
import { getPosAssetDeliveryUrl, POS_ASSETS_BUCKET } from "@/lib/pos-asset-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const publicAssetPath = /^(?:owner\/(?:branding|login-ads|login-hero)|shops\/[^/]+\/(?:categories|products|shop-logo))\/[^/]+$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params;
  const path = segments.join("/");

  if (!publicAssetPath.test(path) || getPosAssetDeliveryUrl(path) !== `/api/pos-assets/${segments.map(encodeURIComponent).join("/")}`) {
    return NextResponse.json({ ok: false, message: "Asset not found." }, { status: 404 });
  }

  try {
    const { data, error } = await createSupabaseAdminClient().storage.from(POS_ASSETS_BUCKET).download(path);

    if (error || !data) {
      return NextResponse.json({ ok: false, message: "Asset not found." }, { status: 404 });
    }

    return new NextResponse(await data.arrayBuffer(), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": data.type || "application/octet-stream"
      }
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Asset unavailable." }, { status: 500 });
  }
}
