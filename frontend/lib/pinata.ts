"use client";

import { hasFunctionalConsent } from "./consent";
import { cleanLine, cleanText } from "./sanitize";

/// Client-side IPFS pinning via Pinata's REST API. There's no backend in this
/// project (deliberately - "no traditional database"), so the browser talks
/// to Pinata directly using a JWT the USER supplies and that stays in their
/// own browser; it's never sent anywhere but api.pinata.cloud, and never
/// hardcoded into this app. Get a free JWT at https://app.pinata.cloud/developers/api-keys
/// (permission needed: pinFileToIPFS).

const PINATA_JWT_KEY = "kiieden_pinata_jwt";

/// The key is kept in sessionStorage (gone when the tab closes). Only if the user
/// agreed to optional storage (cookie banner) is it also remembered on this device.
export function getPinataJwt(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(PINATA_JWT_KEY) || (hasFunctionalConsent() ? localStorage.getItem(PINATA_JWT_KEY) || "" : "");
  } catch {
    return "";
  }
}

export function setPinataJwt(jwt: string) {
  const value = jwt.trim();
  try {
    sessionStorage.setItem(PINATA_JWT_KEY, value);
    if (hasFunctionalConsent()) localStorage.setItem(PINATA_JWT_KEY, value);
    else localStorage.removeItem(PINATA_JWT_KEY);
  } catch {
    /* storage blocked (private mode): the key just won't persist */
  }
}

export function hasPinataJwt(): boolean {
  return getPinataJwt().length > 0;
}

/// A real Pinata JWT is three dot-separated base64url segments and 100+ chars.
export function looksLikeJwt(value: string): boolean {
  const t = value.trim();
  return t.split(".").length === 3 && t.length > 100;
}

async function pinataFetch(formData: FormData): Promise<string> {
  const jwt = getPinataJwt();
  if (!jwt) throw new Error("Add your Pinata API JWT first (see the field above the form).");

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: formData,
      });
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error("Pinata rejected your JWT (401/403). Check the key and its pinning permission."), {
          fatal: true,
        });
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Pinata upload failed (${res.status}): ${text || res.statusText}`);
      }
      const json = (await res.json()) as { IpfsHash: string };
      return json.IpfsHash;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error("Pinata upload failed.");
}

const fileSig = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
const pinCache = new Map<string, string>();

/// Pin a single raw file (an image, a PDF…). Returns its CID. Results are cached
/// per file, so if a later step fails and you press the button again, files that
/// already uploaded are not uploaded twice.
export async function pinFile(file: File): Promise<string> {
  const sig = fileSig(file);
  const hit = pinCache.get(sig);
  if (hit) return hit;
  const formData = new FormData();
  formData.append("file", file, file.name);
  const cid = await pinataFetch(formData);
  pinCache.set(sig, cid);
  return cid;
}

/// Check a JWT against Pinata before the user wastes a launch on a bad key.
export async function testPinataJwt(jwt: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("https://api.pinata.cloud/data/testAuthentication", { headers: { Authorization: `Bearer ${jwt.trim()}` } });
    if (res.ok) return { ok: true, message: "Key verified" };
    if (res.status === 401 || res.status === 403) return { ok: false, message: "Pinata rejected this key (401/403). Copy the JWT again." };
    return { ok: false, message: `Pinata answered ${res.status}.` };
  } catch {
    return { ok: false, message: "Couldn't reach Pinata — check your internet connection or ad-blocker." };
  }
}

/// Split files into upload batches limited by count and total size.
export function chunkFiles(files: File[], maxFiles = 100, maxBytes = 40 * 1024 * 1024): File[][] {
  const chunks: File[][] = [];
  let cur: File[] = [];
  let bytes = 0;
  for (const f of files) {
    if (cur.length > 0 && (cur.length >= maxFiles || bytes + f.size > maxBytes)) {
      chunks.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(f);
    bytes += f.size;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

const dirCache = new Map<string, string>();

/// Upload MANY images (10,000+ is fine). They go up in size-limited folder batches
/// (one request per batch instead of one per file, which keeps Pinata's rate limit
/// happy). Returns one `ipfs://<batchFolderCid>/<n>.<ext>` URI per input file, in
/// input order. Finished batches are cached, so a failed launch resumes instead of
/// starting over.
export async function pinImagesBatched(files: File[], onProgress?: (done: number, total: number) => void, concurrency = 2): Promise<string[]> {
  const uris: string[] = new Array(files.length);
  const batches = chunkFiles(files);
  let offset = 0;
  const jobs = batches.map((batch) => {
    const start = offset;
    offset += batch.length;
    return { batch, start };
  });
  let done = 0;
  let next = 0;

  async function worker() {
    while (true) {
      const j = next++;
      if (j >= jobs.length) return;
      const { batch, start } = jobs[j];
      const named = batch.map((f, k) => {
        const ext = (/\.[a-zA-Z0-9]{2,5}$/.exec(f.name)?.[0] ?? ".png").toLowerCase();
        return { filename: `${start + k}${ext}`, content: f as Blob };
      });
      const key = `batch|${named.map((n, k) => n.filename + fileSig(batch[k])).join(",")}`;
      let cid = dirCache.get(key);
      if (!cid) {
        cid = await pinDirectory(named, `images-${j}`);
        dirCache.set(key, cid);
      }
      named.forEach((n, k) => (uris[start + k] = `ipfs://${cid}/${n.filename}`));
      done += batch.length;
      onProgress?.(done, files.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return uris;
}

/// Pin several files with a small concurrency limit and progress callback.
export async function pinFiles(files: File[], onProgress?: (done: number, total: number) => void, concurrency = 3): Promise<string[]> {
  const cids: string[] = new Array(files.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= files.length) return;
      cids[i] = await pinFile(files[i]);
      done += 1;
      onProgress?.(done, files.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return cids;
}

/// Pin a directory of files in one call, so the returned CID is a folder CID and
/// `ipfs://<CID>/<filename>` resolves each entry. Used to build a collection's
/// baseURI: filenames "0", "1", "2"… match ERC-721's `baseURI + tokenId` scheme.
export async function pinDirectory(files: { filename: string; content: Blob }[], dirName: string): Promise<string> {
  const formData = new FormData();
  for (const f of files) {
    // Files sharing a leading folder segment in their path are pinned as one directory.
    formData.append("file", f.content, `${dirName}/${f.filename}`);
  }
  formData.append("pinataMetadata", JSON.stringify({ name: dirName }));
  return pinataFetch(formData);
}

export type Attribute = { trait_type: string; value: string };

/// Standard (OpenSea / Magic Eden compatible) token metadata. `image` is a full URI.
/// Every text field is sanitised here, because this is what gets written to IPFS permanently
/// (including names and traits imported from a CSV / JSON / XML file).
export function buildMetadataJson(
  name: string,
  description: string,
  imageUri: string,
  attributes: Attribute[],
  extra: Record<string, unknown> = {}
) {
  return JSON.stringify({
    name: cleanLine(name, 100),
    description: cleanText(description, 2000),
    image: imageUri,
    attributes: attributes
      .map((a) => ({ trait_type: cleanLine(a.trait_type, 64), value: cleanLine(a.value, 128) }))
      .filter((a) => a.trait_type && a.value),
    ...extra,
  });
}
