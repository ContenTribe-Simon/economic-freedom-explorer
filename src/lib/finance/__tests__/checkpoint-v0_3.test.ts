/**
 * Stabiliserings-checkpoint for personal-fire-v0.3-stable.
 *
 * Disse tests fryser den nuværende baseline. De ændrer hverken model eller UI,
 * men beskytter mod utilsigtede regressioner i:
 *  - modelstatus valid/invalid
 *  - separat shortfall-/finansieringsproblem-logik
 *  - robusthedsscore
 *  - sparelogik (ikke-allokeret cashflow)
 *  - holding-/gældsfinansiering
 */
import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { deriveKPIs } from "../kpis";
import { sanityChecks } from "../sanity";
import { MODEL_RELEASE, MODEL_VERSION } from "../types";

function run(s: ReturnType<typeof makeBaseScenario>) {
  const years = project(s, defaultAssumptions);
  return { years, kpis: deriveKPIs(s, years, defaultAssumptions) };
}

describe("checkpoint: release labels", () => {
  it("MODEL_RELEASE matches the stable label", () => {
    expect(MODEL_RELEASE).toBe("personal-fire-v0.3-stable");
  });
  it("MODEL_VERSION numeric schema is still 1", () => {
    expect(MODEL_VERSION).toBe(1);
  });
});

describe("checkpoint: base case is valid", () => {
  it("base case is valid with no shortfall and no financing issue", () => {
    const s = makeBaseScenario();
    const { kpis } = run(s);
    expect(kpis.modelStatus).not.toBe("invalid");
    expect(kpis.firstShortfallAge).toBeNull();
    expect(kpis.firstFinancingIssueAge).toBeNull();
    expect(kpis.financialRobustness).toBeGreaterThan(25);
  });

  it("base case with holding exit value remains valid", () => {
    const s = makeBaseScenario();
    s.inputs.holding.expectedExitValue = 3_000_000;
    s.inputs.holding.exitYear = new Date().getFullYear() + 10;
    const { kpis } = run(s);
    expect(kpis.modelStatus).not.toBe("invalid");
    expect(kpis.firstFinancingIssueAge).toBeNull();
  });
});

describe("checkpoint: financing source distinctions", () => {
  it("holding debt with external_company financing produces no holding shortfall", () => {
    const s = makeBaseScenario();
    s.inputs.holding.balance = 0;
    const hd = s.inputs.debts.find((d) => d.kind === "holding")!;
    hd.balance = 2_000_000;
    hd.interestRate = 0.05;
    hd.monthlyPayment = 15_000;
    hd.holdingFinancing = "external_company";
    const { kpis } = run(s);
    expect(kpis.firstFinancingIssueAge).toBeNull();
    const checks = sanityChecks(s, project(s, defaultAssumptions), defaultAssumptions);
    expect(checks.find((c) => c.id === "holding-financing-short")).toBeUndefined();
  });

  it("missing financing (holding_capital with no holding balance) flags a financing issue", () => {
    const s = makeBaseScenario();
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    const hd = s.inputs.debts.find((d) => d.kind === "holding")!;
    hd.balance = 2_000_000;
    hd.interestRate = 0.05;
    hd.monthlyPayment = 15_000;
    hd.holdingFinancing = "holding_capital";
    const { kpis } = run(s);
    expect(kpis.firstFinancingIssueAge).not.toBeNull();
  });
});

describe("checkpoint: real shortfall scenarios", () => {
  it("very high spending creates a real private cashflow shortfall and invalid status", () => {
    const s = makeBaseScenario();
    s.inputs.spending.desiredMonthlyNet = 80_000;
    const { kpis } = run(s);
    expect(kpis.modelStatus).toBe("invalid");
    expect(kpis.firstShortfallAge).not.toBeNull();
    expect(kpis.financialRobustness).toBeLessThanOrEqual(25);
  });

  it("scenario with zero pension, holding and free capital is invalid", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 0;
    s.inputs.free.monthlyContribution = 0;
    s.inputs.free.annualExtraContribution = 0;
    s.inputs.free.cashBuffer = 0;
    s.inputs.pension.balance = 0;
    s.inputs.pension.monthlyContribution = 0;
    s.inputs.pension.employerContribution = 0;
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    s.inputs.holding.annualDistribution = 0;
    const { kpis } = run(s);
    expect(kpis.modelStatus).toBe("invalid");
    expect(kpis.financialRobustness).toBeLessThanOrEqual(25);
  });
});

describe("checkpoint: savings logic — unallocated cashflow", () => {
  it("planned logic can leave positive unallocated cashflow when surplus exceeds planned contributions", () => {
    const s = makeBaseScenario();
    s.inputs.savingsLogic = "planned";
    s.inputs.free.monthlyContribution = 0;
    s.inputs.free.annualExtraContribution = 0;
    s.inputs.spending.desiredMonthlyNet = 10_000;
    const { years } = run(s);
    const totalUnallocated = years.reduce((acc, y) => acc + (y.flows.unallocatedCashflow ?? 0), 0);
    expect(totalUnallocated).toBeGreaterThan(0);
  });
});
