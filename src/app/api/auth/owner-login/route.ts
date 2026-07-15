import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { stableUuid } from "@/lib/cloud-sync";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createOwnerSessionToken,
  getAuthorizedOwnerSession,
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_MAX_AGE_SECONDS
} from "@/lib/supabase/owner-session";

type OwnerLoginRequest = {
  email?: string;
  password?: string;
};

type OwnerProfile = {
  created_at: string | null;
  email: string;
  id: string;
  is_active: boolean;
  last_login_at: string | null;
  name: string;
  phone: string | null;
  role: "super_admin" | "support";
  shop_id: null;
};

function constantEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();

  return timingSafeEqual(leftDigest, rightDigest);
}

function createSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase auth environment variables are not configured.");
  }

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function mapOwner(profile: OwnerProfile) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? undefined,
    role: profile.role,
    isActive: profile.is_active,
    lastLoginAt: profile.last_login_at ?? undefined,
    createdAt: profile.created_at ?? new Date().toISOString()
  };
}

function setOwnerCookie(response: NextResponse, token: string) {
  response.cookies.set(OWNER_SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: OWNER_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function POST(request: Request) {
  let body: OwnerLoginRequest;

  try {
    body = (await request.json()) as OwnerLoginRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid login payload." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ ok: false, message: "Email and password are required." }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit(request, {
    blockSeconds: 1_800,
    identifier: email,
    limit: 8,
    scope: "owner_login",
    windowSeconds: 900
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many sign-in attempts. Please wait and try again." },
      { headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }, status: 429 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const configuredEmail = process.env.POS_OWNER_EMAIL?.trim().toLowerCase() ?? "";
    const configuredPassword = process.env.POS_OWNER_PASSWORD ?? "";
    let profile: OwnerProfile | null = null;

    if (
      configuredEmail &&
      configuredPassword &&
      constantEqual(email, configuredEmail) &&
      constantEqual(password, configuredPassword)
    ) {
      const result = await supabase
        .from("profiles")
        .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
        .eq("email", email)
        .is("shop_id", null)
        .in("role", ["super_admin", "support"])
        .maybeSingle();

      if (result.error) throw result.error;

      profile = (result.data as OwnerProfile | null) ?? {
        id: stableUuid(`owner:${email}`),
        name: "POS Owner",
        email,
        phone: null,
        role: "super_admin",
        is_active: true,
        shop_id: null,
        last_login_at: null,
        created_at: new Date().toISOString()
      };
    } else {
      const authClient = createSupabaseAuthClient();
      const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password });

      if (authError || !authData.user) {
        return NextResponse.json({ ok: false, message: "Invalid email or password." }, { status: 401 });
      }

      const result = await supabase
        .from("profiles")
        .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
        .eq("id", authData.user.id)
        .is("shop_id", null)
        .in("role", ["super_admin", "support"])
        .maybeSingle();

      if (result.error) throw result.error;
      profile = result.data as OwnerProfile | null;
    }

    if (!profile || !profile.is_active) {
      return NextResponse.json({ ok: false, message: "This owner account is not active." }, { status: 403 });
    }

    const lastLoginAt = new Date().toISOString();
    await supabase.from("profiles").update({ last_login_at: lastLoginAt }).eq("id", profile.id);

    const response = NextResponse.json({
      ok: true,
      user: mapOwner({ ...profile, last_login_at: lastLoginAt })
    });
    setOwnerCookie(
      response,
      createOwnerSessionToken({ email: profile.email, role: profile.role })
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
  try {
    const authorization = await getAuthorizedOwnerSession(request);

    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner session is not authorized." }, { status: 401 });
    }

    return NextResponse.json({ ok: true, session: authorization.session });
  } catch {
    return NextResponse.json({ ok: false, message: "Owner session is not authorized." }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
