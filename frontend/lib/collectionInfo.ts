import { safeHref } from "./sanitize";


/// Collection-level info (banner, social links, mint schedule) lives in a small
/// `collection.json` pinned inside the same IPFS folder as the token metadata. The
/// collection contract points to it via `contractURI()`, so no database is needed.
export type LaunchLinks = { twitter?: string; website?: string; telegram?: string; discord?: string };
export type MintInfo = { startsAt?: string; endsAt?: string };
export type WhitelistInfo = { uri: string; root: string; count: number };
export type RevealInfo = { at: string };
export type CollectionJson = {
  name?: string;
  description?: string;
  image?: string;
  banner?: string; // wide banner image shown on Explore and the collection page
  links?: LaunchLinks;
  mint?: MintInfo;
  whitelist?: WhitelistInfo;
  reveal?: RevealInfo;
};

/// Add https:// when missing and make sure the result really is an http(s) URL. "" stays "".
export function normalizeUrl(input: string): { url: string; valid: boolean } {
  const t = input.trim();
  if (!t) return { url: "", valid: true };
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:\/\//i.test(t)) return { url: t, valid: false }; // javascript:, data:, ftp: ...
  const safe = safeHref(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  return safe ? { url: safe, valid: true } : { url: t, valid: false };
}
