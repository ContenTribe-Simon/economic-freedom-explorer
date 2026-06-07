/**
 * Playwright smoke tests — prove the React app boots in a real browser and the main
 * user-facing routes render (not blank / not crashed). Runs against the local Vite dev
 * server (see playwright.config.ts), NOT the Lovable preview.
 *
 * Scope: smoke only. Robust text/role selectors; no pixel/layout assertions; no overfitting
 * to styling. Each test also fails on any uncaught browser runtime error (pageerror).
 */
import { test, expect, type Page } from "@playwright/test";

// Collect uncaught browser exceptions per test; assert none after each test.
let pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
});

test.afterEach(() => {
  expect(pageErrors, `uncaught runtime errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

/** The page rendered real content (not a blank-screen crash). */
async function expectNotBlank(page: Page): Promise<void> {
  await expect(page.locator("body")).toBeVisible();
  const text = (await page.locator("body").innerText()).trim();
  expect(text.length, "page should not be blank").toBeGreaterThan(40);
}

const SIDEBAR_LINKS = ["Dashboard", "Variabler", "Livsfaser", "År-for-år", "Scenarier", "FIRE", "Lande", "Antagelser", "Rapport", "Snapshots", "Cloud"];

test.describe("App shell & navigation", () => {
  test("app loads without a blank screen and shows the sidebar navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Frihedsmodel")).toBeVisible(); // brand in sidebar
    for (const label of SIDEBAR_LINKS) {
      await expect(page.getByRole("link", { name: label }), `nav link "${label}"`).toBeVisible();
    }
    await expectNotBlank(page);
  });

  test("navigating across the main routes via the sidebar never crashes or goes blank", async ({ page }) => {
    await page.goto("/");
    // Excludes "Rapport" (print view hides the sidebar) and "Cloud" (auth redirect) — both
    // covered separately below.
    const steps: Array<[label: string, urlPart: string]> = [
      ["Variabler", "/inputs"],
      ["Livsfaser", "/life-events"],
      ["År-for-år", "/projection"],
      ["Scenarier", "/scenarios"],
      ["FIRE", "/fire"],
      ["Lande", "/countries"],
      ["Antagelser", "/assumptions"],
      ["Snapshots", "/snapshots"],
      ["Dashboard", "/"],
    ];
    for (const [label, urlPart] of steps) {
      await page.getByRole("link", { name: label }).click();
      await expect(page, `URL after clicking "${label}"`).toHaveURL(new RegExp(`${urlPart === "/" ? "/" : urlPart}$`));
      await expectNotBlank(page);
    }
  });
});

test.describe("Core user-facing pages render", () => {
  test("Dashboard shows core dashboard content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Kapitaludvikling")).toBeVisible();
    await expectNotBlank(page);
  });

  test("Inputs/Variables page shows core input labels", async ({ page }) => {
    await page.goto("/inputs");
    await expect(page.getByText("Person & alder")).toBeVisible();
    await expect(page.getByText("Fri/investerbar kapital")).toBeVisible();
    await expectNotBlank(page);
  });

  test("Year-by-year/projection page shows projection content", async ({ page }) => {
    await page.goto("/projection");
    await expect(page.getByRole("columnheader", { name: "Alder" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Nettoformue" })).toBeVisible();
    await expectNotBlank(page);
  });

  test("Scenarios page loads", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(page.getByText("Sammenlign side om side")).toBeVisible();
    await expectNotBlank(page);
  });

  test("FIRE page loads", async ({ page }) => {
    await page.goto("/fire");
    await expect(page.getByText("FIRE-benchmarks")).toBeVisible();
    await expectNotBlank(page);
  });

  test("Countries page loads", async ({ page }) => {
    await page.goto("/countries");
    await expect(page.getByRole("heading", { name: "Landeanalyse" })).toBeVisible();
    await expectNotBlank(page);
  });

  test("Assumptions page loads", async ({ page }) => {
    await page.goto("/assumptions");
    await expect(page.getByRole("heading", { name: "Skat, afkast & inflation" })).toBeVisible();
    await expectNotBlank(page);
  });

  test("Life events page loads", async ({ page }) => {
    await page.goto("/life-events");
    await expect(page.getByRole("button", { name: /Tilføj livsfase/ })).toBeVisible();
    await expectNotBlank(page);
  });

  test("Report page loads (print view, no sidebar) and shows model status", async ({ page }) => {
    await page.goto("/report");
    await expect(page.getByText("Modelstatus")).toBeVisible();
    await expect(page.getByText("Nøgletal")).toBeVisible();
    await expectNotBlank(page);
  });

  test("Snapshots page loads", async ({ page }) => {
    await page.goto("/snapshots");
    await expect(page.getByRole("heading", { name: "Snapshot-historik" })).toBeVisible();
    await expectNotBlank(page);
  });

  test("Cloud route exists and redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/cloud");
    // Unauthenticated ⇒ Cloud redirects to /auth (a valid, non-crashing state).
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole("heading", { name: "Log ind" })).toBeVisible();
    await expectNotBlank(page);
  });

  test("Model validation/debug page loads and shows checks with pass/fail counts", async ({ page }) => {
    await page.goto("/debug/model-validation");
    await expect(page.getByRole("heading", { name: "Model validation" })).toBeVisible();
    await expect(page.getByText("Checks", { exact: true })).toBeVisible();
    await expect(page.getByText("Pass", { exact: true })).toBeVisible();
    await expect(page.getByText("Fail", { exact: true })).toBeVisible();
    // Pass/fail counts are present and numeric.
    const passText = (await page.getByTestId("validation-pass-count").innerText()).trim();
    const failText = (await page.getByTestId("validation-fail-count").innerText()).trim();
    expect(Number.isNaN(Number(passText))).toBe(false);
    expect(Number.isNaN(Number(failText))).toBe(false);
    await expectNotBlank(page);
  });
});
