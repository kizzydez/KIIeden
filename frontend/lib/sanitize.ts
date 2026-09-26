/// Input sanitising. React already escapes text it renders, so nothing typed here can inject
/// HTML. This module is the second layer: it cleans what is WRITTEN to IPFS / the blockchain
/// (permanent, shown in other people's apps) and what is used as a link.
///
///  - strips control characters and zero-width / bidirectional-override characters
///    (used to spoof names, e.g. a right-to-left override that reverses text),
///  - normalises Unicode, collapses whitespace, enforces length limits,
///  - only ever allows http(s) links, and rejects links with embedded credentials.

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g; // keeps tab, newline, carriage return
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u061C]/g;

/// One line of text (names, trait names, titles): no line breaks, single spaces, trimmed, capped.
export function cleanLine(input: string, max: number): string {
  return input
    .normalize("NFC")
    .replace(CONTROL, "")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/// Multi-line text (descriptions): keeps paragraph breaks, at most one blank line in a row.
export function cleanText(input: string, max: number): string {
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(INVISIBLE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/// Token symbol: letters and digits only, upper-case.
export function cleanSymbol(input: string, max = 10): string {
  return input.normalize("NFKC").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, max);
}

/// Returns a safe absolute http(s) URL, or undefined. Use it for EVERY href that comes from
/// user or IPFS data (collection links, documents): `javascript:`, `data:`, `vbscript:` and
/// friends are refused, as are URLs with a username or password in them.
export function safeHref(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (t.length === 0 || t.length > 2048) return undefined;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    if (u.username || u.password) return undefined;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/// A search / free-text query: one short clean line.
export function cleanQuery(input: string): string {
  return cleanLine(input, 100);
}
