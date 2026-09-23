/// Content-Security-Policy builder (pure, so it can be unit-tested).
///
/// script-src uses a per-request nonce plus 'strict-dynamic': only scripts that carry the
/// nonce (Next.js adds it to its own) - or that a nonced script loads - can run. An injected
/// <script> or an inline event handler is blocked, which is the main XSS defence.
///
/// connect-src / img-src are wide (https: / wss:) ON PURPOSE: the app talks to whichever RPC
/// endpoint, IPFS gateway, Pinata and wallet relay you configure, and to whatever gateway hosts
/// a creator's image. Restrict them to a fixed list once your hosting setup is final.
export function buildCsp(nonce: string, opts: { dev: boolean }): string {
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (opts.dev) script.push("'unsafe-eval'"); // React Refresh / dev overlay only
  const connect = ["'self'", "https:", "wss:"];
  if (opts.dev) connect.push("ws://localhost:*", "http://localhost:*");

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", script],
    // Inline style="" attributes are used for progress bars and 3D transforms; scripts stay locked down.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connect],
    ["frame-src", ["https://verify.walletconnect.com", "https://verify.walletconnect.org", "https://secure.walletconnect.com", "https://secure.walletconnect.org"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'", "blob:", "data:", "https:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = directives.map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
