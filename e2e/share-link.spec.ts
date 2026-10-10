/**
 * Share links (PR 1, Phase 12 C/D): the payload sits in the URL fragment, which the browser never
 * sends to the server. Proven against a real browser: no network request carries the payload, the
 * shared plan lands in the recipient's local state, and the address bar is cleaned.
 */
import { test, expect } from "@playwright/test";

const PUBLIC_KEY = "frihedsmodel-public.v1";

function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

const SHARED = {
  currentAge: 47, lifeExpectancy: 90, annualIncome: 612_345, monthlySpending: 23_456,
  currentInvestments: 345_678, monthlySavings: 9_876, pensionBalance: 456_789,
  pensionAccessAge: 68, expectedRealReturn: 0.04, desiredStopAge: 62,
};

async function storedInputs(page: import("@playwright/test").Page) {
  const raw = await page.evaluate((k) => localStorage.getItem(k), PUBLIC_KEY);
  return JSON.parse(raw!).state.inputs;
}

test("fragment share link: payload never sent, plan hydrated, URL cleaned", async ({ page }) => {
  const payload = encode(SHARED);
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));

  await page.goto(`/resultat#d=${payload}`);
  await expect(page).toHaveURL(/\/resultat$/);

  expect(requested.length).toBeGreaterThan(0);
  expect(requested.filter((u) => u.includes(payload))).toEqual([]);
  expect(await storedInputs(page)).toMatchObject({ currentAge: 47, monthlySavings: 9_876 });
});

test("legacy ?d= link still hydrates and is cleaned (and is the leak the fragment avoids)", async ({ page }) => {
  const payload = encode({ ...SHARED, currentAge: 52 });
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));

  await page.goto(`/resultat?d=${payload}`);
  await expect(page).toHaveURL(/\/resultat$/);
  expect((await storedInputs(page)).currentAge).toBe(52);

  // Positive control for the detection above: a query-param payload IS sent to the server, so
  // the "no request carries the payload" assertion in the fragment test can genuinely fail.
  expect(requested.some((u) => u.includes(payload))).toBe(true);
});
