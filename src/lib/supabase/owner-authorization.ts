import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function isAuthorizedOwner(supabase: SupabaseAdminClient, ownerEmail: string) {
  const normalizedEmail = ownerEmail.trim().toLowerCase();
  const expectedOwnerEmail = process.env.POS_OWNER_EMAIL?.trim().toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  if (expectedOwnerEmail && normalizedEmail === expectedOwnerEmail) {
    return true;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .eq("is_active", true)
    .is("shop_id", null)
    .in("role", ["super_admin", "support"])
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export function isMissingOwnerExtension(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error &&
      (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") ||
        /could not find|does not exist|schema cache/i.test(error.message ?? ""))
  );
}
