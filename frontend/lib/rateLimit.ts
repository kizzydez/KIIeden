/// Fixed-window rate limiter (pure + in-memory).
///
/// HONEST LIMITS: on Vercel every serverless/edge instance has its own memory, so this is a
/// best-effort brake against a single client hammering the site, not a hard guarantee.
/// For a real limit, also add a rule in the Vercel Firewall (Project > Firewall > Rate limit).
export type Bucket = { count: number; resetAt: number };

export function createLimiter(limit: number, windowMs: number, maxKeys = 5000) {
  const buckets = new Map<string, Bucket>();
  return {
    /// Returns whether the request is allowed, and how many seconds until the window resets.
    hit(key: string, now: number = Date.now()): { allowed: boolean; remaining: number; retryAfter: number } {
      if (buckets.size > maxKeys) {
        for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
        if (buckets.size > maxKeys) buckets.clear(); // still huge: drop everything rather than grow forever
      }
      let b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
      }
      b.count += 1;
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), retryAfter };
    },
  };
}
