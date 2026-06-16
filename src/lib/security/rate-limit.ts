import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, resetAt: bucket.resetAt };
}

export async function checkDbRateLimit(
  key: string,
  options: {
    maxTokens: number;
    refillRatePerSec: number;
    cost?: number;
    context?: string;
  }
) {
  const keyPrefix = key.split(":")[0] || "unknown";
  const context = options.context ?? "unspecified";

  // Bypass PDF rate limiting in local development to avoid blocking developers
  if (
    process.env.NODE_ENV === "development" &&
    (key.startsWith("pdf:") || key.startsWith("pdf-route:"))
  ) {
    return true;
  }

  try {
    const supabase = createAdminClient();
    const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
      limit_key: key,
      max_tokens: options.maxTokens,
      refill_rate_per_sec: options.refillRatePerSec,
      cost: options.cost ?? 1.0,
    });
    if (error) {
      console.error("DB rate limit check failed", {
        keyPrefix,
        context,
        message: error.message,
      });
      return false;
    }
    return !!allowed;
  } catch (err) {
    console.error("DB rate limit execution failed", {
      keyPrefix,
      context,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export function rateLimitKey(prefix: string, value: string) {
  return `${prefix}:${value.trim().toLowerCase() || "unknown"}`;
}
