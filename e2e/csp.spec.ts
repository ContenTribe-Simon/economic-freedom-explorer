/**
 * CSP e2e (Phase 12 workstream B) — proves the production build's Content-Security-Policy is
 * present, actively ENFORCED, and NOT violated by the app's own resources on the public routes.
 *
 * Runs against the vite preview of dist/ (http://localhost:4174, declared in playwright.config.ts)
 * because the CSP <meta> is injected only at build time (vite.config.ts) — the dev server has none.
 *
 * Detection is authoritative, not console-scraping: Chrome does NOT surface CSP blocks through the
 * page console, so a `securitypolicyviolation` listener installed BEFORE any page script runs
 * (addInitScript) captures load-time AND runtime blocks, cross-checked by a buffered
 * ReportingObserver. The FIRST test is a POSITIVE CONTROL: it deliberately triggers a real CSP
 * block and asserts the detector catches it, so this suite fails loudly if the detection mechanism
 * itself ever breaks — it can never silently report a false "zero violations".
 */
import { test, expect, type Page } from "@playwright/test";

const PREVIEW = "http://localhost:4174";
const PUBLIC_PAGES = ["/start", "/simple-inputs", "/resultat"] as const;

// Install the violation collector before the document's own scripts/resources load.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: Array<Record<string, unknown>> };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e: unknown) => {
      const ev = e as { effectiveDirective?: string; violatedDirective?: string; blockedURI?: string };
      w.__csp.push({ via: "event", directive: ev.effectiveDirective || ev.violatedDirective, blockedURI: ev.blockedURI, where: location.pathname });
    });
    try {
      const RO = (window as unknown as { ReportingObserver?: new (cb: (r: unknown[]) => void, o: unknown) => { observe: () => void } }).ReportingObserver;
      if (RO) {
        new RO((reports: unknown[]) => {
          for (const r of reports as Array<{ type: string; body: Record<string, string> }>) {
            if (r.type === "csp-violation")
              w.__csp.push({ via: "report", directive: r.body.effectiveDirective, blockedURI: r.body.blockedURL || r.body.blockedURI, where: location.pathname });
          }
        }, { buffered: true, types: ["csp-violation"] }).observe();
      }
    } catch {
      // ReportingObserver unavailable — the securitypolicyviolation listener already covers it.
    }
  });
});

async function readViolations(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 300)); // let buffered reports flush
    return (window as unknown as { __csp: Array<Record<string, unknown>> }).__csp;
  });
}

test("positive control: the detector catches a real CSP block (guards against false negatives)", async ({ page }) => {
  await page.goto(`${PREVIEW}/start`);

  // The tight CSP must actually be served in the production build.
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp, "production build served no CSP meta").toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self'");

  // Deliberately violate connect-src + img-src against a resolvable external origin. CSP blocks this
  // BEFORE the network, so it does not depend on example.com being reachable from the runner.
  await page.evaluate(() => {
    void fetch("https://example.com/csp-probe").catch(() => {});
    const img = document.createElement("img");
    img.src = "https://example.com/csp-probe.png";
    document.body.appendChild(img);
  });

  const violations = await readViolations(page);
  const directives = violations.map((v) => v.directive);
  expect(
    directives,
    `detector did NOT catch a deliberate CSP block — the mechanism is broken; captured=${JSON.stringify(violations)}`,
  ).toContain("connect-src");
});

for (const path of PUBLIC_PAGES) {
  test(`no CSP violations on ${path} (load-time + runtime)`, async ({ page }) => {
    await page.goto(`${PREVIEW}${path}`);
    await page.waitForTimeout(800); // let the SPA render + recharts inject its runtime <style>

    const violations = await readViolations(page);
    expect(violations, `unexpected CSP violations on ${path}: ${JSON.stringify(violations)}`).toEqual([]);

    // Sanity: the page rendered UNDER the CSP — a CSP-blocked JS bundle would leave #root empty.
    const rootText = (await page.locator("#root").innerText()).trim();
    expect(rootText.length, `${path} rendered blank under CSP`).toBeGreaterThan(0);
  });
}
