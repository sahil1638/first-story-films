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
  options: { maxTokens: number; refillRatePerSec: number; cost?: number }
) {
  try {
    const supabase = createAdminClient();
    const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
      limit_key: key,
      max_tokens: options.maxTokens,
      refill_rate_per_sec: options.refillRatePerSec,
      cost: options.cost ?? 1.0,
    });
    if (error) {
      console.error("DB rate limit check error:", error);
      return true; // fail-open
    }
    return !!allowed;
  } catch (err) {
    console.error("DB rate limit execution error:", err);
    return true; // fail-open
  }
}

export function rateLimitKey(prefix: string, value: string) {
  return `${prefix}:${value.trim().toLowerCase() || "unknown"}`;
}
