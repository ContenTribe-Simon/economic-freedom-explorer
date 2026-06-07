/**
 * localStorage persistence & rehydration smoke tests (Playwright).
 *
 * Verifies that user-created / user-modified state survives a REAL browser reload via the
 * Zustand `persist` middleware (key "finance-tool.v1"), and that legacy / corrupted / partial
 * persisted data rehydrates without blank-screening the app.
 *
 * Runs against the local Vite dev server (see playwright.config.ts), NOT the Lovable preview.
 * Robust text/role selectors only; no pixel/layout assertions.
 */
import { test, expect, type Page } from "@playwright/test";

const KEY = "finance-tool.v1"; // Zustand persist storage key (financeStore.ts)

let pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
});
test.afterEach(() => {
  expect(pageErrors, `uncaught runtime errors: ${pageErrors.join(" | ")}`).toEqual([]);
});

/** Read + parse the persisted blob ({ state, version }). Returns null if absent/unparseable. */
async function readPersisted(page: Page): Promise<{ state?: any; version?: number } | null> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Overwrite the persisted blob with a raw string, then reload so the store rehydrates from it. */
async function seedAndReload(page: Page, raw: string): Promise<void> {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, raw] as const);
  await page.reload();
}

async function expectNotBlank(page: Page): Promise<void> {
  await expect(page.locator("body")).toBeVisible();
  const text = (await page.locator("body").innerText()).trim();
  expect(text.length, "page should not be blank").toBeGreaterThan(40);
}

/**
 * PATH-scoped allowlist of fields where `null` is an INTENTIONAL valid domain value
 * (verified against src/lib/finance/types.ts — only these `… | null` fields live inside a
 * persisted scenario's `inputs`):
 *   - CashflowAllocationInputs.bufferTarget : number | null
 *   - CapitalWithdrawalInputs.startAge      : number | null
 *   - DepotTaxInputs.costBasis              : number | null
 *   - LifeEvent.confidenceKey               : ConfidenceKey | null
 *
 * Matching by PATH (not field name) is deliberate: e.g. `lifeEvents[N].startAge` is a
 * REQUIRED number, so a null there must be rejected even though `capitalWithdrawal.startAge`
 * legitimately allows null (Codex finding — name-only allowlisting was too broad).
 */
const ALLOWED_NULL_PATHS: RegExp[] = [
  /\.inputs\.cashflowAllocation\.bufferTarget$/,
  /\.inputs\.capitalWithdrawal\.startAge$/,
  /\.inputs\.free\.depotTax\.costBasis$/,
  /\.inputs\.lifeEvents\[\d+\]\.confidenceKey$/,
];

/**
 * Recursively collect paths holding an invalid value in a critical field:
 *   - a number that is NaN / Infinity / -Infinity
 *   - `undefined`
 *   - `null` at a PATH not explicitly permitted by ALLOWED_NULL_PATHS
 * `null` is handled BEFORE the object branch — the original `v && typeof v === "object"`
 * guard skipped null entirely, so a null in a numeric field went undetected (Codex finding).
 */
function findBadNumericValues(v: unknown, path = "root", acc: string[] = []): string[] {
  if (v === null) {
    if (!ALLOWED_NULL_PATHS.some((re) => re.test(path))) acc.push(`${path}=null (unexpected)`);
    return acc;
  }
  if (v === undefined) {
    acc.push(`${path}=undefined`);
    return acc;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) acc.push(`${path}=${v}`);
    return acc;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => findBadNumericValues(x, `${path}[${i}]`, acc));
    return acc;
  }
  if (typeof v === "object") {
    for (const [k, val] of Object.entries(v)) findBadNumericValues(val, `${path}.${k}`, acc);
  }
  return acc;
}

