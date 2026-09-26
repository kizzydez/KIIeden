#!/usr/bin/env node
// Secret scanner. Run: npm run check:secrets
//   - scans the working tree of the whole repo (frontend + contracts) for private keys, API keys, JWTs, mnemonics
//   - checks that no NEXT_PUBLIC_* variable looks like a secret (those are shipped to every visitor)
//   - checks that .env files are ignored by git and not tracked
//   - if this is a git repo, also scans the FULL HISTORY (all branches) for the same patterns
// Exit code 1 means something was found. If it finds something in history, follow SECURITY.md:
// rotate the credential FIRST (assume it is compromised), then rewrite history.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
let problems = 0;
const bad = (m) => { problems++; console.log("  FOUND  " + m); };
const ok = (m) => console.log("  ok     " + m);

const PATTERNS = [
  ["Ethereum private key (64 hex chars, with 0x)", /\b0x[a-fA-F0-9]{64}\b/],
  ["DEPLOYER_PRIVATE_KEY with a value", /PRIVATE_KEY\s*=\s*["']?(0x)?[a-fA-F0-9]{64}/i],
  ["JWT (Pinata / Supabase / etc.)", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["Generic API key assignment", /\b(api[_-]?key|secret|token|passwd|password)\b\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i],
  ["Mnemonic phrase (12+ lowercase words after 'mnemonic' / 'seed')", /\b(mnemonic|seed phrase)\b\s*[:=]\s*["']?([a-z]+\s+){11,}[a-z]+/i],
  ["PEM private key block", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
];
// Hashes and addresses that are public by nature can look like keys: only flag 0x+64hex when it sits next to key-ish words.
const HEX64_CONTEXT = /(private|secret|key|mnemonic|deployer)/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "cache", "artifacts", "typechain-types", "coverage"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

console.log("\n1. Working tree");
const skipExt = /\.(png|jpe?g|webp|ico|gif|zip|woff2?|lock)$/i;
let scanned = 0;
for (const f of walk(repoRoot)) {
  if (skipExt.test(f) || f.endsWith("package-lock.json") || path.basename(f) === "scan-secrets.mjs") continue;
  const rel = path.relative(repoRoot, f);
  let text;
  try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
  scanned++;
  const isEnvFile = /(^|\/)\.env(\.|$)/.test(rel) && !rel.endsWith(".env.example");
  if (isEnvFile) bad(`${rel} is an environment file inside the project tree. It must never be committed or deployed (it is git-ignored; make sure it is not in a zip you share).`);
  for (const [label, re] of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    if (label.startsWith("Ethereum private key")) {
      const ctx = text.slice(Math.max(0, m.index - 60), m.index + 80);
      if (!HEX64_CONTEXT.test(ctx)) continue; // a transaction hash or test constant, not a key
      if (/^0x0+$/.test(m[0]) || /0x(11)+$/.test(m[0])) continue; // the dummy key in hardhat.config.js
    }
    bad(`${label} in ${rel}`);
  }
}
ok(`${scanned} files scanned`);

console.log("\n2. Public environment variables");
const example = path.join(here, "..", ".env.example");
if (fs.existsSync(example)) {
  for (const line of fs.readFileSync(example, "utf8").split(/\r?\n/)) {
    const m = /^(NEXT_PUBLIC_[A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && /(SECRET|PRIVATE|PASSWORD|_KEY$|JWT|TOKEN)/.test(m[1])) bad(`${m[1]} is exposed to every visitor because of the NEXT_PUBLIC_ prefix. Secrets must never use it.`);
  }
  ok("no secret-looking NEXT_PUBLIC_ variables");
}

console.log("\n3. Git");
let inGit = false;
try { execSync("git rev-parse --is-inside-work-tree", { cwd: repoRoot, stdio: "pipe" }); inGit = true; } catch { /* not a repo */ }
if (!inGit) {
  console.log("  skip   not a git repository here. Run this script from your real repository to scan its history.");
} else {
  const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean);
  const trackedEnv = tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"));
  trackedEnv.length ? trackedEnv.forEach((f) => bad(`${f} is tracked by git`)) : ok("no .env files are tracked");
  try {
    const everEnv = execSync("git log --all --name-only --pretty=format: -- '*.env' '*.env.*' '.env*'", { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n").filter((f) => f && !f.endsWith(".env.example"));
    [...new Set(everEnv)].forEach((f) => bad(`${f} exists in git history`));
    if (!everEnv.length) ok("no .env file ever committed");
  } catch { /* ignore */ }
  for (const [label, re] of PATTERNS) {
    try {
      const hit = execSync(`git log --all -p -G${JSON.stringify(re.source)} --pretty=format:%h --max-count=1`, { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (hit && !label.startsWith("Ethereum private key")) bad(`${label} appears in history (commit ${hit.split("\n")[0]})`);
    } catch { /* pattern unsupported by git -G: skip */ }
  }
}

console.log(problems ? `\n${problems} problem(s). Read SECURITY.md before doing anything else.\n` : "\nNo secrets found.\n");
process.exit(problems ? 1 : 0);
