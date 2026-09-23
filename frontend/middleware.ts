import { NextRequest, NextResponse } from "next/server";
import { buildCsp } from "./lib/csp";
import { createLimiter } from "./lib/rateLimit";

// One limiter per server instance (see lib/rateLimit.ts for the honest limits).
const limiter = createLimiter(300, 60_000); // 300 page loads per minute per client

// CSP_MODE: "enforce" blocks violations, "report-only" (default) only logs them in the browser
// console so you can check a new deployment before turning enforcement on. See DEPLOY.md.
const CSP_MODE = (process.env.CSP_MODE || "report-only").toLowerCase();
const DEV = process.env.NODE_ENV !== "production";

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || "unknown";
}

export function middleware(req: NextRequest) {
  const rl = limiter.hit(clientKey(req));
  if (!rl.allowed) {
    return new NextResponse("Too many requests. Please wait a moment and try again.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, { dev: DEV });
  const headerName = CSP_MODE === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

  // Next.js reads the nonce from the CSP header on the REQUEST and stamps it on its own scripts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(headerName, csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (CSP_MODE !== "off") res.headers.set(headerName, csp);
  res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
  return res;
}

export const config = {
  matcher: [
    {
      // pages only: not static assets, images, or Next's prefetch requests
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|webmanifest)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
