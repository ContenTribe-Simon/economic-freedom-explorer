/**
 * Playwright user-flow tests — a small, robust set of the most important end-to-end product
 * flows (create / duplicate scenario, input → output, snapshot, export/import JSON).
 *
 * Runs against the local Vite dev server (see playwright.config.ts), NOT the Lovable preview.
 * Robust text/role selectors; no pixel/layout assertions; no overfitting to exact decimals.
 * Every test fails on any uncaught browser pageerror.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

let pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
});
test.afterEach(() => {
  expect(pageErrors, `uncaught runtime errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

async function expectNotBlank(page: Page): Promise<void> {
  await expect(page.locator("body")).toBeVisible();
  const text = (await page.locator("body").innerText()).trim();
  expect(text.length, "page should not be blank").toBeGreaterThan(40);
}

/** The active-scenario selector lives in the sidebar (<aside>); scope to it to stay unique. */
function scenarioSelect(page: Page) {
  return page.locator("aside").getByRole("combobox");
}

/**
 * A NumField on /inputs: locate by its <label> TEXT, then the input in the sibling field row.
 * Uses the label element + DOM structure (not a Tailwind/layout class) so it isn't coupled to
 * styling. NumField renders: <label>…</label> followed by a sibling <div> wrapping the input.
 */
function numField(page: Page, label: string) {
  return page.locator(`xpath=//label[normalize-space(.)=${JSON.stringify(label)}]/following-sibling::div//input`);
}

