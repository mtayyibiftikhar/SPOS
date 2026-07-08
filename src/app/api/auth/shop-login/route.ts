import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ShopLoginRequest = {
  email?: string;
  password?: string;
  shopId?: string;
};

function createSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase auth environment variables are not configured.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function mapProfile(profile: {
  created_at: string | null;
  email: string;
  id: string;
  is_active: boolean;
  last_login_at: string | null;
  name: string;
  phone: string | null;
  role: "super_admin" | "shop_admin" | "cashier" | "support";
  shop_id: string | null;
}) {
  return {
    id: profile.id,
    shopId: profile.shop_id ?? undefined,
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? undefined,
    role: profile.role,
    isActive: profile.is_active,
    lastLoginAt: profile.last_login_at ?? undefined,
    createdAt: profile.created_at ?? new Date().toISOString()
  };
}

export async function POST(request: Request) {
  let body: ShopLoginRequest;

  try {
    body = (await request.json()) as ShopLoginRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid login payload." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();
  const shopId = body.shopId?.trim();

  if (!email || !password || !shopId) {
    return NextResponse.json({ ok: false, message: "Email, password, and shop are required." }, { status: 400 });
  }

  try {
    const authClient = createSupabaseAuthClient();
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      return NextResponse.json({ ok: false, message: "Invalid email or password." }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile || profile.shop_id !== shopId || profile.role === "super_admin") {
      return NextResponse.json({ ok: false, message: "This login is not allowed for this store." }, { status: 403 });
    }

    if (!profile.is_active) {
      return NextResponse.json({ ok: false, message: "This user is inactive. Ask the shop admin to reactivate access." }, { status: 403 });
    }

    const lastLoginAt = new Date().toISOString();
    await supabase.from("profiles").update({ last_login_at: lastLoginAt }).eq("id", profile.id);

    return NextResponse.json({
      ok: true,
      user: mapProfile({
        ...profile,
        last_login_at: lastLoginAt
      })
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to sign in." },
      { status: 500 }
    );
  }
}