// A representative pre-v16 legacy persisted blob (singular `debt`, no `type`, no
// `contributionStopRule`, old-shape life event, `pensionPayoutRate`, no snapshots/country*).
function legacyBlob(): string {
  return JSON.stringify({
    version: 6,
    state: {
      activeScenarioId: "legacy-1",
      scenarios: [
        {
          id: "legacy-1",
          name: "Legacy persisted",
          createdAt: 1_700_000_000_000,
          inputs: {
            person: { currentAge: 42, lifeExpectancy: 90 },
            free: { balance: 300_000, monthlyContribution: 6_000, annualExtraContribution: 0, cashBuffer: 50_000, bufferUsableForShortfall: false },
            pension: { balance: 500_000, monthlyContribution: 3_000, employerContribution: 4_000, payoutFromAge: 64, ratePensionEnabled: true, ratePensionPayoutYears: 15, ratePensionEffectiveTaxRate: 0.4 },
            holding: { balance: 0, expectedExitValue: 0, exitYear: 2035, annualDistribution: 0, distributionFromAge: 55, startDistributionAtStopAge: true, withdrawalStrategy: "planned_only", pensionAvailableFromAge: 60 },
            debt: { balance: 800_000, interestRate: 0.04, monthlyPayment: 5_000 }, // legacy singular debt
            income: { salaryGross: 600_000, familyFundAnnualNet: 0, familyFundUntilAge: 70 },
            spending: { desiredMonthlyNet: 25_000 },
            target: { minNetWorthAtEnd: 0 },
            stopAge: 60,
            fullRetireAge: 62,
            savingsLogic: "planned",
            lifeEvents: [{ name: "Gammelt event", amount: 1_000, startAge: 45 }],
          },
        },
      ],
      assumptions: {
        realReturn: { free: 0.05, pension: 0.05, holding: 0.04 },
        inflation: 0.02,
        tax: { amBidrag: 0.08, laborBottomRate: 0.37, laborTopRate: 0.52, laborTopBracket: 611800, personalAllowance: 51600, shareLowRate: 0.27, shareHighRate: 0.42, shareThreshold: 79400, corporateRate: 0.22, pensionPayoutRate: 0.4 },
        statePensionAnnualNet: 90000,
        withdrawOrder: ["free", "holding", "pension"],
      },
    },
  });
}

