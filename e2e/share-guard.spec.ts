/**
 * Share-link guard against the PRODUCTION build: the hosting platform injects deferred analytics
 * that reports location.href. This spec injects an equivalent deferred probe into the served HTML
 * and proves it never sees a share link's figures, while the app still hydrates the shared plan.
 */
import { test, expect } from "@playwright/test";

const PREVIEW = "http://localhost:4174";
const SHARED = {
  currentAge: 47, lifeExpectancy: 90, annualIncome: 612_345, monthlySpending: 23_456,
  currentInvestments: 345_678, monthlySavings: 9_876, pensionBalance: 456_789,
  pensionAccessAge: 68, expectedRealReturn: 0.04, desiredStopAge: 62,
};
const payload = Buffer.from(JSON.stringify(SHARED)).toString("base64url");

async function withHostAnalyticsProbe(page: import("@playwright/test").Page) {
  // Same shape as the injected host script: deferred, same-origin, reads location.href when it runs.
  await page.route("**/__host-analytics-probe.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: "window.__probeHref = location.href;" }),
  );
  await page.route(/\/resultat(\?.*)?$/, async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace("</head>", '<script defer src="/__host-analytics-probe.js"></script></head>');
    await route.fulfill({ response: res, body: html });
  });
}

for (const [label, url] of [
  ["fragment link", `${PREVIEW}/resultat#d=${payload}`],
  ["legacy ?d= link", `${PREVIEW}/resultat?d=${payload}`],
] as const) {
  test(`${label}: host analytics never sees the figures, the plan still loads`, async ({ page }) => {
    await withHostAnalyticsProbe(page);
    await page.goto(url);
    await expect(page).toHaveURL(`${PREVIEW}/resultat`);
    const seen = await page.evaluate(() => (window as unknown as { __probeHref?: string }).__probeHref);
    expect(seen).toBe(`${PREVIEW}/resultat`);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("frihedsmodel-public.v1")!).state.inputs);
    expect(stored).toMatchObject({ currentAge: 47, monthlySavings: 9_876 });
    expect(await page.evaluate(() => sessionStorage.getItem("frihedsmodel-share-payload"))).toBeNull();
  });
}

test("the guard leaves other pages and plain visits alone", async ({ page }) => {
  await page.goto(`${PREVIEW}/start#d=${payload}`);
  expect(page.url()).toContain(`#d=${payload}`);
  expect(await page.evaluate(() => sessionStorage.getItem("frihedsmodel-share-payload"))).toBeNull();
});

test("positive control: without the guard the host analytics WOULD see the figures", async ({ page }) => {
  await withHostAnalyticsProbe(page);
  await page.route("**/share-guard.js", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto(`${PREVIEW}/resultat#d=${payload}`);
  await page.waitForFunction(() => (window as unknown as { __probeHref?: string }).__probeHref !== undefined);
  const seen = await page.evaluate(() => (window as unknown as { __probeHref?: string }).__probeHref);
  expect(seen).toContain(payload);
});
