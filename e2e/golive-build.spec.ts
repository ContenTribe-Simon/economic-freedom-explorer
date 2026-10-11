/**
 * Go-live hygiene of the PRODUCTION build (Phase 12 C/D, PR 2). Runs against the vite preview of
 * dist/ (http://localhost:4174, see playwright.config.ts), because robots.txt and the site-meta
 * rewrites exist only in build output. CI builds without VITE_SITE_URL, so this pins the
 * "domain not decided" state: robots.txt served, no sitemap, no absolute URLs invented.
 */
import { test, expect } from "@playwright/test";

const PREVIEW = "http://localhost:4174";

test("served HTML is Danish, branded and free of scaffolding", async ({ request }) => {
  const res = await request.get(`${PREVIEW}/start`);
  expect(res.ok()).toBe(true);
  const html = await res.text();
  expect(html).toContain('<html lang="da">');
  expect(html).toContain("<title>Frihedsmodel");
  expect(html).not.toMatch(/lovable/i);
  expect(html).toContain('content="/og-image.png"');
  expect(html).not.toContain("og:url");
});

test("robots.txt keeps the advanced app out of search and names no sitemap without a domain", async ({ request }) => {
  const res = await request.get(`${PREVIEW}/robots.txt`);
  expect(res.ok()).toBe(true);
  const txt = await res.text();
  expect(txt).toContain("Allow: /\n");
  expect(txt).toContain("Disallow: /dashboard\n");
  expect(txt).toContain("Disallow: /debug/\n");
  expect(txt).not.toContain("Sitemap:");
});

test("brand assets are served from the site itself", async ({ request }) => {
  for (const [file, type] of [
    ["/og-image.png", "image/png"],
    ["/favicon.svg", "image/svg+xml"],
    ["/favicon.ico", "image/"],
    ["/apple-touch-icon.png", "image/png"],
  ] as const) {
    const res = await request.get(`${PREVIEW}${file}`);
    expect(res.ok(), `${file} should be served`).toBe(true);
    expect(res.headers()["content-type"], file).toContain(type);
  }
});
