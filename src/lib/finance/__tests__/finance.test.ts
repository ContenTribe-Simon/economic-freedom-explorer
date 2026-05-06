import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { deriveKPIs } from "../kpis";
import { laborTax, shareTax, pensionPayoutTax } from "../tax";
import { applyStressModifierToState } from "../stress";

describe("tax", () => {
  it("labor tax non-negative", () => {
    const r = laborTax(750000, defaultAssumptions.tax);
    expect(r.tax).toBeGreaterThan(0);
    expect(r.net).toBeLessThan(750000);
    expect(r.net + r.tax).toBeCloseTo(750000, 0);
  });
  it("share tax thresholds", () => {
    const a = defaultAssumptions.tax;
    const low = shareTax(a.shareThreshold, a);
    expect(low.tax).toBeCloseTo(a.shareThreshold * a.shareLowRate);
    const high = shareTax(a.shareThreshold * 2, a);
    expect(high.tax).toBeGreaterThan(low.tax);
  });
  it("pension payout flat", () => {
    const r = pensionPayoutTax(100000, 0.4);
    expect(r.tax).toBeCloseTo(40000);
  });
});

describe("projection", () => {
  it("produces a row per year", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    expect(years.length).toBe(s.inputs.person.lifeExpectancy - s.inputs.person.currentAge + 1);
  });
  it("net worth finite and KPIs derive", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const k = deriveKPIs(s, years, defaultAssumptions);
    expect(Number.isFinite(k.capitalAt95)).toBe(true);
    expect(k.financialRobustness).toBeGreaterThanOrEqual(0);
    expect(k.financialRobustness).toBeLessThanOrEqual(100);
    expect(k.assumptionRisk).toBeGreaterThanOrEqual(0);
    expect(k.assumptionRisk).toBeLessThanOrEqual(100);
    expect(k.plannedStopAge).toBe(s.inputs.stopAge);
  });
});

describe("scenario active selection", () => {
  it("repeated setActive on same id is a no-op (count, order, active)", async () => {
    const { useFinanceStore } = await import("@/store/financeStore");
    const before = useFinanceStore.getState();
    const id = before.activeScenarioId;
    const countBefore = before.scenarios.length;
    const orderBefore = before.scenarios.map((s) => s.id).join(",");
    before.setActive(id);
    before.setActive(id);
    before.setActive(id);
    const after = useFinanceStore.getState();
    expect(after.activeScenarioId).toBe(id);
    expect(after.scenarios.length).toBe(countBefore);
    expect(after.scenarios.map((s) => s.id).join(",")).toBe(orderBefore);
  });
});

describe("stress-test modifiers", () => {
  it("applies No Barma once and makes repeated clicks a no-op", () => {
    const base = makeBaseScenario();
    const first = applyStressModifierToState([base], base.id, "noBarma");
    const stressed = first.scenarios.find((s) => s.id === first.activeScenarioId)!;
    const snapshot = JSON.stringify(stressed);

    expect(first.scenarios.length).toBe(2);
    expect(stressed.name).toBe("Base case – uden Barma");
    expect(stressed.modifiers?.noBarma).toBe(true);

    const second = applyStressModifierToState(first.scenarios, first.activeScenarioId, "noBarma");
    const after = second.scenarios.find((s) => s.id === second.activeScenarioId)!;

    expect(second.scenarios.length).toBe(first.scenarios.length);
    expect(after.name).toBe(stressed.name);
    expect(JSON.stringify(after)).toBe(snapshot);
  });

  it("activates an existing modifier combination instead of creating a duplicate", () => {
    const base = makeBaseScenario();
    const noBarma = applyStressModifierToState([base], base.id, "noBarma");
    const combined = applyStressModifierToState(noBarma.scenarios, noBarma.activeScenarioId, "noPartTime");
    const combinedId = combined.activeScenarioId;
    const withNoPartTime = applyStressModifierToState(combined.scenarios, base.id, "noPartTime");

    const result = applyStressModifierToState(withNoPartTime.scenarios, withNoPartTime.activeScenarioId, "noBarma");

    expect(result.scenarios.length).toBe(withNoPartTime.scenarios.length);
    expect(result.activeScenarioId).toBe(combinedId);
    expect(result.scenarios.find((s) => s.id === combinedId)?.name).toBe("Base case – uden Barma – uden deltid");
  });
});
