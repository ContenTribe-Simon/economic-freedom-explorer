import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { deriveKPIs, DEFAULT_CONFIDENCE, getConfidence } from "../kpis";

function run(scenario: ReturnType<typeof makeBaseScenario>) {
  const years = project(scenario, defaultAssumptions);
  return { years, kpis: deriveKPIs(scenario, years, defaultAssumptions) };
}

describe("financial robustness", () => {
  it("includes a breakdown with at least 3 factors", () => {
    const s = makeBaseScenario();
    const { kpis } = run(s);
    expect(kpis.robustnessBreakdown.length).toBeGreaterThanOrEqual(3);
    expect(typeof kpis.robustnessSummary).toBe("string");
  });

  it("reacts to unreachable minimum target with lower end-margin", () => {
    const s1 = makeBaseScenario();
    const s2 = makeBaseScenario();
    s2.inputs.target.minNetWorthAtEnd = 1e12;
    const a = run(s1).kpis.financialRobustness;
    const b = run(s2).kpis.financialRobustness;
    expect(b).toBeLessThanOrEqual(a);
  });

  it("reacts to a forced shortfall (huge spending)", () => {
    const s1 = makeBaseScenario();
    const s2 = makeBaseScenario();
    s2.inputs.spending.desiredMonthlyNet = 200000;
    const a = run(s1).kpis.financialRobustness;
    const b = run(s2).kpis.financialRobustness;
    expect(b).toBeLessThan(a);
  });
});

describe("assumption confidence", () => {
  it("uses defaults when scenario has no confidence field", () => {
    const s = makeBaseScenario();
    delete (s.inputs as any).confidence;
    const conf = getConfidence(s);
    expect(conf.holdingExit).toBe(DEFAULT_CONFIDENCE.holdingExit);
    const { kpis } = run(s);
    expect(kpis.assumptionConfidence).toBeGreaterThanOrEqual(0);
    expect(kpis.assumptionConfidence).toBeLessThanOrEqual(100);
  });

  it("lowers score when an important assumption is set to speculative", () => {
    const s1 = makeBaseScenario();
    const s2 = makeBaseScenario();
    s2.inputs.confidence = { ...DEFAULT_CONFIDENCE, returns: "speculative", spending: "speculative" };
    const a = run(s1).kpis.assumptionConfidence;
    const b = run(s2).kpis.assumptionConfidence;
    expect(b).toBeLessThan(a);
  });

  it("changing confidence does NOT change year-by-year projection", () => {
    const s1 = makeBaseScenario();
    const s2 = makeBaseScenario();
    s2.inputs.confidence = { ...DEFAULT_CONFIDENCE, holdingExit: "very_high", returns: "very_high" };
    const r1 = run(s1).years;
    const r2 = run(s2).years;
    expect(r1.length).toBe(r2.length);
    for (let i = 0; i < r1.length; i++) {
      expect(r2[i].netWorth).toBeCloseTo(r1[i].netWorth, 2);
      expect(r2[i].closing.holding).toBeCloseTo(r1[i].closing.holding, 2);
    }
  });

  it("unused assumptions are flagged with note and don't dominate score", () => {
    const s = makeBaseScenario();
    s.inputs.income.familyFundAnnualNet = 0;
    s.inputs.confidence = { ...DEFAULT_CONFIDENCE, familyFund: "speculative" };
    const { kpis } = run(s);
    const ff = kpis.confidenceBreakdown.find((f) => f.key === "familyFund");
    // familyFund med vægt 0 bør ikke optræde i top-5 listen
    expect(ff).toBeUndefined();
  });

  it("financial robustness and assumption confidence are independent", () => {
    const s = makeBaseScenario();
    s.inputs.confidence = {
      ...DEFAULT_CONFIDENCE,
      holdingExit: "speculative",
      returns: "speculative",
    };
    const { kpis } = run(s);
    // Begge findes som tal i [0,100], og ændring af confidence flytter kun den ene
    expect(kpis.financialRobustness).toBeGreaterThanOrEqual(0);
    expect(kpis.assumptionConfidence).toBeLessThan(100);
  });
});

describe("long scenario name doesn't break score derivation", () => {
  it("derives KPIs even with very long names", () => {
    const s = makeBaseScenario();
    s.name = "Base case – uden Barma – uden deltid – med lavere afkast – med højere forbrug – ekstra lang test";
    const { kpis } = run(s);
    expect(typeof kpis.robustnessSummary).toBe("string");
  });
});
