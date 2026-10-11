/**
 * Neutral advanced model (2026-10-11): "Familiefond" became a general "Anden indtægt" list, and
 * holding can be switched off. Both must leave every existing model's numbers untouched:
 * - a saved model with the old family-fund fields computes exactly as before, both when read
 *   directly (snapshots, cloud, exports) and after the v18 migration;
 * - holding switched off computes exactly like the same model with no holding at all, and
 *   holding without the new flag (every model saved before it) computes as before.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { defaultAssumptions, defaultInputs, makeBaseScenario, makeNewUserInputs } from "../defaults";
import { project } from "../projection";
import { deriveKPIs, getConfidence } from "../kpis";
import { computeFireAnalysis } from "../fire";
import { sanityChecks } from "../sanity";
import { laborTax } from "../tax";
import { normalizeIncomeInputs, otherIncomeNetOf, otherIncomesOf } from "../otherIncome";
import { isHoldingEnabled, withHoldingToggleApplied } from "../holdingToggle";
import { STRESS_TESTS } from "../stress";
import { MODEL_VERSION } from "../types";
import type { DebtItem, IncomeInputs, Scenario, YearFlows } from "../types";
import { useFinanceStore } from "@/store/financeStore";

const A = defaultAssumptions;

/** The same scenario as the old data shape: family-fund fields instead of the list. */
function asLegacyFamilyFund(s: Scenario, amount: number, untilAge: number): Scenario {
  const legacy = structuredClone(s);
  const { otherIncomes: _drop, ...rest } = legacy.inputs.income;
  legacy.inputs.income = { ...rest, familyFundAnnualNet: amount, familyFundUntilAge: untilAge } as unknown as IncomeInputs;
  return legacy;
}

describe("Anden indtægt replaces the family fund without changing any numbers", () => {
  it("the reference scenario computes identically from the old fields and from the list", () => {
    const listed = makeBaseScenario();
    const legacy = asLegacyFamilyFund(listed, 50_000, 70);
    expect(listed.inputs.income.otherIncomes).toHaveLength(1);

    const a = project(listed, A);
    const b = project(legacy, A);
    expect(a).toEqual(b);
    expect(deriveKPIs(listed, a, A)).toEqual(deriveKPIs(legacy, b, A));
    expect(computeFireAnalysis(listed, a, A)).toEqual(computeFireAnalysis(legacy, b, A));
  });

  it("keeps the old rule: paid while age < untilAge, never from the old fields when the amount is 0", () => {
    const s = makeBaseScenario();
    const years = project(asLegacyFamilyFund(s, 50_000, 70), A);
    for (const y of years) expect(y.flows.otherIncomeNet).toBe(y.age < 70 ? 50_000 : 0);
    expect(otherIncomesOf(asLegacyFamilyFund(s, 0, 70).inputs.income)).toEqual([]);
  });

  it("a negative legacy amount (the old field took a sign) keeps computing as before", () => {
    const s = makeBaseScenario();
    const legacy = asLegacyFamilyFund(s, -24_000, 60);
    const migrated = structuredClone(legacy);
    migrated.inputs.income = normalizeIncomeInputs(legacy.inputs.income);
    expect(migrated.inputs.income.otherIncomes[0].annualAmount).toBe(-24_000);
    const years = project(legacy, A);
    for (const y of years) expect(y.flows.otherIncomeNet).toBe(y.age < 60 ? -24_000 : 0);
    expect(project(migrated, A)).toEqual(years);
  });

  it("normalizeIncomeInputs turns the old fields into one net entry and is idempotent", () => {
    const legacy = asLegacyFamilyFund(makeBaseScenario(), 42_000, 66).inputs.income;
    const once = normalizeIncomeInputs(legacy);
    expect(once.otherIncomes).toEqual([
      { id: "legacy-family-fund", name: "Familiefond", annualAmount: 42_000, taxation: "net", fromAge: 0, untilAge: 66 },
    ]);
    expect("familyFundAnnualNet" in once).toBe(false);
    expect("familyFundUntilAge" in once).toBe(false);
    expect(normalizeIncomeInputs(once)).toEqual(once);
  });

  it("a gross entry is taxed like salary, on its own, and only between fromAge and untilAge", () => {
    const s = makeBaseScenario();
    s.inputs.income.otherIncomes = [
      { id: "fee", name: "Honorar", annualAmount: 300_000, taxation: "gross_labor", fromAge: 50, untilAge: 60 },
    ];
    const without = project({ ...structuredClone(s), inputs: { ...s.inputs, income: { ...s.inputs.income, otherIncomes: [] } } }, A);
    const years = project(s, A);
    const expected = laborTax(300_000, A.tax);
    for (const [i, y] of years.entries()) {
      const inWindow = y.age >= 50 && y.age < 60;
      expect(y.flows.otherIncomeNet).toBe(inWindow ? expected.net : 0);
      expect(y.flows.taxes - without[i].flows.taxes).toBeCloseTo(inWindow ? expected.tax : 0, 6);
    }
  });

  it("a net entry is added as is; several entries add up", () => {
    const s = makeBaseScenario();
    s.inputs.income.otherIncomes = [
      { id: "a", name: "Leje", annualAmount: 60_000, taxation: "net", fromAge: 40, untilAge: 96 },
      { id: "b", name: "Fond", annualAmount: 20_000, taxation: "net", fromAge: 45, untilAge: 50 },
    ];
    const years = project(s, A);
    const at = (age: number) => years.find((y) => y.age === age)!.flows.otherIncomeNet;
    expect(at(44)).toBe(60_000);
    expect(at(45)).toBe(80_000);
    expect(at(49)).toBe(80_000);
    expect(at(50)).toBe(60_000);
  });

  it("frozen year rows saved before the rename still read their family-fund income", () => {
    expect(otherIncomeNetOf({ familyFundNet: 50_000 } as unknown as YearFlows)).toBe(50_000);
    expect(otherIncomeNetOf({ otherIncomeNet: 12_000 } as unknown as YearFlows)).toBe(12_000);
    expect(otherIncomeNetOf({} as unknown as YearFlows)).toBe(0);
  });

  it("a saved confidence rating for the family fund carries over to Anden indtægt", () => {
    const s = makeBaseScenario();
    s.inputs.confidence = { familyFund: "speculative" } as never;
    expect(getConfidence(s).otherIncome).toBe("speculative");
    s.inputs.confidence = { familyFund: "speculative", otherIncome: "high" } as never;
    expect(getConfidence(s).otherIncome).toBe("high");
  });
});

