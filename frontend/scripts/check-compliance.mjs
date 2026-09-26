#!/usr/bin/env node
// Production-readiness checks that can be automated. Run: npm run check:compliance
//   1. business details are configured (env or .env.local)
//   2. no tracking / analytics / advertising scripts or third-party embeds in the source
//   3. every <img> has an alt attribute; every form control has a label
//   4. legal pages exist; the app links to them
//   5. images shipped in /public are listed in ATTRIBUTIONS.md
// It cannot judge legal compliance for your country - see COMPLIANCE.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { failures++; console.log("  FAIL  " + m); };
const ok = (m) => console.log("  ok    " + m);

function loadEnv() {
  const env = { ...process.env };
  for (const f of [".env.local", ".env.production", ".env"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !(m[1] in env && env[m[1]])) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

console.log("\n1. Business details");
const env = loadEnv();
const required = ["NEXT_PUBLIC_BUSINESS_LEGAL_NAME", "NEXT_PUBLIC_BUSINESS_ADDRESS", "NEXT_PUBLIC_BUSINESS_REG_NUMBER", "NEXT_PUBLIC_BUSINESS_JURISDICTION", "NEXT_PUBLIC_BUSINESS_EMAIL"];
for (const k of required) (env[k] || "").trim() ? ok(k) : fail(`${k} is empty. Real business details are required.`);
if ((env.NEXT_PUBLIC_BUSINESS_EMAIL || "") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.NEXT_PUBLIC_BUSINESS_EMAIL)) fail("NEXT_PUBLIC_BUSINESS_EMAIL is not a valid email address.");

const src = walk(root).filter((f) => /\.(tsx?|jsx?|css|html|mjs)$/.test(f) && !f.includes("check-compliance"));

console.log("\n2. Tracking scripts and third-party embeds");
const TRACKERS = /(google-analytics|googletagmanager|gtag\(|analytics\.js|fbevents|facebook\.net|connect\.facebook|hotjar|mixpanel|segment\.(com|io)|amplitude|clarity\.ms|plausible|matomo|doubleclick|adsbygoogle|posthog|intercom|hubspot|linkedin\.com\/insight|snap\.licdn|tiktok\.com\/i18n|static\.ads-twitter)/i;
const EMBEDS = /(<iframe|<embed|<object|youtube\.com\/embed|player\.vimeo|platform\.twitter\.com|maps\.google|<script[^>]+src=["']https?:)/i;
let trackerHits = 0, embedHits = 0;
for (const f of src) {
  const text = fs.readFileSync(f, "utf8");
  if (TRACKERS.test(text)) { trackerHits++; fail(`tracker reference in ${path.relative(root, f)}`); }
  if (EMBEDS.test(text)) { embedHits++; fail(`third-party embed or external script in ${path.relative(root, f)}`); }
}
if (!trackerHits) ok("no analytics / advertising / tracking references");
if (!embedHits) ok("no iframes, embeds or external <script src> tags");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const depNames = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const badDeps = depNames.filter((d) => /(analytics|gtag|mixpanel|segment|hotjar|sentry|amplitude|posthog|pixel)/i.test(d));
badDeps.length ? fail(`dependencies that may collect data: ${badDeps.join(", ")} (review, then disclose in the Privacy Policy)`) : ok("no analytics-style npm dependencies");

console.log("\n3. Accessibility basics (static)");
let imgFail = 0, labelFail = 0;
for (const f of src.filter((f) => f.endsWith(".tsx"))) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(m[0])) { imgFail++; fail(`<img> without alt in ${path.relative(root, f)}`); }
  for (const m of text.matchAll(/<label\b[^>]*>/g)) {
    if (/htmlFor/.test(m[0])) continue;
    const close = text.indexOf("</label>", m.index);
    const inner = text.slice(m.index, close);
    if (!/<(input|select|textarea)\b/.test(inner)) { labelFail++; fail(`<label> not tied to a control in ${path.relative(root, f)}`); }
  }
}
if (!imgFail) ok("every <img> has an alt attribute");
if (!labelFail) ok("every <label> is tied to a control");

console.log("\n4. Legal pages");
for (const page of ["terms", "privacy", "cookies", "refund"]) {
  fs.existsSync(path.join(root, "app", page, "page.tsx")) ? ok(`/${page}`) : fail(`app/${page}/page.tsx is missing`);
}
const footer = fs.readFileSync(path.join(root, "components", "Footer.tsx"), "utf8");
for (const page of ["/terms", "/privacy", "/cookies", "/refund"]) footer.includes(page) ? ok(`footer links to ${page}`) : fail(`footer does not link to ${page}`);
fs.existsSync(path.join(root, "components", "CookieConsent.tsx")) ? ok("cookie consent banner present") : fail("cookie consent banner missing");

console.log("\n5. Image rights");
const attr = path.join(root, "public", "ATTRIBUTIONS.md");
const attrText = fs.existsSync(attr) ? fs.readFileSync(attr, "utf8") : "";
for (const f of fs.readdirSync(path.join(root, "public"))) {
  if (!/\.(png|jpe?g|svg|webp|gif)$/i.test(f)) continue;
  attrText.includes(f) ? ok(`${f} has a recorded source`) : fail(`${f} is not listed in public/ATTRIBUTIONS.md. Record who owns it.`);
}

console.log(failures ? `\n${failures} problem(s) found.\n` : "\nAll automated checks passed. Legal review is still up to you (see COMPLIANCE.md).\n");
process.exit(failures ? 1 : 0);