test.describe("User flows", () => {
  test("1. create a new scenario — it becomes active and appears in the selector", async ({ page }) => {
    await page.goto("/");
    await scenarioSelect(page).waitFor();

    await page.getByRole("button", { name: "+ Nyt" }).click();

    // New scenario "Scenarie 2" is active (shown in the selector) and projects without crash.
    await expect(scenarioSelect(page)).toContainText("Scenarie 2");
    await page.goto("/inputs");
    await expect(page.locator("header input")).toHaveValue("Scenarie 2");

    // It is also present in the selector dropdown list.
    await page.goto("/");
    await scenarioSelect(page).click();
    await expect(page.getByRole("option", { name: /Scenarie 2/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expectNotBlank(page);
  });

  test("2. duplicate a scenario — duplicate becomes active and preserves edited values", async ({ page }) => {
    await page.goto("/inputs");
    // Give the source scenario a recognizable name + a distinctive edited value.
    await page.locator("header input").fill("Edit Me 123");
    const age = numField(page, "Nuværende alder");
    await age.click();
    await age.fill("47");
    await age.blur();

    // Duplicate via the sidebar.
    await page.getByRole("button", { name: "Dupliker" }).click();

    // The duplicate is active and carries over the edited name + value.
    await expect(page.locator("header input")).toHaveValue("Edit Me 123 (kopi)");
    await expect(numField(page, "Nuværende alder")).toHaveValue("47");
    await expect(scenarioSelect(page)).toContainText("Edit Me 123 (kopi)");
    await expectNotBlank(page);
  });

  test("3. changing an input updates the projection output", async ({ page }) => {
    // Baseline projection output.
    await page.goto("/projection");
    await expect(page.getByRole("columnheader", { name: "Nettoformue" })).toBeVisible();
    const before = await page.locator("table").innerText();

    // Change a meaningful input (desired monthly spending) substantially. Lowering spending
    // reduces the cashflow gap and shifts net worth across the projection.
    await page.goto("/inputs");
    const spending = numField(page, "Ønsket forbrug (netto)");
    await spending.click();
    await spending.fill("15000");
    await spending.blur();

    // Output changed, still renders, and contains no invalid numeric tokens.
    await page.goto("/projection");
    await expect(page.getByRole("columnheader", { name: "Nettoformue" })).toBeVisible();
    const after = await page.locator("table").innerText();
    expect(after).not.toBe(before);
    expect(after).not.toMatch(/NaN|Infinity|undefined/);
    await expectNotBlank(page);
  });

  test("4. create a snapshot — it appears in history and survives reload", async ({ page }) => {
    await page.goto("/inputs");
    await page.locator("header input").fill("Snapshot Source");

    await page.goto("/report");
    await page.getByRole("button", { name: "Gem snapshot" }).click();

    await page.goto("/snapshots");
    await expect(page.getByText(/Historik \(1\)/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Historik \(1\)/)).toBeVisible();
    await expectNotBlank(page);
  });

  test("5. export JSON — downloads a parseable model payload with core data", async ({ page }) => {
    await page.goto("/");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Eksporter JSON/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/finance-snapshot-.*\.json$/);
    const path = await download.path();
    const raw = readFileSync(path, "utf8");
    // No invalid numeric tokens in the exported file.
    expect(raw).not.toMatch(/NaN|Infinity/);

    const parsed = JSON.parse(raw);
    // Core top-level data needed to restore the model.
    expect(Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0).toBe(true);
    expect(parsed.assumptions).toBeTruthy();
    expect(parsed).toHaveProperty("activeScenarioId");
    expect(parsed).toHaveProperty("snapshots"); // present (possibly empty) for round-trip
  });

  test("6. import JSON — REPLACES current data (local-only data is gone, imported is active)", async ({ page }) => {
    await page.goto("/");
    // Grab a valid, full-shape scenario template by exporting the default model.
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: /Eksporter JSON/ }).click();
    const template = JSON.parse(readFileSync(await (await dl).path(), "utf8"));
    const baseScenario = template.scenarios[0];

    // Seed LOCAL-ONLY data that import must wipe: an extra scenario AND a snapshot.
    await page.getByRole("button", { name: "+ Nyt" }).click(); // "Scenarie 2"
    await expect(scenarioSelect(page)).toContainText("Scenarie 2");
    await page.goto("/report");
    await page.getByRole("button", { name: "Gem snapshot" }).click();
    await page.goto("/snapshots");
    await expect(page.getByText(/Historik \(/)).toBeVisible(); // a snapshot exists locally now
    await page.goto("/");

    // Build a DISJOINT payload: a single, differently-identified scenario and NO snapshots.
    const importedId = "imported-only-1";
    const payload = JSON.stringify({
      modelVersion: template.modelVersion ?? 16,
      activeScenarioId: importedId,
      scenarios: [{ ...baseScenario, id: importedId, name: "Imported Only", type: "custom" }],
      assumptions: template.assumptions,
      snapshots: [],
    });

    await page.locator('input[type="file"]').setInputFiles({ name: "model.json", mimeType: "application/json", buffer: Buffer.from(payload) });
    await expect(page.getByText("Importer model?")).toBeVisible();
    await page.getByRole("button", { name: "Erstat data" }).click();

    // Imported scenario is active...
    await expect(scenarioSelect(page)).toContainText("Imported Only");
    await page.goto("/inputs");
    await expect(page.locator("header input")).toHaveValue("Imported Only"); // activeScenarioId → imported

    // ...the old LOCAL-ONLY scenario is gone (full replace, not merge)...
    await page.goto("/");
    await scenarioSelect(page).click();
    await expect(page.getByRole("option", { name: "Imported Only" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Scenarie 2" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // ...the local-only snapshot is gone...
    await page.goto("/snapshots");
    await expect(page.getByText(/Ingen snapshots gemt endnu/i)).toBeVisible();

    // ...and the imported model still renders.
    await page.goto("/projection");
    await expect(page.getByRole("columnheader", { name: "Nettoformue" })).toBeVisible();
    expect(await page.locator("table").innerText()).not.toMatch(/NaN|Infinity|undefined/);
    await expectNotBlank(page);
  });

  test("7. importing invalid JSON shows an error and does not blank-screen", async ({ page }) => {
    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{ this is not valid json ]") });
    await expect(page.getByText("Importer model?")).toBeVisible();
    await page.getByRole("button", { name: "Erstat data" }).click();

    // A stable, copy-insensitive error surface appears: a sonner toast (scoped via its data
    // attribute so we don't accidentally match the dashboard's "Modelstatus: ugyldigt"), whose
    // text references the invalid JSON. We assert the pattern, not the exact sentence/punctuation.
    const toast = page.locator("[data-sonner-toast]");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/JSON|gyldig/i);

    // The app shell stays alive — no blank screen, no uncaught error (asserted in afterEach).
    await expect(page.getByText("Frihedsmodel")).toBeVisible();
    await expect(scenarioSelect(page)).toBeVisible();
    await expectNotBlank(page);
  });
});