test.describe("localStorage persistence & rehydration", () => {
  // Pure-function regression for the null-detection helper (no browser needed). Proves the
  // allowlist is PATH-scoped: a null in a required numeric field is detected, while nulls in
  // genuinely nullable fields are allowed.
  test("findBadNumericValues rejects null at required numeric paths but allows model-permitted nulls", () => {
    // Required number (lifeEvents[].startAge) = null ⇒ MUST be flagged.
    const badLifeEventStartAge = {
      scenarios: [{ inputs: { lifeEvents: [{ name: "X", amount: 1, startAge: null, frequency: "monthly", effectTarget: "privateSpending" }] } }],
    };
    const flagged = findBadNumericValues(badLifeEventStartAge);
    expect(flagged.some((p) => p.includes("lifeEvents[0].startAge"))).toBe(true);

    // Same field NAME but a genuinely nullable path (capitalWithdrawal.startAge) ⇒ NOT flagged.
    const okCapitalWithdrawalStartAge = {
      scenarios: [{ inputs: { capitalWithdrawal: { strategy: "depotFirst", plannedWithdrawalPolicy: "none", plannedWithdrawalAmount: 0, startAge: null, startAtStopAge: true } } }],
    };
    expect(findBadNumericValues(okCapitalWithdrawalStartAge)).toEqual([]);

    // Mixed: allowed nulls (bufferTarget, depotTax.costBasis, lifeEvents[].confidenceKey) pass;
    // a stray null in a required numeric field (free.balance) is flagged.
    const mixed = {
      scenarios: [{ inputs: {
        cashflowAllocation: { surplusPolicy: "outOfModel", bufferTarget: null, plannedInvestmentMethod: "planned" },
        free: { balance: null, depotTax: { enabled: true, method: "realizationSimple", costBasis: null } },
        lifeEvents: [{ name: "Y", amount: 2, startAge: 40, frequency: "annual", effectTarget: "privateIncome", confidenceKey: null }],
      } }],
    };
    const mixedFlagged = findBadNumericValues(mixed);
    expect(mixedFlagged.some((p) => p.includes("free.balance"))).toBe(true);          // unexpected null ⇒ flagged
    expect(mixedFlagged.some((p) => p.includes("bufferTarget"))).toBe(false);         // allowed
    expect(mixedFlagged.some((p) => p.includes("depotTax.costBasis"))).toBe(false);   // allowed
    expect(mixedFlagged.some((p) => p.includes("confidenceKey"))).toBe(false);        // allowed

    // NaN / Infinity are always flagged.
    expect(findBadNumericValues({ a: NaN }).length).toBe(1);
    expect(findBadNumericValues({ a: Infinity }).length).toBe(1);
  });

  test("scenario changes are persisted to localStorage", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ Nyt" }).click(); // adds "Scenarie 2" and makes it active

    // The new scenario + active-id are written to localStorage by the persist middleware.
    await expect.poll(async () => (await readPersisted(page))?.state?.scenarios?.length ?? 0).toBe(2);
    const persisted = await readPersisted(page);
    const names = persisted!.state.scenarios.map((s: any) => s.name);
    expect(names).toContain("Scenarie 2");
    const active = persisted!.state.scenarios.find((s: any) => s.id === persisted!.state.activeScenarioId);
    expect(active?.name).toBe("Scenarie 2");
  });

  test("reload restores the active scenario", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ Nyt" }).click();
    await expect.poll(async () => (await readPersisted(page))?.state?.scenarios?.length ?? 0).toBe(2);

    await page.reload();

    // After reload the active scenario is still "Scenarie 2" — its name shows in the Inputs header.
    await page.goto("/inputs");
    await expect(page.locator("header input")).toHaveValue("Scenarie 2");
  });

  test("key inputs survive reload", async ({ page }) => {
    await page.goto("/inputs");
    // Edit a text input (scenario name) and a numeric input (current age).
    const nameInput = page.locator("header input");
    await nameInput.fill("Reload Test Scenario");
    const ageInput = page.locator("div.space-y-1\\.5").filter({ hasText: "Nuværende alder" }).getByRole("textbox");
    await ageInput.click();
    await ageInput.fill("47");
    await ageInput.blur();

    // Persisted before reload.
    await expect.poll(async () => (await readPersisted(page))?.state?.scenarios?.[0]?.inputs?.person?.currentAge).toBe(47);

    await page.reload();

    await expect(page.locator("header input")).toHaveValue("Reload Test Scenario");
    await expect(page.locator("div.space-y-1\\.5").filter({ hasText: "Nuværende alder" }).getByRole("textbox")).toHaveValue("47");
  });

  test("snapshots survive reload", async ({ page }) => {
    await page.goto("/report");
    await page.getByRole("button", { name: "Gem snapshot" }).click();

    // Snapshot is persisted with the data needed to reproduce/display it.
    await expect.poll(async () => (await readPersisted(page))?.state?.snapshots?.length ?? 0).toBe(1);

    await page.reload();

    const persisted = await readPersisted(page);
    expect(persisted!.state.snapshots.length).toBe(1);
    const snap = persisted!.state.snapshots[0];
    expect(snap.resolvedInputs).toBeTruthy();
    expect(Array.isArray(snap.years) && snap.years.length > 0).toBe(true);
    expect(snap.kpis).toBeTruthy();

    // And the Snapshots page reflects it after reload.
    await page.goto("/snapshots");
    await expect(page.getByText(/Historik \(1\)/)).toBeVisible();
  });

  test("legacy persisted data rehydrates without crash and migrates", async ({ page }) => {
    await page.goto("/");
    await seedAndReload(page, legacyBlob());

    // App shell still renders (no blank screen) and the legacy scenario survived migration.
    await expect(page.getByText("Frihedsmodel")).toBeVisible();
    await page.goto("/inputs");
    await expect(page.locator("header input")).toHaveValue("Legacy persisted");

    // Migration upgraded the persisted blob (singular debt → debts[], snapshots[]/countryProfiles added).
    const persisted = await readPersisted(page);
    expect(Array.isArray(persisted!.state.scenarios[0].inputs.debts)).toBe(true);
    expect(Array.isArray(persisted!.state.snapshots)).toBe(true);
    // Migration introduced no NaN/Infinity/undefined and no unexpected null in critical fields.
    const badAfterMigrate = findBadNumericValues({ scenarios: persisted!.state.scenarios, assumptions: persisted!.state.assumptions });
    expect(badAfterMigrate, `invalid numeric values after migration: ${badAfterMigrate.join(", ")}`).toEqual([]);

    // Projection renders finite numbers (no NaN/Infinity/undefined leaking into the table).
    await page.goto("/projection");
    await expect(page.getByRole("columnheader", { name: "Nettoformue" })).toBeVisible();
    const tableText = await page.locator("table").innerText();
    expect(tableText).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("corrupted localStorage does not blank-screen the app", async ({ page }) => {
    await page.goto("/");
    await seedAndReload(page, "{ this is : not valid JSON ]]"); // garbage

    // The app falls back gracefully and still renders the shell.
    await expect(page.getByText("Frihedsmodel")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expectNotBlank(page);
  });

  test("partial localStorage (missing optional top-level fields) rehydrates and renders", async ({ page }) => {
    // Make a real edit so the store writes a complete, current-version blob to localStorage
    // (persist writes on state change, not on a plain page load).
    await page.goto("/inputs");
    await page.locator("header input").fill("Partial Test Base");
    await expect.poll(async () => (await readPersisted(page))?.state?.scenarios?.length ?? 0).toBeGreaterThan(0);
    // Take the REAL current-version blob and drop the optional top-level fields a partial
    // save might lack (snapshots / countryProfiles / countryAnalysisSettings). The scenario
    // itself stays a complete, current-shape object (the realistic "partial" case).
    const full = await readPersisted(page);
    const partial = JSON.stringify({
      version: full!.version ?? 16,
      state: {
        activeScenarioId: full!.state.activeScenarioId,
        scenarios: full!.state.scenarios,
        assumptions: full!.state.assumptions,
        // intentionally omit snapshots / countryProfiles / countryAnalysisSettings
      },
    });
    await seedAndReload(page, partial);

    await expect(page.getByText("Frihedsmodel")).toBeVisible();
    await page.goto("/projection");
    await expect(page.getByRole("columnheader", { name: "Alder" })).toBeVisible();
    await expectNotBlank(page);
  });

  test("no NaN/Infinity/null critical numeric values after rehydration", async ({ page }) => {
    // Make a real edit so a complete blob is persisted (persist writes on change, not load).
    await page.goto("/inputs");
    await page.locator("header input").fill("NaN Check Base");
    await expect.poll(async () => (await readPersisted(page))?.state?.scenarios?.length ?? 0).toBeGreaterThan(0);
    await page.reload(); // rehydrate from the persisted state
    await expect(page.getByText("Frihedsmodel")).toBeVisible();

    const persisted = await readPersisted(page);
    expect(persisted).not.toBeNull();
    // The persisted scenarios + assumptions contain no NaN/Infinity/undefined and no
    // unexpected null in a critical (numeric) field.
    const bad = findBadNumericValues({ scenarios: persisted!.state.scenarios, assumptions: persisted!.state.assumptions });
    expect(bad, `invalid numeric values in persisted state: ${bad.join(", ")}`).toEqual([]);
    // A key input is a real finite number.
    expect(Number.isFinite(persisted!.state.scenarios[0].inputs.free.balance)).toBe(true);

    // Projection table shows no invalid tokens after rehydration.
    await page.goto("/projection");
    const tableText = await page.locator("table").innerText();
    expect(tableText).not.toMatch(/NaN|Infinity|undefined/);
  });
});
