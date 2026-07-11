import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandProfile } from "@/types/pos";

const BRAND_BUCKET = "owner-cloud-snapshots";
const BRAND_PATH = "branding/brand-profile.json";

async function ensureBrandBucket(supabase: SupabaseClient) {
  const { error } = await supabase.storage.createBucket(BRAND_BUCKET, {
    public: false
  });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error;
  }
}

export async function saveBrandProfileSnapshot(supabase: SupabaseClient, brand: BrandProfile) {
  await ensureBrandBucket(supabase);

  const { error } = await supabase.storage.from(BRAND_BUCKET).upload(BRAND_PATH, JSON.stringify(brand), {
    contentType: "application/json",
    upsert: true
  });

  if (error) {
    throw error;
  }
}

export async function loadBrandProfileSnapshot(supabase: SupabaseClient) {
  const { data, error } = await supabase.storage.from(BRAND_BUCKET).download(BRAND_PATH);

  if (error) {
    if (/not found|does not exist|object|bucket/i.test(error.message)) {
      return null;
    }

    throw error;
  }

  const text = await data.text();

  return text ? (JSON.parse(text) as Partial<BrandProfile>) : null;
}
