import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { sanityChecks } from "../sanity";

function workingYear(s: ReturnType<typeof makeBaseScenario>) {
  // Make spending low so cashflow is clearly positive while working.
  s.inputs.spending.desiredMonthlyNet = 10000;
  s.inputs.free.monthlyContribution = 5000;
  s.inputs.free.annualExtraContribution = 0;
  return s;
}

describe("savings logic — unallocated cashflow", () => {
  it("planned: surplus above planned savings is NOT auto-invested", () => {
    const s = workingYear(makeBaseScenario());
    s.inputs.savingsLogic = "planned";
    const years = project(s, defaultAssumptions);
    const y0 = years[0];
    const planned = s.inputs.free.monthlyContribution * 12 + s.inputs.free.annualExtraContribution;
    expect(y0.flows.investedAmount).toBeLessThanOrEqual(planned + 0.5);
    expect(y0.flows.unallocatedCashflow).toBeGreaterThan(0);
  });

  it("cashflow: full surplus is auto-invested, no unallocated", () => {
    const s = workingYear(makeBaseScenario());
    s.inputs.savingsLogic = "cashflow";
    const years = project(s, defaultAssumptions);
    const y0 = years[0];
    const planned = s.inputs.free.monthlyContribution * 12;
    expect(y0.flows.investedAmount).toBeGreaterThan(planned);
    expect(y0.flows.unallocatedCashflow).toBeCloseTo(0, 2);
  });

  it("hybrid: surplus above planned shows as unallocated", () => {
    const s = workingYear(makeBaseScenario());
    s.inputs.savingsLogic = "hybrid";
    const years = project(s, defaultAssumptions);
    const y0 = years[0];
    const planned = s.inputs.free.monthlyContribution * 12;
    expect(y0.flows.investedAmount).toBeCloseTo(planned, 2);
    expect(y0.flows.unallocatedCashflow).toBeGreaterThan(0);
  });

  it("hybrid: negative cashflow after planned shows as cashflowSurplus < 0", () => {
    const s = makeBaseScenario();
    s.inputs.savingsLogic = "hybrid";
    s.inputs.spending.desiredMonthlyNet = 200000; // huge spending → negative cashflow
    const years = project(s, defaultAssumptions);
    const y0 = years[0];
    expect(y0.flows.cashflowSurplus).toBeLessThan(0);
    expect(y0.flows.unallocatedCashflow).toBeCloseTo(0, 2);
  });

  it("planned vs cashflow: planned ends with lower or equal net worth than cashflow", () => {
    const sP = workingYear(makeBaseScenario());
    sP.inputs.savingsLogic = "planned";
    const sC = workingYear(makeBaseScenario());
    sC.inputs.savingsLogic = "cashflow";
    const yP = project(sP, defaultAssumptions);
    const yC = project(sC, defaultAssumptions);
    expect(yC[yC.length - 1].netWorth).toBeGreaterThan(yP[yP.length - 1].netWorth);
  });

  it("sanity check surfaces savings logic + unallocated cashflow", () => {
    const s = workingYear(makeBaseScenario());
    s.inputs.savingsLogic = "planned";
    const years = project(s, defaultAssumptions);
    const checks = sanityChecks(s, years);
    expect(checks.find((c) => c.id === "savings-logic-explain")).toBeTruthy();
    expect(checks.find((c) => c.id === "unallocated-cashflow")).toBeTruthy();
  });

  it("audit fields investedAmount and unallocatedCashflow are exposed per year", () => {
    const s = workingYear(makeBaseScenario());
    s.inputs.savingsLogic = "hybrid";
    const years = project(s, defaultAssumptions);
    for (const y of years) {
      expect(typeof y.flows.investedAmount).toBe("number");
      expect(typeof y.flows.unallocatedCashflow).toBe("number");
      expect(y.flows.unallocatedCashflow).toBeGreaterThanOrEqual(0);
    }
  });
});
