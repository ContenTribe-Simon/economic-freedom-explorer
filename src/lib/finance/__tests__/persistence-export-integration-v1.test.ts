/**
 * Persistence & export integration v1 — exercises the data layer AROUND the projection
 * engine: legacy migration, JSON export/import roundtrip, snapshot & cloud payload
 * preservation, projection CSV / year-audit / debug export fields, validation/report
 * consistency, and absence of hidden invalid values.
 *
 * These are integration tests over the real store + pure persistence functions — NOT
 * Playwright/browser tests, and no brittle UI selectors. Assertions prefer durable
 * roundtrip-equivalence and invariants over incidental decimals.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useFinanceStore } from "@/store/financeStore";
import { defaultAssumptions, defaultInputs, makeBaseScenario } from "@/lib/finance/defaults";
import { project } from "@/lib/finance/projection";
import { buildSnapshot } from "@/lib/finance/snapshots";
import { serializeStoreState, applyStateToStore } from "@/lib/cloud/models";
import { runModelValidation } from "@/lib/finance/modelValidation";
import { runIntegrityChecks } from "@/lib/finance/integrity";
import { deriveKPIs } from "@/lib/finance/kpis";
import { resolveCapitalWithdrawal } from "@/lib/finance/capitalWithdrawal";
import { classifyLegacyScenario } from "@/lib/finance/stress";
import { normalizeLegacyLifeEvent } from "@/lib/finance/lifeEvents";
import { buildProjectionExport, buildProjectionCsv, buildYearAuditJson, PROJECTION_CSV_COLUMNS } from "@/lib/finance/exportProjection";
import { makeLifeEvent } from "@/lib/finance/lifeEvents";
import type { Scenario, YearRow } from "@/lib/finance/types";

const A = defaultAssumptions;
const PERSIST_KEY = "finance-tool.v1";

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.removeItem(PERSIST_KEY);
  const fresh: Scenario = { ...makeBaseScenario(), type: "base", updatedAt: Date.now() };
  useFinanceStore.setState({ scenarios: [fresh], activeScenarioId: fresh.id, assumptions: defaultAssumptions, snapshots: [] });
});

/** A scenario exercising every persisted feature (cashflowAllocation, capitalWithdrawal, ASK, depotTax, holding, life events, debt). */
function richScenario(): Scenario {
  const s = makeBaseScenario();
  s.type = "custom";
  s.inputs.cashflowAllocation = { surplusPolicy: "bufferThenInvest", bufferTarget: 200_000, plannedInvestmentMethod: "planned", plannedShortfallPolicy: "useBuffer" };
  s.inputs.capitalWithdrawal = { strategy: "holdingFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 40_000, startAge: null, startAtStopAge: true };
  s.inputs.free.ask = { enabled: true, currentValue: 80_000, priorYearEndValue: 80_000, depositLimit: 174_200, taxRate: 0.17, autoFillFirst: true, taxCreditCarryForward: 0, taxPaymentMode: "deductFromASK", withdrawalStrategy: "askFirst" };
  s.inputs.free.depotTax = { enabled: true, method: "realizationSimple", costBasis: 150_000, showDeferredTax: true };
  s.inputs.lifeEvents = [makeLifeEvent({ name: "Børn", effectTarget: "privateSpending", effectDirection: "increase", frequency: "monthly", amount: 5_000, startAge: 42, endAge: 50 })];
  return s;
}

/** Recursively assert every number inside a value is finite (no NaN/Infinity). */
function assertAllFinite(v: unknown, path = "root"): void {
  if (typeof v === "number") {
    expect(Number.isFinite(v), `finite at ${path} (got ${v})`).toBe(true);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => assertAllFinite(x, `${path}[${i}]`));
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) assertAllFinite(val, `${path}.${k}`);
  }
}

/** Buckets must never be negative across a projection (debt / net worth may be). */
function assertNoNegativeBuckets(years: YearRow[]): void {
  for (const y of years) {
    for (const [k, val] of [["free", y.closing.free], ["buffer", y.closing.buffer], ["pension", y.closing.pension], ["holding", y.closing.holding]] as const) {
      expect(val, `${k} >= 0 @${y.age}`).toBeGreaterThanOrEqual(-0.5);
    }
  }
}

