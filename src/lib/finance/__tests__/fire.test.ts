import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { computeFireAnalysis, FIRE_DEFAULTS } from "../fire";
import type { Scenario } from "../types";

function withScenario(mut: (s: Scenario) => void) {
  const s = makeBaseScenario();
  mut(s);
  return s;
}

describe("FIRE — does not change projection", () => {
  it("computeFireAnalysis is non-mutating: years remain identical", () => {
    const s = makeBaseScenario();
    const ys1 = project(s, defaultAssumptions);
    const before = JSON.stringify(ys1.map((y) => y.netWorth));
    computeFireAnalysis(s, ys1, defaultAssumptions);
    const ys2 = project(s, defaultAssumptions);
    const after = JSON.stringify(ys2.map((y) => y.netWorth));
    expect(after).toBe(before);
  });
});

describe("FIRE — Standard FI achievement", () => {
  it("low-spending high-capital scenario achieves Standard FI", () => {
    const s = withScenario((sc) => {
      sc.inputs.spending.desiredMonthlyNet = 10000;
      sc.inputs.free.balance = 20_000_000;
      sc.inputs.holding.balance = 0;
      sc.inputs.holding.expectedExitValue = 0;
    });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.results.standard.achievedAtAge).not.toBeNull();
  });

  it("high-spending low-capital scenario does not achieve Standard FI", () => {
    const s = withScenario((sc) => {
      sc.inputs.spending.desiredMonthlyNet = 80000;
      sc.inputs.free.balance = 100_000;
      sc.inputs.holding.balance = 0;
      sc.inputs.holding.expectedExitValue = 0;
      sc.inputs.pension.balance = 0;
    });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.results.standard.achievedAtAge).toBeNull();
  });
});

describe("FIRE — Lean vs Standard vs Fat targets", () => {
  it("Lean FI target < Standard FI target < Fat FI target", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.results.lean.capitalRequired).toBeLessThan(fire.results.standard.capitalRequired);
    expect(fire.results.standard.capitalRequired).toBeLessThan(fire.results.fat.capitalRequired);
  });
});

describe("FIRE — Coast FI", () => {
  it("can be achieved earlier than Standard FI when high real return is available", () => {
    const s = withScenario((sc) => {
      sc.inputs.spending.desiredMonthlyNet = 20000;
      sc.inputs.free.balance = 5_000_000;
      sc.inputs.free.monthlyContribution = 0;
      sc.inputs.free.annualExtraContribution = 0;
      sc.inputs.holding.balance = 0;
      sc.inputs.holding.expectedExitValue = 0;
      sc.inputs.stopAge = 60;
    });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    const coast = fire.results.coast.achievedAtAge;
    const standard = fire.results.standard.achievedAtAge;
    expect(coast).not.toBeNull();
    if (coast !== null && standard !== null) {
      expect(coast).toBeLessThanOrEqual(standard);
    }
  });
});

describe("FIRE — Barista FI uses part-time income", () => {
  it("part-time income lowers Barista threshold relative to Standard", () => {
    const s = withScenario((sc) => {
      sc.inputs.spending.desiredMonthlyNet = 20000;
      sc.inputs.free.balance = 2_000_000;
      sc.inputs.income.partTime.netMonthly = 15000;
      sc.inputs.income.partTime.fromAge = 50;
      sc.inputs.income.partTime.untilAge = 70;
      sc.inputs.stopAge = 50;
    });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    // With high part-time, Barista should be reachable
    expect(fire.results.barista.achievedAtAge).not.toBeNull();
  });
});

describe("FIRE — assumptions config", () => {
  it("withdrawalRate and spending factors drive FI numbers", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    const annual = s.inputs.spending.desiredMonthlyNet * 12;
    expect(fire.standardFiNumber).toBeCloseTo(annual / FIRE_DEFAULTS.withdrawalRate, 0);
    expect(fire.results.lean.capitalRequired).toBeCloseTo(
      (annual * FIRE_DEFAULTS.leanSpendingFactor) / FIRE_DEFAULTS.withdrawalRate,
      0,
    );
    expect(fire.results.fat.capitalRequired).toBeCloseTo(
      (annual * FIRE_DEFAULTS.fatSpendingFactor) / FIRE_DEFAULTS.withdrawalRate,
      0,
    );
  });
});

describe("FIRE — yearStatus consistency", () => {
  it("year status length matches projection length", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.yearStatus.length).toBe(years.length);
    expect(fire.yearStatus[0].age).toBe(years[0].age);
  });
});

describe("FIRE — works for custom scenarios independently", () => {
  it("recomputes fresh per scenario inputs", () => {
    const a = makeBaseScenario();
    const b = withScenario((sc) => { sc.inputs.spending.desiredMonthlyNet = 5000; });
    const ya = project(a, defaultAssumptions);
    const yb = project(b, defaultAssumptions);
    const fa = computeFireAnalysis(a, ya, defaultAssumptions);
    const fb = computeFireAnalysis(b, yb, defaultAssumptions);
    expect(fb.standardFiNumber).toBeLessThan(fa.standardFiNumber);
  });
});
