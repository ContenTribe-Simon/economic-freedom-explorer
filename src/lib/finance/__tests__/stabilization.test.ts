import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { deriveKPIs } from "../kpis";
import { runIntegrityChecks } from "../integrity";
import { applyStressModifierToState } from "../stress";
import { MODEL_VERSION } from "../types";

function run(s: ReturnType<typeof makeBaseScenario>) {
  const years = project(s, defaultAssumptions);
  return { years, kpis: deriveKPIs(s, years, defaultAssumptions) };
}

describe("integrity checks across canonical scenarios", () => {
  it("base case is integrity-clean", () => {
    const s = makeBaseScenario();
    const { years } = run(s);
    expect(runIntegrityChecks(s, years)).toEqual([]);
  });

  it("base case + noBarma is integrity-clean", () => {
    const base = makeBaseScenario();
    const next = applyStressModifierToState([base], base.id, "noBarma");
    const stressed = next.scenarios.find((sc) => sc.id === next.activeScenarioId)!;
    const { years } = run(stressed);
    expect(runIntegrityChecks(stressed, years)).toEqual([]);
  });

  it("base case + noPartTime is integrity-clean", () => {
    const base = makeBaseScenario();
    const next = applyStressModifierToState([base], base.id, "noPartTime");
    const stressed = next.scenarios.find((sc) => sc.id === next.activeScenarioId)!;
    const { years } = run(stressed);
    expect(runIntegrityChecks(stressed, years)).toEqual([]);
  });

  it("combined modifiers (noBarma + noPartTime) is integrity-clean and unique", () => {
    const base = makeBaseScenario();
    const a = applyStressModifierToState([base], base.id, "noBarma");
    const b = applyStressModifierToState(a.scenarios, a.activeScenarioId, "noPartTime");
    const combined = b.scenarios.find((sc) => sc.id === b.activeScenarioId)!;
    expect(combined.modifiers?.noBarma).toBe(true);
    expect(combined.modifiers?.noPartTime).toBe(true);
    const { years } = run(combined);
    expect(runIntegrityChecks(combined, years)).toEqual([]);
  });
});

describe("pension and holding lifecycle", () => {
  it("pension net flows are zero before payoutFromAge and positive during payout", () => {
    const s = makeBaseScenario();
    s.inputs.pension.balance = 1_500_000;
    s.inputs.pension.payoutFromAge = 65;
    s.inputs.pension.ratePensionPayoutYears = 10;
    const { years } = run(s);
    const before = years.find((y) => y.age === 60)!;
    const during = years.find((y) => y.age === 67)!;
    const after = years.find((y) => y.age === 80);
    expect(before.flows.ratePension.net).toBe(0);
    expect(during.flows.ratePension.net).toBeGreaterThan(0);
    if (after) expect(after.flows.ratePension.net).toBe(0);
  });

  it("holding distribution is zero before distributionFromAge", () => {
    const s = makeBaseScenario();
    s.inputs.holding.distributionFromAge = 60;
    s.inputs.holding.startDistributionAtStopAge = false;
    s.inputs.holding.annualDistribution = 100_000;
    const { years } = run(s);
    const before = years.find((y) => y.age === 50)!;
    const after = years.find((y) => y.age === 65)!;
    expect(before.flows.holdingDistributionNet).toBe(0);
    expect(after.flows.holdingDistributionNet).toBeGreaterThanOrEqual(0);
  });
});

describe("savings logic produces consistent invested/unallocated numbers", () => {
  it("planned/cashflow/hybrid all keep investedAmount === freeContribution", () => {
    for (const logic of ["planned", "cashflow", "hybrid"] as const) {
      const s = makeBaseScenario();
      s.inputs.savingsLogic = logic;
      const { years } = run(s);
      expect(runIntegrityChecks(s, years)).toEqual([]);
    }
  });

  it("cashflow logic should not leave significant unallocated cashflow", () => {
    const s = makeBaseScenario();
    s.inputs.savingsLogic = "cashflow";
    const { years } = run(s);
    const total = years.reduce((acc, y) => acc + y.flows.unallocatedCashflow, 0);
    expect(total).toBeLessThan(1);
  });
});

describe("model export shape (modelVersion + metadata)", () => {
  it("includes modelVersion, timestamps and scenarios", async () => {
    const { useFinanceStore } = await import("@/store/financeStore");
    const json = useFinanceStore.getState().exportJson();
    const parsed = JSON.parse(json);
    expect(parsed.modelVersion).toBe(MODEL_VERSION);
    expect(typeof parsed.createdAt).toBe("number");
    expect(typeof parsed.updatedAt).toBe("number");
    expect(Array.isArray(parsed.scenarios)).toBe(true);
    expect(parsed.scenarios.length).toBeGreaterThan(0);
    expect(parsed.assumptions).toBeTruthy();
  });

  it("re-importing exported JSON preserves scenario count", async () => {
    const { useFinanceStore } = await import("@/store/financeStore");
    const before = useFinanceStore.getState().scenarios.length;
    const json = useFinanceStore.getState().exportJson();
    useFinanceStore.getState().importJson(json);
    expect(useFinanceStore.getState().scenarios.length).toBe(before);
  });
});

describe("lifeEvents is a forward-compat placeholder", () => {
  it("populating lifeEvents does NOT change projection results", () => {
    const a = makeBaseScenario();
    const b = makeBaseScenario();
    b.inputs.lifeEvents = [
      {
        id: "evt-1",
        label: "Boligkøb",
        type: "expense",
        startAge: 45,
        amount: 200_000,
        affectsCashflow: true,
        affectsNetWorth: true,
      },
    ];
    const ya = project(a, defaultAssumptions);
    const yb = project(b, defaultAssumptions);
    expect(ya.length).toBe(yb.length);
    for (let i = 0; i < ya.length; i++) {
      expect(yb[i].netWorth).toBeCloseTo(ya[i].netWorth, 2);
    }
  });
});