/**
 * Paired walk over a LIVE object and its JSON-roundtripped copy. For every numeric leaf in
 * the live object this asserts:
 *   (a) the live value is finite — catches NaN/Infinity AT THE SOURCE (before stringify), and
 *   (b) the parsed value is still the same finite number — JSON.stringify turns NaN/Infinity
 *       into `null`, so a number silently becoming `null` after parse is rejected here.
 * (assertAllFinite() alone misses this because `typeof null === "object"`, so a corrupted
 *  field would be skipped rather than failed.)
 */
function assertFiniteNumbersSurvive(live: unknown, parsed: unknown, path = "root"): void {
  if (typeof live === "number") {
    expect(Number.isFinite(live), `live value finite at ${path} (got ${live})`).toBe(true);
    expect(parsed, `numeric field became null after serialization at ${path}`).not.toBeNull();
    expect(typeof parsed, `numeric field still a number at ${path}`).toBe("number");
    expect(parsed, `numeric field unchanged by roundtrip at ${path}`).toBe(live);
  } else if (Array.isArray(live)) {
    live.forEach((x, i) => assertFiniteNumbersSurvive(x, (parsed as Record<number, unknown> | undefined)?.[i], `${path}[${i}]`));
  } else if (live && typeof live === "object") {
    for (const [k, val] of Object.entries(live)) assertFiniteNumbersSurvive(val, (parsed as Record<string, unknown> | undefined)?.[k], `${path}.${k}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Legacy scenario migration
// ─────────────────────────────────────────────────────────────────────────────
describe("1. Legacy scenario migration", () => {
  it("project() tolerates a scenario missing all newer fields (engine-level tolerance, not the store migration path)", () => {
    const s = makeBaseScenario();
    // Strip every post-v0 optional field a legacy model would not have.
    delete (s.inputs as unknown as Record<string, unknown>).cashflowAllocation;
    delete (s.inputs as unknown as Record<string, unknown>).capitalWithdrawal;
    delete (s.inputs.free as unknown as Record<string, unknown>).ask;
    delete (s.inputs.free as unknown as Record<string, unknown>).depotTax;
    delete (s.inputs as unknown as Record<string, unknown>).lifeEvents;
    delete (s as unknown as Record<string, unknown>).type;

    const years = project(s, A);
    expect(years.length).toBeGreaterThan(0);
    assertAllFinite(years.map((y) => ({ nw: y.netWorth, short: y.shortfallAmount, ...y.closing })));
    assertNoNegativeBuckets(years);
    expect(runIntegrityChecks(s, years)).toEqual([]);
    expect(runModelValidation(s, years).failed).toBe(0);
  });

  it("missing cashflowAllocation falls back to legacy savingsLogic mapping (planned vs cashflow)", () => {
    // No cashflowAllocation set ⇒ projection derives the method from savingsLogic.
    const mk = (logic: "planned" | "cashflow") => {
      const s = makeBaseScenario();
      s.inputs.debts = [];
      s.inputs.holding.balance = 0; s.inputs.holding.expectedExitValue = 0;
      s.inputs.spending.desiredMonthlyNet = 10_000; // ample positive cashflow
      s.inputs.free.monthlyContribution = 5_000; s.inputs.free.annualExtraContribution = 0; // planned = 60.000
      s.inputs.savingsLogic = logic;
      delete (s.inputs as unknown as Record<string, unknown>).cashflowAllocation;
      return s;
    };
    const planned = project(mk("planned"), A)[0];
    const cashflow = project(mk("cashflow"), A)[0];
    const cf = cashflow.flows.cashflowBridge!.cashflowBeforeSavings;
    // Legacy "planned" invests the planned amount; legacy "cashflow" invests the whole cashflow.
    expect(planned.flows.investedAmount).toBeCloseTo(planned.flows.plannedFreeContribution, 0);
    expect(cashflow.flows.investedAmount).toBeCloseTo(cf, 0);
    expect(cashflow.flows.investedAmount).toBeGreaterThan(planned.flows.investedAmount);
  });

  it("resolveCapitalWithdrawal migrates legacy inputs to a valid strategy/policy (no undefined/NaN)", () => {
    const legacy = structuredClone(defaultInputs);
    const cw = resolveCapitalWithdrawal(legacy);
    expect(cw.strategy).toBeDefined();
    expect(["none", "fixedAnnual", "fillLowShareIncomeBracket"]).toContain(cw.plannedWithdrawalPolicy);
    expect(Number.isFinite(cw.plannedWithdrawalAmount)).toBe(true);
  });

  it("importJson migrates a legacy payload (no type, old life events) and projects it", () => {
    // Hand-built legacy export: scenarios without `type`, a life event missing newer fields.
    const legacyInputs = structuredClone(defaultInputs);
    const legacyPayload = {
      modelVersion: 1,
      activeScenarioId: "legacy-1",
      scenarios: [
        {
          id: "legacy-1",
          name: "Legacy model",
          createdAt: 1700000000000,
          inputs: { ...legacyInputs, lifeEvents: [{ name: "Gammelt event", amount: 1000, startAge: 45 }] },
          // NOTE: no `type` field ⇒ must be classified on import.
        },
      ],
      assumptions: defaultAssumptions,
    };
    useFinanceStore.getState().importJson(JSON.stringify(legacyPayload));
    const st = useFinanceStore.getState();
    const sc = st.scenarios.find((x) => x.id === "legacy-1")!;
    expect(sc).toBeDefined();
    expect(sc.type).toBeDefined(); // classified
    // Life event normalized into a full LifeEvent shape.
    const ev = sc.inputs.lifeEvents![0];
    expect(ev.id).toBeTruthy();
    expect(typeof ev.enabled).toBe("boolean");
    expect(ev.effectTarget).toBeTruthy();
    // Projects cleanly.
    const years = project(sc, st.assumptions);
    expect(years.length).toBeGreaterThan(0);
    assertAllFinite(years.map((y) => y.netWorth));
    expect(runIntegrityChecks(sc, years)).toEqual([]);
  });

  it("classifyLegacyScenario returns a concrete type for a typeless scenario", () => {
    const s = makeBaseScenario();
    delete (s as unknown as Record<string, unknown>).type;
    const cls = classifyLegacyScenario(s, undefined);
    expect(["base", "custom", "linked_stress_test"]).toContain(cls.type);
    expect(typeof cls.manuallyEdited).toBe("boolean");
  });

  it("normalizeLegacyLifeEvent fills a minimal raw event with safe defaults", () => {
    const ev = normalizeLegacyLifeEvent({ name: "X", amount: 500, startAge: 50 });
    expect(ev.id).toBeTruthy();
    expect(ev.enabled === true || ev.enabled === false).toBe(true);
    expect(Number.isFinite(ev.amount)).toBe(true);
    expect(ev.frequency).toBeTruthy();
    expect(ev.effectTarget).toBeTruthy();
  });

  /**
   * Build a pre-v16 persisted INNER state with legacy field shapes the store's migrate()
   * must upgrade:
   *   - singular `inputs.debt` instead of `inputs.debts[]`
   *   - `free` without `contributionStopRule`
   *   - an old-shape life event (pre-normalization)
   *   - scenario without `type`, no `confidence`
   *   - NO snapshots / countryProfiles / countryAnalysisSettings (must be added by migrate)
   *   - assumptions.tax.pensionPayoutRate (removed in v7)
   */
  function legacyPersistedState(): Record<string, unknown> {
    const legacyInputs: Record<string, unknown> = structuredClone(defaultInputs) as unknown as Record<string, unknown>;
    delete legacyInputs.debts;
    (legacyInputs as { debt?: unknown }).debt = { balance: 1_200_000, interestRate: 0.04, monthlyPayment: 8_000 };
    legacyInputs.free = { balance: 400_000, monthlyContribution: 8_000, annualExtraContribution: 0, cashBuffer: 100_000, bufferUsableForShortfall: false };
    legacyInputs.lifeEvents = [{ name: "Gammelt event", amount: 1_000, startAge: 45 }];
    delete (legacyInputs as { confidence?: unknown }).confidence;

    const legacyAssumptions = structuredClone(defaultAssumptions) as unknown as { tax: Record<string, unknown> };
    legacyAssumptions.tax = { ...legacyAssumptions.tax, pensionPayoutRate: 0.4 };

    return {
      scenarios: [{ id: "legacy-persist-1", name: "Legacy persisted", createdAt: 1_700_000_000_000, inputs: legacyInputs }], // no `type`
      activeScenarioId: "legacy-persist-1",
      assumptions: legacyAssumptions,
      // intentionally NO snapshots / countryProfiles / countryAnalysisSettings
    };
  }

  it("store migrate() ADDS the missing modern top-level fields (asserted on raw migrated state, before any merge)", () => {
    // Call the store's actual migrate() directly via the persist API, on a legacy state that is
    // MISSING snapshots/countryProfiles/countryAnalysisSettings. Asserting on the raw migrate()
    // output (not the rehydrated store) guarantees the fields come from migration — they cannot
    // be inherited from the in-memory store defaults via Zustand's shallow merge.
    const migrate = useFinanceStore.persist.getOptions().migrate;
    expect(migrate, "store exposes a migrate() function").toBeTypeOf("function");

    const legacy = legacyPersistedState();
    // Sanity: the input genuinely lacks these fields, so a pass proves migrate() created them.
    expect("snapshots" in legacy).toBe(false);
    expect("countryProfiles" in legacy).toBe(false);
    expect("countryAnalysisSettings" in legacy).toBe(false);

    const migrated = migrate!(structuredClone(legacy), 6) as Record<string, any>;

    // Top-level fields ADDED by migration (these are the ones a merge could otherwise mask).
    expect(Array.isArray(migrated.snapshots), "v13 snapshots[] added").toBe(true);
    expect(Array.isArray(migrated.countryProfiles) && migrated.countryProfiles.length > 0, "v15 countryProfiles added").toBe(true);
    expect(migrated.countryAnalysisSettings, "v16 countryAnalysisSettings added").toBeDefined();
    expect("pensionPayoutRate" in migrated.assumptions.tax, "v7 strips pensionPayoutRate").toBe(false);

    // Scenario-level upgrades, also straight from migrate().
    const msc = migrated.scenarios[0];
    expect(msc.type, "v11 classify").toBeDefined();
    expect(Array.isArray(msc.inputs.debts), "singular debt → debts[]").toBe(true);
    expect(msc.inputs.debts[0].balance).toBe(1_200_000);
    expect(msc.inputs.free.contributionStopRule, "v12 stop rule").toBe("stopAge");
    expect(msc.inputs.confidence, "v9 confidence").toBeDefined();
    expect(Array.isArray(msc.inputs.lifeEvents)).toBe(true);
    expect(msc.inputs.lifeEvents[0].id).toBeTruthy();
    expect(typeof msc.inputs.lifeEvents[0].enabled).toBe("boolean");
    expect(msc.inputs.lifeEvents[0].effectTarget).toBeTruthy();
  });

  it("REAL rehydrate path: a legacy persisted payload migrates end-to-end and projects cleanly", async () => {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ state: legacyPersistedState(), version: 6 }));

    // Drive the ACTUAL Zustand persist migration + rehydration (not project() tolerance).
    await useFinanceStore.persist.rehydrate();

    const st = useFinanceStore.getState();
    const sc = st.scenarios.find((x) => x.id === "legacy-persist-1");
    expect(sc, "legacy scenario survived rehydrate").toBeDefined();
    // Scenario array is replaced wholesale by the migrated persisted state (not merged per-item),
    // so these scenario-level upgrades genuinely come from the migration.
    expect(sc!.type).toBeDefined();
    expect(Array.isArray(sc!.inputs.debts)).toBe(true);
    expect(sc!.inputs.debts[0].balance).toBe(1_200_000);
    expect(sc!.inputs.free.contributionStopRule).toBe("stopAge");
    expect(sc!.inputs.confidence).toBeDefined();
    expect(sc!.inputs.lifeEvents![0].id).toBeTruthy();

    // The migrated scenario projects cleanly — no crash, no NaN/Infinity, no negative buckets.
    const years = project(sc!, st.assumptions);
    expect(years.length).toBeGreaterThan(0);
    assertAllFinite(years);
    assertNoNegativeBuckets(years);
    expect(runIntegrityChecks(sc!, years)).toEqual([]);
    expect(runModelValidation(sc!, years).failed).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. JSON export/import roundtrip
// ─────────────────────────────────────────────────────────────────────────────
describe("2. JSON export/import roundtrip", () => {
  it("store export → import reproduces the projection and preserves all nested fields", () => {
    const rich = richScenario();
    useFinanceStore.setState({ scenarios: [rich], activeScenarioId: rich.id, assumptions: defaultAssumptions, snapshots: [] });
    const before = project(useFinanceStore.getState().scenarios[0], useFinanceStore.getState().assumptions);

    const json = useFinanceStore.getState().exportJson();
    // Fresh store, then import the exported JSON.
    useFinanceStore.setState({ scenarios: [makeBaseScenario()], snapshots: [] });
    useFinanceStore.getState().importJson(json);

    const st = useFinanceStore.getState();
    const back = st.scenarios.find((x) => x.id === rich.id)!;
    expect(back).toBeDefined();

    // Nested fields survive the roundtrip.
    expect(back.inputs.cashflowAllocation).toEqual(rich.inputs.cashflowAllocation);
    expect(back.inputs.capitalWithdrawal).toEqual(rich.inputs.capitalWithdrawal);
    expect(back.inputs.free.ask).toEqual(rich.inputs.free.ask);
    expect(back.inputs.free.depotTax).toEqual(rich.inputs.free.depotTax);
    expect(back.inputs.holding).toEqual(rich.inputs.holding);
    expect(back.inputs.pension).toEqual(rich.inputs.pension);
    expect(back.inputs.debts).toEqual(rich.inputs.debts);
    expect(back.inputs.lifeEvents!.length).toBe(rich.inputs.lifeEvents!.length);
    expect(st.assumptions).toEqual(defaultAssumptions);

    // Projection is materially identical (whole net-worth series).
    const after = project(back, st.assumptions);
    expect(after.map((y) => y.netWorth)).toEqual(before.map((y) => y.netWorth));
  });

  it("pure JSON.stringify/parse of a rich scenario reproduces the projection byte-for-byte", () => {
    const s = richScenario();
    const back = JSON.parse(JSON.stringify(s)) as Scenario;
    expect(JSON.stringify(project(back, A))).toBe(JSON.stringify(project(s, A)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Snapshot / cloud payload preservation
// ─────────────────────────────────────────────────────────────────────────────
describe("3. Snapshot & cloud payload preservation", () => {
  it("snapshot.resolvedInputs reproduce the same projection that was frozen", () => {
    const rich = richScenario();
    const snap = buildSnapshot(rich, [rich], A, { name: "Frozen" });
    expect(snap.years.length).toBeGreaterThan(0);
    expect(snap.resolvedInputs).toBeDefined();
    expect(snap.kpis).toBeDefined();
    // Re-projecting the frozen resolvedInputs reproduces the frozen years.
    const reproject = project({ ...rich, inputs: snap.resolvedInputs }, snap.assumptions);
    expect(reproject.map((y) => y.netWorth)).toEqual(snap.years.map((y) => y.netWorth));
  });

  it("cloud serialize → apply preserves scenarios AND a frozen snapshot (full reproducible shape)", () => {
    const rich = richScenario();
    useFinanceStore.setState({ scenarios: [rich], activeScenarioId: rich.id, assumptions: defaultAssumptions, snapshots: [] });
    const before = project(useFinanceStore.getState().scenarios[0], useFinanceStore.getState().assumptions);

    // Freeze a real snapshot BEFORE serialization so the cloud payload must carry it.
    const snapId = useFinanceStore.getState().saveSnapshot({ name: "Cloud snap", notes: "frozen" });
    const original = useFinanceStore.getState().snapshots.find((x) => x.snapshotId === snapId)!;
    expect(original).toBeDefined();

    const payload = serializeStoreState();
    // Wipe to a clean store (no snapshots) so a dropped snapshot would be caught.
    useFinanceStore.setState({ scenarios: [makeBaseScenario()], snapshots: [] });
    applyStateToStore(payload);

    const st = useFinanceStore.getState();
    const back = st.scenarios.find((x) => x.id === rich.id)!;
    expect(back).toBeDefined();
    expect(project(back, st.assumptions).map((y) => y.netWorth)).toEqual(before.map((y) => y.netWorth));

    // The snapshot is actually PRESERVED through the cloud roundtrip with the fields the app
    // needs to reproduce/display it.
    const restored = st.snapshots.find((x) => x.snapshotId === snapId);
    expect(restored, "snapshot survives cloud roundtrip").toBeDefined();
    expect(restored!.snapshotName).toBe(original.snapshotName);
    expect(restored!.notes).toBe(original.notes);
    expect(restored!.modelVersion).toBe(original.modelVersion);
    expect(restored!.modelRelease).toBe(original.modelRelease);
    expect(restored!.scenarioId).toBe(original.scenarioId);
    expect(restored!.scenarioName).toBe(original.scenarioName);
    expect(restored!.scenarioType).toBe(original.scenarioType);
    expect(restored!.resolvedInputs).toEqual(original.resolvedInputs);
    expect(restored!.kpis).toEqual(original.kpis);
    expect(restored!.years.map((y) => y.netWorth)).toEqual(original.years.map((y) => y.netWorth));
    expect(restored!.chartData).toEqual(original.chartData);
    // Frozen snapshot still re-projects to its own frozen years (independent of live scenario).
    const reproject = project({ ...back, inputs: restored!.resolvedInputs }, restored!.assumptions);
    expect(reproject.map((y) => y.netWorth)).toEqual(restored!.years.map((y) => y.netWorth));
  });

  it("snapshots survive an export/import roundtrip and stay frozen", () => {
    const rich = richScenario();
    useFinanceStore.setState({ scenarios: [rich], activeScenarioId: rich.id, assumptions: defaultAssumptions, snapshots: [] });
    const snapId = useFinanceStore.getState().saveSnapshot({ name: "Snap A" });
    const frozenNW = useFinanceStore.getState().snapshots[0].years.map((y) => y.netWorth);

    const json = useFinanceStore.getState().exportJson();
    useFinanceStore.setState({ scenarios: [makeBaseScenario()], snapshots: [] });
    useFinanceStore.getState().importJson(json);

    const snaps = useFinanceStore.getState().snapshots;
    const restored = snaps.find((x) => x.snapshotId === snapId)!;
    expect(restored).toBeDefined();
    expect(restored.years.map((y) => y.netWorth)).toEqual(frozenNW);
  });

  it("unknown extra fields in the payload do not crash import (forward tolerance)", () => {
    const rich = richScenario();
    const payload = {
      modelVersion: 1,
      activeScenarioId: rich.id,
      futureTopLevelField: { anything: true }, // unknown top-level key
      scenarios: [{ ...rich, futureScenarioField: "ignore-me" }], // unknown per-scenario key
      assumptions: defaultAssumptions,
    };
    expect(() => useFinanceStore.getState().importJson(JSON.stringify(payload))).not.toThrow();
    const back = useFinanceStore.getState().scenarios.find((x) => x.id === rich.id)!;
    expect(back).toBeDefined();
    expect(project(back, useFinanceStore.getState().assumptions).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Projection export fields
// ─────────────────────────────────────────────────────────────────────────────
describe("4. Projection export fields", () => {
  it("buildProjectionExport carries inputs, assumptions and every projected year", () => {
    const s = richScenario();
    const years = project(s, A);
    const exp = buildProjectionExport(s, A, years);
    expect(exp.years.length).toBe(years.length);
    expect(exp.inputs).toBeDefined();
    expect(exp.assumptions).toBeDefined();
    expect(exp.modelVersion).toBeGreaterThan(0);
  });

  it("CSV export has one row per year and all explanatory columns", () => {
    const s = richScenario();
    const years = project(s, A);
    const csv = buildProjectionCsv(years);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(PROJECTION_CSV_COLUMNS.join(","));
    expect(lines.length).toBe(years.length + 1);
    for (const col of [
      "cashflowBeforeSavings", "plannedInvestment", "actualInvestment",
      "surplusToBuffer", "surplusInvested", "surplusOutOfModel",
      "bufferEnd", "shortfall", "plannedSavingsShortfall",
      "askEnd", "depotEnd", "holdingEnd", "pensionEnd",
      "shareIncomeTax", "askTax", "netWorth",
    ] as const) {
      expect(PROJECTION_CSV_COLUMNS, `column ${col}`).toContain(col);
    }
    // No invalid tokens leaked into the CSV.
    expect(csv).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("year-audit JSON explains cashflow, savings, buffer, shortfall, capital withdrawal, ASK/depot/holding/pension/share-income", () => {
    const s = richScenario();
    const years = project(s, A);
    // Pick a post-stop year so capital withdrawals are active.
    const y = years.find((yy) => yy.age === 60) ?? years[years.length - 1];
    const audit = JSON.parse(buildYearAuditJson(s, y));
    const f = audit.flows;
    expect(f.cashflowBridge).toBeDefined();
    expect(f.cashflowBridge).toHaveProperty("cashflowBeforeSavings");
    expect(f).toHaveProperty("plannedFreeContribution");
    expect(f).toHaveProperty("investedAmount");
    expect(f.withdrawals).toHaveProperty("buffer");
    expect(f.capitalWithdrawal).toBeDefined();
    expect(f.capitalWithdrawal).toHaveProperty("grossBySource");
    expect(f.ask).toBeDefined();          // ASK enabled in rich scenario
    expect(f.depot).toBeDefined();        // depotTax enabled
    expect(f.shareIncome).toBeDefined();  // share-income pool present
    expect(f.holdingPlanned).toBeDefined();
    expect(audit).toHaveProperty("shortfallAmount");
    expect(audit).toHaveProperty("netWorth");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Validation / report consistency
// ─────────────────────────────────────────────────────────────────────────────
describe("5. Validation & report consistency", () => {
  it("runModelValidation is internally consistent and clean for a normal scenario", () => {
    const s = richScenario();
    const years = project(s, A);
    const rep = runModelValidation(s, years);
    expect(rep.totalChecks).toBeGreaterThan(0);
    expect(rep.failed).toBe(rep.results.filter((r) => r.status === "fail").length);
    expect(rep.failed).toBe(0);
    expect(rep.scenarioId).toBe(s.id);
  });

  it("runModelValidation does not crash on a legacy scenario missing newer fields", () => {
    const s = makeBaseScenario();
    delete (s.inputs as unknown as Record<string, unknown>).cashflowAllocation;
    delete (s.inputs as unknown as Record<string, unknown>).capitalWithdrawal;
    delete (s.inputs.free as unknown as Record<string, unknown>).ask;
    delete (s.inputs.free as unknown as Record<string, unknown>).depotTax;
    const years = project(s, A);
    expect(() => runModelValidation(s, years)).not.toThrow();
    expect(runModelValidation(s, years).failed).toBe(0);
  });

  it("deriveKPIs returns finite KPIs and a valid model status", () => {
    const s = richScenario();
    const years = project(s, A);
    const kpis = deriveKPIs(s, years, A);
    for (const v of [kpis.capitalAtStopAge, kpis.capitalAt95, kpis.financialRobustness, kpis.assumptionRisk, kpis.endShortfallVsTarget]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(["valid", "target_missed", "invalid"]).toContain(kpis.modelStatus);
    expect(kpis.financialRobustness).toBeGreaterThanOrEqual(0);
    expect(kpis.financialRobustness).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. No hidden invalid values in persisted/exported data
// ─────────────────────────────────────────────────────────────────────────────
describe("6. No hidden invalid values", () => {
  it("exported projection (years + export object) contains no NaN/Infinity and no negative buckets", () => {
    const s = richScenario();
    const years = project(s, A);
    assertNoNegativeBuckets(years);
    assertAllFinite(years);
    const exp = buildProjectionExport(s, A, years);
    assertAllFinite(exp.years);
  });

  it("snapshot payload contains no NaN/Infinity in years, kpis or chartData", () => {
    const s = richScenario();
    const snap = buildSnapshot(s, [s], A, { name: "Clean" });
    assertAllFinite(snap.years);
    assertAllFinite(snap.kpis);
    assertAllFinite(snap.chartData);
  });

  it("full store export: the WHOLE LIVE payload is finite before serialization and no numeric field becomes null after parse", () => {
    const rich = richScenario();
    useFinanceStore.setState({ scenarios: [rich], activeScenarioId: rich.id, assumptions: defaultAssumptions, snapshots: [] });
    useFinanceStore.getState().saveSnapshot({ name: "S" });

    // exportJson() serializes numeric fields across the ENTIRE store payload — not just
    // scenarios/snapshots, but also assumptions, countryProfiles and countryAnalysisSettings.
    // JSON.stringify coerces NaN/Infinity to null, and checking only the parsed output (where
    // typeof null === "object") would let a corrupted number slip through. So we (1) assert the
    // LIVE objects are finite before stringify, and (2) prove each LIVE number survives as the
    // same finite number after parse — across every top-level export key.
    const st = useFinanceStore.getState();
    const live: Record<string, unknown> = {
      scenarios: st.scenarios,
      snapshots: st.snapshots,
      assumptions: st.assumptions,
      countryProfiles: st.countryProfiles,
      countryAnalysisSettings: st.countryAnalysisSettings,
    };

    const json = st.exportJson();
    expect(json).not.toMatch(/NaN|Infinity/);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    for (const key of ["scenarios", "snapshots", "assumptions", "countryProfiles", "countryAnalysisSettings"] as const) {
      // Each of these top-level keys is present in the exported payload...
      expect(parsed[key], `export payload includes ${key}`).toBeDefined();
      // ...is finite live, and survives the roundtrip with no number → null coercion.
      assertFiniteNumbersSurvive(live[key], parsed[key], key);
    }
  });
});