describe("holding can be switched off", () => {
  /** The reference scenario with all holding taken out by hand. */
  function withoutHolding(s: Scenario): Scenario {
    const out = structuredClone(s);
    out.inputs.holding = { ...out.inputs.holding, balance: 0, expectedExitValue: 0, annualDistribution: 0 };
    const dropped = new Set(out.inputs.debts.filter((d) => d.kind === "holding" || d.impact === "holding").map((d) => d.id));
    out.inputs.debts = out.inputs.debts.filter((d) => !dropped.has(d.id) && !(d.linkedDebtId && dropped.has(d.linkedDebtId)));
    return out;
  }

  function withHoldingDebt(s: Scenario): Scenario {
    const out = structuredClone(s);
    const debt: DebtItem = {
      id: "hd", name: "Lån i selskabet", kind: "holding", balance: 600_000, interestRate: 0.05,
      monthlyPayment: 8_000, impact: "holding", includeInNetWorth: true, holdingFinancing: "holding_capital",
    };
    const liability: DebtItem = {
      id: "pl", name: "Kaution", kind: "personal_liability", balance: 600_000, interestRate: 0,
      monthlyPayment: 0, impact: "risk_only", includeInNetWorth: false, linkedDebtId: "hd",
    };
    out.inputs.debts = [...out.inputs.debts, debt, liability];
    return out;
  }

  it("models saved before the switch (no flag) keep holding, unchanged", () => {
    const s = makeBaseScenario();
    expect(s.inputs.holding.enabled).toBeUndefined();
    expect(isHoldingEnabled(s.inputs)).toBe(true);
    expect(withHoldingToggleApplied(s.inputs)).toBe(s.inputs);
    const on = structuredClone(s);
    on.inputs.holding.enabled = true;
    expect(project(on, A)).toEqual(project(s, A));
  });

  it("switched off computes exactly like the same model without any holding", () => {
    const base = withHoldingDebt(makeBaseScenario());
    const off = structuredClone(base);
    off.inputs.holding.enabled = false;
    const none = withoutHolding(base);

    const a = project(off, A);
    const b = project(none, A);
    expect(a).toEqual(b);
    expect(a.every((y) => y.closing.holding === 0)).toBe(true);
    expect(deriveKPIs(off, a, A)).toEqual(deriveKPIs(none, b, A));
    expect(computeFireAnalysis(off, a, A)).toEqual(computeFireAnalysis(none, b, A));
    expect(sanityChecks(off, a)).toEqual(sanityChecks(none, b));
    // And it really differs from holding switched on, so the switch is not a no-op.
    expect(project(base, A)).not.toEqual(a);
  });

  it("switching off keeps the typed figures, so switching back on restores the result", () => {
    const s = makeBaseScenario();
    const off = structuredClone(s);
    off.inputs.holding.enabled = false;
    expect(off.inputs.holding.balance).toBe(defaultInputs.holding.balance);
    const back = structuredClone(off);
    back.inputs.holding.enabled = true;
    expect(project(back, A)).toEqual(project(s, A));
  });
});

