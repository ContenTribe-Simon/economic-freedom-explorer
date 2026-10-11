/**
 * PR 2 (Phase 12 C/D): build-time site metadata. Absolute-URL output exists only for a valid
 * VITE_SITE_URL; without one nothing wrong is emitted. The robots Disallow list must track the
 * advanced routes in src/App.tsx, so a new advanced route cannot silently become indexable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DISALLOWED_PATHS,
  SITEMAP_PATHS,
  applySiteUrl,
  normalizeSiteUrl,
  robotsTxt,
  sitemapXml,
} from "../siteMeta";

const ROOT = path.resolve(__dirname, "../../..");

describe("normalizeSiteUrl", () => {
  it.each([
    ["https://frihedsmodel.dk", "https://frihedsmodel.dk"],
    ["https://frihedsmodel.dk/", "https://frihedsmodel.dk"],
    ["  https://example.lovable.app//  ", "https://example.lovable.app"],
    ["https://example.test/app/", "https://example.test/app"],
  ])("accepts %s", (raw, expected) => {
    expect(normalizeSiteUrl(raw)).toBe(expected);
  });

  it.each([undefined, null, "", "   ", "frihedsmodel.dk", "ftp://x.dk", "javascript:alert(1)", "https://x.dk/?a=1", "https://x.dk/#top"])(
    "rejects %s",
    (raw) => {
      expect(normalizeSiteUrl(raw as string | undefined | null)).toBeNull();
    },
  );
});

describe("robotsTxt", () => {
  it("allows the public site and disallows every advanced and debug route", () => {
    const txt = robotsTxt(null);
    expect(txt).toContain("User-agent: *\nAllow: /\n");
    for (const p of DISALLOWED_PATHS) expect(txt).toContain(`Disallow: ${p}\n`);
    expect(txt).not.toContain("Sitemap:");
  });

  it("adds the sitemap line only with a site URL", () => {
    expect(robotsTxt("https://frihedsmodel.dk")).toContain("Sitemap: https://frihedsmodel.dk/sitemap.xml\n");
  });

  it("never disallows a public path", () => {
    for (const p of ["/start", "/simple-inputs", "/resultat", "/gem-og-del"]) {
      expect(DISALLOWED_PATHS.some((d) => p.startsWith(d))).toBe(false);
    }
  });

  it("disallow list matches the advanced routes declared in App.tsx", () => {
    const app = readFileSync(path.join(ROOT, "src/App.tsx"), "utf8");
    const routed = [...app.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1]);
    const publicPaths = new Set(["/", "/start", "/simple-inputs", "/resultat", "/gem-og-del", "/privatliv"]);
    const advanced = routed.filter((p) => !publicPaths.has(p));
    expect(advanced.length).toBeGreaterThan(5);
    for (const p of advanced) {
      expect(DISALLOWED_PATHS.some((d) => p === d || p.startsWith(d)), `${p} is routed but not disallowed`).toBe(true);
    }
  });
});

describe("sitemapXml", () => {
  it("lists the landing page with absolute URLs", () => {
    const xml = sitemapXml("https://frihedsmodel.dk");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const p of SITEMAP_PATHS) expect(xml).toContain(`<loc>https://frihedsmodel.dk${p}</loc>`);
  });
});

describe("applySiteUrl", () => {
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8");

  it("leaves index.html untouched without a site URL", () => {
    expect(applySiteUrl(html, null)).toBe(html);
  });

  it("makes every social-image URL absolute and adds no route-pinning URL", () => {
    const out = applySiteUrl(html, "https://frihedsmodel.dk");
    expect(out).not.toContain('content="/og-image.png"');
    expect(out.match(/content="https:\/\/frihedsmodel\.dk\/og-image\.png"/g)?.length).toBe(2);
    // One index.html serves every route: a static og:url/canonical would pin all of them,
    // including shared /resultat links, to the landing page.
    expect(out).not.toContain("og:url");
    expect(out).not.toContain('rel="canonical"');
  });
});

describe("index.html go-live hygiene", () => {
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8");

  it("is Danish and carries no scaffolding", () => {
    expect(html).toMatch(/<html lang="da">/);
    expect(html).not.toMatch(/lovable/i);
    expect(html).not.toMatch(/TODO/);
    expect(html).not.toContain("scenerier");
    expect(html).not.toContain("—");
  });

  it("references only same-origin assets", () => {
    const urls = [...html.matchAll(/(?:href|src|content)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(urls).toEqual([]);
  });

  it("points social and icon tags at files that exist in public/", () => {
    for (const f of ["og-image.png", "favicon.svg", "favicon.ico", "apple-touch-icon.png"]) {
      expect(html).toContain(`/${f}`);
      expect(() => readFileSync(path.join(ROOT, "public", f))).not.toThrow();
    }
  });
});
