import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createShopUserSessionToken,
  readShopUserSession,
  SHOP_USER_SESSION_COOKIE,
  SHOP_USER_SESSION_MAX_AGE_SECONDS,
  shopSessionCookieOptions
} from "@/lib/supabase/shop-session";

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

  const rateLimit = await consumeRateLimit(request, {
    blockSeconds: 900,
    identifier: `${shopId}:${email}`,
    limit: 12,
    scope: "shop_user_login",
    windowSeconds: 900
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many sign-in attempts. Please wait and try again." },
      { headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }, status: 429 }
    );
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

    const response = NextResponse.json({
      ok: true,
      user: mapProfile({
        ...profile,
        last_login_at: lastLoginAt
      })
    });
    response.cookies.set(
      SHOP_USER_SESSION_COOKIE,
      createShopUserSessionToken({
        kind: "user",
        shopId: profile.shop_id,
        userId: profile.id,
        email: profile.email,
        role: profile.role
      }),
      shopSessionCookieOptions(SHOP_USER_SESSION_MAX_AGE_SECONDS)
    );

    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to sign in." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const session = readShopUserSession(request);

  if (!session) {
    return NextResponse.json({ ok: false, message: "Shop user session is not authorized." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, shop_id, email, role, is_active")
    .eq("id", session.userId)
    .eq("shop_id", session.shopId)
    .eq("email", session.email)
    .eq("role", session.role)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ ok: false, message: "Shop user session is not authorized." }, { status: 401 });
  }

  return NextResponse.json({ ok: true, session });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(SHOP_USER_SESSION_COOKIE, "", shopSessionCookieOptions(0));
  return response;
}