describe("store: migration, import and new users", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("v18 migration turns the family fund into the list and leaves the projection identical", () => {
    const legacyScenario = { ...asLegacyFamilyFund(makeBaseScenario(), 50_000, 70), type: "base" as const };
    const before = project(legacyScenario, A);
    const migrate = useFinanceStore.persist.getOptions().migrate!;
    const migrated = migrate(
      structuredClone({ scenarios: [legacyScenario], activeScenarioId: legacyScenario.id, assumptions: A }),
      17,
    ) as { scenarios: Scenario[] };
    const sc = migrated.scenarios[0];
    expect(sc.inputs.income.otherIncomes).toHaveLength(1);
    expect("familyFundAnnualNet" in sc.inputs.income).toBe(false);
    expect(project(sc, A)).toEqual(before);
  });

  it("upgrading a current (v17) model to v18 keeps every other setting, only the income shape changes", () => {
    // Codex review on #56: the unversioned pre-v9 rebuild of free/pension/income ran on EVERY
    // version bump and dropped newer fields (ASK, depot tax, stop rule). A v17 model must come
    // out of migrate() identical apart from the family fund turning into the list.
    const sc = { ...makeBaseScenario(), type: "base" as const, updatedAt: 1 };
    sc.inputs.free = {
      ...sc.inputs.free,
      contributionStopRule: "customAge",
      contributionStopAge: 58,
      ask: { enabled: true, currentValue: 90_000, depositLimit: 174_200, taxRate: 0.17, autoFillFirst: true } as never,
      depotTax: { enabled: true, method: "realizationSimple" } as never,
    };
    sc.inputs.holding.enabled = false;
    const legacy = asLegacyFamilyFund(sc, 50_000, 70);
    const migrate = useFinanceStore.persist.getOptions().migrate!;
    const migrated = migrate(
      structuredClone({ scenarios: [legacy], activeScenarioId: legacy.id, assumptions: A, snapshots: [] }),
      17,
    ) as { scenarios: Scenario[] };
    const out = migrated.scenarios[0];
    expect({ ...out.inputs, income: undefined }).toEqual({ ...legacy.inputs, income: undefined });
    expect({ ...out, inputs: undefined }).toEqual({ ...legacy, inputs: undefined });
    expect(out.inputs.income).toEqual(normalizeIncomeInputs(legacy.inputs.income));
  });

  it("importing an old export converts the family fund too", () => {
    const legacyScenario = { ...asLegacyFamilyFund(makeBaseScenario(), 30_000, 65), type: "base" as const };
    useFinanceStore.getState().importJson(
      JSON.stringify({ scenarios: [legacyScenario], activeScenarioId: legacyScenario.id, assumptions: A }),
    );
    const income = useFinanceStore.getState().scenarios[0].inputs.income;
    expect(income.otherIncomes).toEqual([
      { id: "legacy-family-fund", name: "Familiefond", annualAmount: 30_000, taxation: "net", fromAge: 0, untilAge: 65 },
    ]);
  });

  it("importing an old export keeps an untyped stress test linked to its base", () => {
    // Codex review on #56: the base must be normalized before classification, otherwise the
    // old vs new income shape makes every legacy link look hand-edited ("custom").
    const base = asLegacyFamilyFund(makeBaseScenario(), 50_000, 70);
    delete (base as Partial<Scenario>).type;
    const stress = structuredClone(base);
    stress.id = "stress-1";
    stress.name = "Base case – uden deltid";
    stress.baseScenarioId = base.id;
    stress.modifiers = { noPartTime: true } as Scenario["modifiers"];
    STRESS_TESTS.find((t) => t.key === "noPartTime")!.apply(stress);
    useFinanceStore.getState().importJson(
      JSON.stringify({ scenarios: [base, stress], activeScenarioId: base.id, assumptions: A }),
    );
    const imported = useFinanceStore.getState().scenarios.find((x) => x.id === "stress-1")!;
    expect(imported.type).toBe("linked_stress_test");
    expect(imported.manuallyEdited).toBe(false);
  });

  it("exports advertise the new schema version", () => {
    expect(MODEL_VERSION).toBe(2);
    expect(JSON.parse(useFinanceStore.getState().exportJson()).modelVersion).toBe(2);
  });

  it("a new user starts neutral: holding switched off and empty, no other income", () => {
    const inp = makeNewUserInputs();
    expect(inp.holding.enabled).toBe(false);
    expect(inp.holding.balance).toBe(0);
    expect(inp.holding.expectedExitValue).toBe(0);
    expect(inp.income.otherIncomes).toEqual([]);
    // The engine's reference scenario is untouched.
    expect(defaultInputs.holding.balance).toBe(1_000_000);
    expect(defaultInputs.income.otherIncomes).toHaveLength(1);
  });
});
