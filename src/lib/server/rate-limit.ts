import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RateLimitPolicy = {
  blockSeconds: number;
  identifier: string;
  limit: number;
  scope: string;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  degraded?: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

function cleanHeaderAddress(value: string | null) {
  return value?.split(",")[0]?.trim().slice(0, 128) || "unknown";
}

function getClientAddress(request: Request) {
  return cleanHeaderAddress(
    request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")
  );
}

function createIdentifierHash(request: Request, scope: string, identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase().slice(0, 512);
  return createHash("sha256")
    .update(`${scope}|${getClientAddress(request)}|${normalizedIdentifier}`)
    .digest("hex");
}

export async function consumeRateLimit(
  request: Request,
  { blockSeconds, identifier, limit, scope, windowSeconds }: RateLimitPolicy
): Promise<RateLimitResult> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("consume_api_rate_limit", {
      p_block_seconds: Math.max(1, Math.trunc(blockSeconds)),
      p_identifier_hash: createIdentifierHash(request, scope, identifier),
      p_limit: Math.max(1, Math.trunc(limit)),
      p_scope: scope,
      p_window_seconds: Math.max(1, Math.trunc(windowSeconds))
    });

    if (error) throw error;

    const result = (data ?? {}) as {
      allowed?: boolean;
      remaining?: number;
      retry_after_seconds?: number;
    };

    return {
      allowed: result.allowed !== false,
      remaining: Math.max(0, Number(result.remaining ?? 0)),
      retryAfterSeconds: Math.max(0, Math.ceil(Number(result.retry_after_seconds ?? 0)))
    };
  } catch (error) {
    // Authentication must remain available if the limiter infrastructure has a brief outage.
    console.error("Rate limiter unavailable:", error instanceof Error ? error.message : error);
    return { allowed: true, degraded: true, remaining: 0, retryAfterSeconds: 0 };
  }
}
