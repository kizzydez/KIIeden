import type { MetadataRoute } from "next";

// Only static, always-available routes. Per-collection / per-NFT / per-RWA pages are
// discoverable from these (Explore, Collections, RWA) rather than enumerated here,
// since a sitemap must not include pages that don't exist yet.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://kiieden.example";
  const now = new Date();
  const routes = ["/", "/explore", "/collections", "/rwa", "/create/single", "/create/collection", "/faq", "/terms", "/privacy", "/cookies", "/refund"];
  return routes.map((r) => ({ url: `${base}${r}`, lastModified: now, changeFrequency: r === "/" ? "hourly" : "daily", priority: r === "/" ? 1 : 0.6 }));
}
