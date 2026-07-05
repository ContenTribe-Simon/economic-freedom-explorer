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

/**
 * Open the Advanced door before the app boots. These are advanced-app smoke tests, and the
 * door opt-in is persisted per device — seeding it reproduces the state of a device that has
 * chosen the advanced model, which is the precondition these tests run under. The door
 * itself (fresh device) is covered by the "Advanced door" describe below.
 */
async function withDoorOpen(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("frihedsmodel-advanced-door.v1", "open"));
}

test.describe("App shell & navigation", () => {
  test.beforeEach(async ({ page }) => {
    await withDoorOpen(page);
  });

  test("app loads without a blank screen and shows the sidebar navigation", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Frihedsmodel")).toBeVisible(); // brand in sidebar
    for (const label of SIDEBAR_LINKS) {
      await expect(page.getByRole("link", { name: label }), `nav link "${label}"`).toBeVisible();
    }
    await expectNotBlank(page);
  });

  test("navigating across the main routes via the sidebar never crashes or goes blank", async ({ page }) => {
    await page.goto("/dashboard");
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
      ["Dashboard", "/dashboard"],
    ];
    for (const [label, urlPart] of steps) {
      await page.getByRole("link", { name: label }).click();
      await expect(page, `URL after clicking "${label}"`).toHaveURL(new RegExp(`${urlPart}$`));
      await expectNotBlank(page);
    }
  });
});

test.describe("Core user-facing pages render", () => {
  test.beforeEach(async ({ page }) => {
    await withDoorOpen(page);
  });

  test("Dashboard shows core dashboard content", async ({ page }) => {
    await page.goto("/dashboard");
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

test.describe("Advanced door (fresh device, no opt-in seeded)", () => {
  test("the public flow is the default entry: '/' lands on Start", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.getByRole("heading", { name: "Se hvornår du kan stoppe med at arbejde." })).toBeVisible();
    await expectNotBlank(page);
  });

  test("a direct advanced URL shows the door; opting in opens the app AT that URL and is remembered", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Du er på vej ind i den avancerede model.")).toBeVisible();
    await expect(page.getByText("Kapitaludvikling")).not.toBeVisible();
    await page.getByTestId("open-advanced-door").click();
    // Same URL, requested page appears; no redirect dance.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Kapitaludvikling")).toBeVisible();
    // The opt-in is remembered on the device: later direct navigation goes straight through.
    await page.goto("/inputs");
    await expect(page.getByText("Person & alder")).toBeVisible();
    await expectNotBlank(page);
  });

  test("the debug surface sits behind the same door", async ({ page }) => {
    await page.goto("/debug/model-validation");
    await expect(page.getByText("Du er på vej ind i den avancerede model.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Model validation" })).not.toBeVisible();
    await expectNotBlank(page);
  });

  test("the door's back link returns to the public flow", async ({ page }) => {
    await page.goto("/scenarios");
    await page.getByRole("link", { name: /Tilbage til den enkle udgave/ }).click();
    await expect(page).toHaveURL(/\/start$/);
    await expectNotBlank(page);
  });

  test("the Result screen shows the 1-lever sensitivity helper for a plan with cashflow room", async ({ page }) => {
    // Scope doc item 7 (Playwright presence). Seed the PUBLIC store with a plan where the
    // savings lever responds (the default persona's planned savings exceed its cashflow, so
    // the helper is deliberately hidden there — see publicSensitivity.ts).
    await page.addInitScript(() => {
      localStorage.setItem(
        "frihedsmodel-public.v1",
        JSON.stringify({
          state: {
            inputs: {
              // DEFAULT_SIMPLE_INPUTS with spending 15.000 / savings 2.000 / stop 67 — the
              // same "room" fixture the unit tests pin ("kan du tidligst stoppe ved alder 64
              // i stedet for 67").
              currentAge: 35,
              lifeExpectancy: 90,
              annualIncome: 500_000,
              monthlySpending: 15_000,
              currentInvestments: 200_000,
              monthlySavings: 2_000,
              pensionBalance: 300_000,
              pensionAccessAge: 67,
              expectedRealReturn: 0.04,
              desiredStopAge: 67,
            },
            saved: [],
          },
          version: 0,
        }),
      );
    });
    await page.goto("/resultat");
    await expect(page.getByTestId("sensitivity-helper")).toBeVisible();
    await expect(page.getByText(/Hvis du sparer 1\.000 kr mere op om måneden/)).toBeVisible();
    await expectNotBlank(page);
  });

  test("the public flow's quiet 'Avanceret' entry hits the door on a fresh device", async ({ page }) => {
    // The data contract's single low-emphasis entry lives on the Save/Share screen. Clicking
    // it goes through the Advanced door like any other advanced URL — it must never bypass it.
    await page.goto("/gem-og-del");
    await page.getByRole("link", { name: "Avanceret" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Du er på vej ind i den avancerede model.")).toBeVisible();
    await expect(page.getByText("Kapitaludvikling")).not.toBeVisible();
    await expectNotBlank(page);
  });
});
