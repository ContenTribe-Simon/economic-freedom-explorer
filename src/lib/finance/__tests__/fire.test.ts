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

describe("FIRE — capitalBreakdown for dependence section", () => {
  it("does not return all-zero shares when FIRE base capital is positive", () => {
    const s = withScenario((sc) => {
      sc.inputs.spending.desiredMonthlyNet = 10000;
      sc.inputs.free.balance = 5_000_000;
      sc.inputs.holding.balance = 1_000_000;
    });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.capitalBreakdown.totalIncluded).toBeGreaterThan(0);
    const sum = fire.capitalBreakdown.shares.free + fire.capitalBreakdown.shares.holding + fire.capitalBreakdown.shares.pension;
    expect(sum).toBeGreaterThan(0.99);
    expect(sum).toBeLessThan(1.01);
  });

  it("free + holding shares sum to 1 when pension is excluded (default)", () => {
    const s = withScenario((sc) => {
      sc.inputs.free.balance = 4_000_000;
      sc.inputs.holding.balance = 2_000_000;
      sc.inputs.pension.balance = 3_000_000;
    });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.capitalBreakdown.included.pension).toBe(false);
    expect(fire.capitalBreakdown.shares.pension).toBe(0);
    const fhSum = fire.capitalBreakdown.shares.free + fire.capitalBreakdown.shares.holding;
    expect(fhSum).toBeCloseTo(1, 2);
  });

  it("pension is shown but excluded from Standard FI when default config is used", () => {
    const s = withScenario((sc) => { sc.inputs.pension.balance = 2_000_000; });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.capitalBreakdown.included.pension).toBe(false);
    expect(fire.capitalBreakdown.pension).toBeGreaterThanOrEqual(0);
  });

  it("breakdown matches Standard FI capitalAvailable on FIRE card", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.capitalBreakdown.totalIncluded).toBeCloseTo(fire.results.standard.capitalAvailable, 0);
  });

  it("capitalBreakdown does not change projection results", () => {
    const s = makeBaseScenario();
    const ys1 = project(s, defaultAssumptions);
    const before = JSON.stringify(ys1);
    computeFireAnalysis(s, ys1, defaultAssumptions);
    const ys2 = project(s, defaultAssumptions);
    expect(JSON.stringify(ys2)).toBe(before);
  });
});

describe("FIRE — benchmarks (3,5%, 4%, gross-up)", () => {
  it("3,5% benchmark = annualNet / 0.035", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    const annual = s.inputs.spending.desiredMonthlyNet * 12;
    const b35 = fire.benchmarks.find((b) => b.rate === 0.035)!;
    expect(b35.capitalRequiredNet).toBeCloseTo(annual / 0.035, 0);
  });

  it("4% benchmark = annualNet / 0.04", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    const annual = s.inputs.spending.desiredMonthlyNet * 12;
    const b4 = fire.benchmarks.find((b) => b.rate === 0.04)!;
    expect(b4.capitalRequiredNet).toBeCloseTo(annual / 0.04, 0);
  });

  it("skattejusteret grovestimat = net / (1 - tax) / rate", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions, { ...FIRE_DEFAULTS, effectiveTaxOnWithdrawal: 0.27 });
    const annual = s.inputs.spending.desiredMonthlyNet * 12;
    const expected = annual / (1 - 0.27) / 0.035;
    const b35 = fire.benchmarks.find((b) => b.rate === 0.035)!;
    expect(b35.capitalRequiredGross).toBeCloseTo(expected, 0);
  });

  it("FIRE-benchmark beregning ændrer ikke projection", () => {
    const s = makeBaseScenario();
    const ys1 = project(s, defaultAssumptions);
    const before = JSON.stringify(ys1);
    computeFireAnalysis(s, ys1, defaultAssumptions, { ...FIRE_DEFAULTS, effectiveTaxOnWithdrawal: 0.42 });
    const ys2 = project(s, defaultAssumptions);
    expect(JSON.stringify(ys2)).toBe(before);
  });
});

describe("FIRE — sustainable withdrawal", () => {
  it("3,5% sustainable = currentCapitalIncluded * 0.035", () => {
    const s = withScenario((sc) => {
      sc.inputs.free.balance = 4_000_000;
      sc.inputs.holding.balance = 1_000_000;
    });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    const cap = s.inputs.free.balance + s.inputs.holding.balance; // pension excluded by default
    const r35 = fire.sustainableNow.rates.find((r) => r.rate === 0.035)!;
    expect(r35.annual).toBeCloseTo(cap * 0.035, 0);
    expect(r35.monthly).toBeCloseTo((cap * 0.035) / 12, 0);
  });
});

describe("FIRE — spending reductions are analytical only", () => {
  it("10% reduction → kapital ved 3.5% falder med 10%", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    const r10 = fire.spendingReductions.find((r) => r.pct === 0.10)!;
    expect(r10.capitalRequiredAt3_5).toBeCloseTo(fire.standardFiNumber * 0.9, 0);
  });

  it("ændrer ikke scenariets desiredMonthlyNet", () => {
    const s = makeBaseScenario();
    const before = s.inputs.spending.desiredMonthlyNet;
    const years = project(s, defaultAssumptions);
    computeFireAnalysis(s, years, defaultAssumptions);
    expect(s.inputs.spending.desiredMonthlyNet).toBe(before);
  });
});

describe("FIRE — gap & best point", () => {
  it("hver result har gapPct og bestPoint", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    for (const t of ["coast", "lean", "standard", "fat", "barista"] as const) {
      const r = fire.results[t];
      expect(typeof r.gapPct).toBe("number");
      expect(r.bestPoint === null || typeof r.bestPoint.age === "number").toBe(true);
    }
  });

  it("hvis ingen milepæl nås, summary peger på smallestUnachievedGap", () => {
    const s = withScenario((sc) => {
      sc.inputs.spending.desiredMonthlyNet = 80000;
      sc.inputs.free.balance = 100_000;
      sc.inputs.holding.balance = 0;
      sc.inputs.holding.expectedExitValue = 0;
      sc.inputs.pension.balance = 0;
    });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.nearestMilestone).toBeNull();
    expect(fire.summary.smallestUnachievedGap).not.toBeNull();
    expect(fire.summary.smallestUnachievedGap!.gap).toBeGreaterThan(0);
  });

  it("summary.nearestType matcher nearestMilestone når noget er opnået", () => {
    const s = withScenario((sc) => {
      sc.inputs.spending.desiredMonthlyNet = 10000;
      sc.inputs.free.balance = 20_000_000;
    });
    const years = project(s, defaultAssumptions);
    const fire = computeFireAnalysis(s, years, defaultAssumptions);
    expect(fire.summary.nearestType).toBe(fire.nearestMilestone);
  });
});
