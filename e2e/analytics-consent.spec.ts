/**
 * Analytics + consent against the PRODUCTION build (Phase 12 C/D, PR 4). Analytics is normally
 * inert on localhost, so each test forces it on before load and stubs PostHog's EU endpoint: no
 * real traffic leaves the test. Proves in a real browser that no cookies are set, "Nej tak" stores
 * nothing of PostHog's, "Ja tak" stores only its id, no sent payload carries the user's numbers,
 * and the bundled SDK causes no CSP violation.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { gunzipSync } from "node:zlib";

const PREVIEW = "http://localhost:4174";
const SHARED = {
  currentAge: 47, lifeExpectancy: 90, annualIncome: 612_345, monthlySpending: 23_456,
  currentInvestments: 345_678, monthlySavings: 9_876, pensionBalance: 456_789,
  pensionAccessAge: 68, expectedRealReturn: 0.04, desiredStopAge: 62,
};
const payload = Buffer.from(JSON.stringify(SHARED)).toString("base64url");
const NUMBERS = ["612345", "612.345", "23456", "23.456", "345678", "9876", "9.876", "456789"];

function bodyText(req: Request): string {
  const buf = req.postDataBuffer();
  if (!buf) return req.url();
  try {
    return req.url() + gunzipSync(buf).toString("utf8");
  } catch {
    return req.url() + buf.toString("utf8");
  }
}

async function setup(page: Page) {
  const sent: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __frihedsmodelAnalyticsForce: boolean }).__frihedsmodelAnalyticsForce = true;
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(`${(e as SecurityPolicyViolationEvent).effectiveDirective} ${(e as SecurityPolicyViolationEvent).blockedURI} ${(e as SecurityPolicyViolationEvent).sourceFile}:${(e as SecurityPolicyViolationEvent).lineNumber}`));
  });
  await page.route(/^https:\/\/eu(-assets)?\.i\.posthog\.com\//, async (route) => {
    sent.push(bodyText(route.request()));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return sent;
}

const phKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ph_") || k.startsWith("__ph_")));

test("first visit shows the banner; 'Nej tak' stores no PostHog id and sets no cookies", async ({ page, context }) => {
  const sent = await setup(page);
  await page.goto(`${PREVIEW}/start`);
  const banner = page.getByRole("region", { name: "Må vi huske din browser?" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Nej tak" }).click();
  await expect(banner).toBeHidden();

  await page.getByRole("link", { name: /Kom i gang/ }).click();
  await page.waitForTimeout(1500);
  expect(await phKeys(page)).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("frihedsmodel-consent.v1")!).status)).toBe("denied");
  expect(sent.length, "cookieless page views are still counted").toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
});

test("'Ja tak' lets PostHog keep an id in localStorage, still no cookies", async ({ page, context }) => {
  await setup(page);
  await page.goto(`${PREVIEW}/start`);
  await page.getByRole("button", { name: "Ja tak" }).click();
  await page.waitForTimeout(1000);
  expect((await phKeys(page)).length).toBeGreaterThan(0);
  expect(await context.cookies()).toEqual([]);
});

test("a shared plan never reaches PostHog", async ({ page }) => {
  const sent = await setup(page);
  await page.goto(`${PREVIEW}/resultat#d=${payload}`);
  await page.getByRole("button", { name: "Ja tak" }).click();
  await page.goto(`${PREVIEW}/gem-og-del`);
  await page.getByRole("button", { name: /Gem/ }).first().click();
  await page.waitForTimeout(2000);

  expect(sent.length).toBeGreaterThan(0);
  const all = sent.join("\n");
  expect(all).not.toContain(payload);
  for (const n of NUMBERS) expect(all, `payload must not contain ${n}`).not.toContain(n);
  expect(all).not.toContain("monthlySavings");
});
