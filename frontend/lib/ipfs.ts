const PRIMARY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs/";

function withSlash(g: string): string {
  return g.endsWith("/") ? g : g + "/";
}

/// Gateways tried in order. The first is configurable; the rest are fallbacks so
/// one flaky/rate-limited gateway doesn't leave the whole marketplace image-less.
export const GATEWAYS: string[] = Array.from(
  new Set([withSlash(PRIMARY), "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/"])
);

/// Turn ipfs://CID/path (or a bare CID, or /ipfs/CID) into the path part CID/path.
export function ipfsPath(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return uri.slice("ipfs://".length).replace(/^ipfs\//, "");
  if (/^\/ipfs\//.test(uri)) return uri.slice("/ipfs/".length);
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})/.test(uri)) return uri;
  return null;
}

/// Resolve any metadata/image URI to a fetchable https URL using gateway #index.
export function toHttp(uri: string, gatewayIndex = 0): string {
  if (!uri) return "";
  const path = ipfsPath(uri);
  if (path) return GATEWAYS[Math.min(gatewayIndex, GATEWAYS.length - 1)] + path;
  return uri; // already http(s) or data:
}

/// Back-compat alias used around the app.
export function resolveIpfsUri(uri: string): string {
  return toHttp(uri, 0);
}

export type RwaDetails = {
  location?: { address?: string; city?: string; country?: string };
  propertyType?: string;
  size?: { value?: string; unit?: string };
  yearBuilt?: string;
  ownership?: { owner?: string; structure?: string; titleRef?: string };
  valuation?: string;
  yield?: { annualPct?: string; rentalIncome?: string; payout?: string };
  additional?: string;
};

export type NftMetadata = {
  name?: string;
  description?: string;
  image?: string; // raw URI as stored (ipfs://… or https://…) - render with <IpfsImage>
  images?: string[]; // RWA galleries
  attributes?: { trait_type: string; value: string | number }[];
  documents?: (string | { name?: string; uri: string })[];
  external_url?: string;
  longDescription?: string;
  properties?: RwaDetails;
};

const metaCache = new Map<string, Promise<NftMetadata | null>>();

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function loadMetadata(uri: string): Promise<NftMetadata | null> {
  // data: URIs carry their JSON inline
  if (uri.startsWith("data:application/json")) {
    try {
      const comma = uri.indexOf(",");
      const head = uri.slice(0, comma);
      const body = uri.slice(comma + 1);
      const text = head.includes("base64") ? atob(body) : decodeURIComponent(body);
      return JSON.parse(text) as NftMetadata;
    } catch {
      return null;
    }
  }

  const tries = ipfsPath(uri) ? GATEWAYS.length : 1;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchWithTimeout(toHttp(uri, i), 9000);
      if (!res.ok) continue;
      return (await res.json()) as NftMetadata;
    } catch {
      // try the next gateway
    }
  }
  return null;
}

/// Fetch + cache token/asset metadata JSON (tries every gateway before giving up).
export function fetchNftMetadata(uri: string): Promise<NftMetadata | null> {
  if (!uri) return Promise.resolve(null);
  let p = metaCache.get(uri);
  if (!p) {
    p = loadMetadata(uri).then((m) => {
      if (!m) metaCache.delete(uri); // don't cache failures - allow a retry later
      return m;
    });
    metaCache.set(uri, p);
  }
  return p;
}
