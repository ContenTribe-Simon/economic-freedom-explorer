/**
 * Build-time site metadata (Phase 12 C/D, PR 2 — go-live hygiene). Pure functions only, so the
 * Vite plugin in vite.config.ts and the unit tests share one implementation.
 *
 * The production domain is not decided yet, so everything that needs an ABSOLUTE URL (og:url,
 * absolute social-image URLs, sitemap.xml, the robots Sitemap line) is driven by one
 * optional build variable, VITE_SITE_URL. Unset or invalid means those are omitted rather than
 * emitted wrong: a missing og:url is harmless, one pointing at the wrong host is not.
 */

/** Public routes worth indexing. The input and result screens are app state, not landing pages. */
export const SITEMAP_PATHS = ["/start"] as const;

/**
 * Routes kept out of search results: the advanced app (behind the opt-in door) and the debug
 * surface. Kept in sync with the routes in src/App.tsx by a unit test.
 */
export const DISALLOWED_PATHS = [
  "/dashboard",
  "/auth",
  "/cloud",
  "/inputs",
  "/assumptions",
  "/projection",
  "/scenarios",
  "/report",
  "/snapshots",
  "/life-events",
  "/fire",
  "/countries",
  "/debug/",
] as const;

export const SOCIAL_IMAGE_PATH = "/og-image.png";

/** An http(s) origin plus optional base path, without trailing slash; null when unusable. */
export function normalizeSiteUrl(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.search || url.hash) return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function robotsTxt(siteUrl: string | null): string {
  const lines = ["User-agent: *", "Allow: /", ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`)];
  if (siteUrl) lines.push("", `Sitemap: ${siteUrl}/sitemap.xml`);
  return lines.join("\n") + "\n";
}

export function sitemapXml(siteUrl: string): string {
  const urls = SITEMAP_PATHS.map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * Rewrites the built index.html for a known site URL: the relative social-image URLs become
 * absolute (crawlers such as Facebook require it) and og:url is added. Returns the html unchanged
 * without a site URL. No canonical link: in a single-page app one static canonical would point
 * every route, including future content pages, at the landing page.
 */
export function applySiteUrl(html: string, siteUrl: string | null): string {
  if (!siteUrl) return html;
  const image = `${siteUrl}${SOCIAL_IMAGE_PATH}`;
  const ogUrl = `  <meta property="og:url" content="${siteUrl}${SITEMAP_PATHS[0]}" />\n  `;
  return html
    .split(`content="${SOCIAL_IMAGE_PATH}"`)
    .join(`content="${image}"`)
    .replace("</head>", `${ogUrl}</head>`);
}
