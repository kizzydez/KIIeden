#!/usr/bin/env node
// Checks that every static internal link (<Link href="..."> or href="...") points at a route
// that actually exists in app/. Run: npm run check:links
// It cannot check dynamic hrefs built from a variable, e.g. href={`/collection/${addr}`} —
// those are verified by TypeScript instead (the route file must exist for the string to compile).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const appDir = path.join(root, "app");
let problems = 0;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Build the set of real routes from app/**/page.tsx, turning [param] segments into a wildcard marker.
const pageFiles = walk(appDir).filter((f) => /(^|\/)page\.tsx$/.test(f));
const routes = pageFiles.map((f) => {
  let rel = "/" + path.relative(appDir, path.dirname(f)).split(path.sep).join("/");
  if (rel === "/.") rel = "/";
  rel = rel.replace(/\/\([^)]+\)/g, ""); // route groups
  rel = rel.replace(/\[[^\]]+\]/g, "*");
  return rel === "" ? "/" : rel;
});

function routeExists(href) {
  const clean = href.split(/[?#]/)[0];
  if (clean === "/") return true;
  const parts = clean.split("/").filter(Boolean);
  return routes.some((r) => {
    const rp = r.split("/").filter(Boolean);
    if (rp.length !== parts.length) return false;
    return rp.every((seg, i) => seg === "*" || seg === parts[i]);
  });
}

const EXTERNAL = /^(https?:|mailto:|tel:|#)/;
const tsxFiles = walk(root).filter((f) => f.endsWith(".tsx") && !f.includes("node_modules") && !f.includes(".next"));
const seen = new Set();

for (const f of tsxFiles) {
  const text = fs.readFileSync(f, "utf8");
  const re = /\bhref=(?:"([^"]+)"|'([^']+)'|\{"([^"}]+)"\})/g;
  let m;
  while ((m = re.exec(text))) {
    const href = m[1] || m[2] || m[3];
    if (!href || EXTERNAL.test(href) || href.includes("${") || href.includes("`")) continue; // dynamic: skip, TS covers it
    const key = href + "|" + f;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!routeExists(href)) {
      problems++;
      console.log(`  FAIL  ${href}  (in ${path.relative(root, f)})`);
    }
  }
}

console.log(problems ? `\n${problems} broken internal link(s).\n` : `\nAll static internal links resolve to a real route (${routes.length} routes checked).\n`);
process.exit(problems ? 1 : 0);
