import { NextResponse } from "next/server";
import { loadBrandProfileSnapshot } from "@/lib/supabase/brand-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeBrandAssetUrls } from "@/lib/pos-asset-url";

export async function GET() {
  try {
    const brand = await loadBrandProfileSnapshot(createSupabaseAdminClient());

    return NextResponse.json({
      brand: brand ? normalizeBrandAssetUrls(brand) : null,
      ok: true
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to load POS branding." },
      { status: 500 }
    );
  }
}
