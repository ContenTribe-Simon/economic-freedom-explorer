import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { deriveKPIs } from "../kpis";
import { sanityChecks } from "../sanity";
import { DebtItem, Scenario } from "../types";

function withHoldingDebt(financing: DebtItem["holdingFinancing"], opts: { holdingBalance?: number; freeBalance?: number } = {}): Scenario {
  const s = makeBaseScenario();
  s.inputs.holding.balance = opts.holdingBalance ?? 0;
  s.inputs.free.balance = opts.freeBalance ?? 0;
  s.inputs.debts = [
    {
      id: "hd-test",
      name: "Holdinggæld test",
      kind: "holding",
      balance: 1_000_000,
      interestRate: 0.05,
      monthlyPayment: 8000,
      impact: "holding",
      includeInNetWorth: true,
      holdingFinancing: financing,
    },
  ];
  return s;
}

describe("holdinggæld – finansieringskilde", () => {
  it("ekstern finansiering: ingen holding-shortfall uanset kapital", () => {
    for (const free of [0, 5_000_000]) {
      const s = withHoldingDebt("external_company", { holdingBalance: 0, freeBalance: free });
      const years = project(s, defaultAssumptions);
      const kpis = deriveKPIs(s, years, defaultAssumptions);
      const totalShortfall = years.reduce((sum, y) => sum + (y.flows.holdingFinancingShortfall ?? 0), 0);

      expect(totalShortfall).toBe(0);
      expect(kpis.unfinancedHoldingDebt).toBe(0);
      expect(kpis.unfinancedHoldingYears).toBe(0);
      // Første finansieringsproblem må ikke skyldes denne gæld
      expect(kpis.firstFinancingIssueAge).toBeNull();

      const sanity = sanityChecks(s, years);
      expect(sanity.find((c) => c.id === "holding-financing-short")).toBeUndefined();
      expect(sanity.find((c) => c.id === "holding-debt-external")).toBeDefined();
    }
  });

  it("holdingkapital-finansiering med tom holding: udløser shortfall-warning", () => {
    const s = withHoldingDebt("holding_capital", { holdingBalance: 0, freeBalance: 0 });
    const years = project(s, defaultAssumptions);
    const totalShortfall = years.reduce((sum, y) => sum + (y.flows.holdingFinancingShortfall ?? 0), 0);
    const kpis = deriveKPIs(s, years, defaultAssumptions);

    expect(totalShortfall).toBeGreaterThan(0);
    expect(kpis.unfinancedHoldingYears).toBeGreaterThan(0);
    expect(kpis.firstFinancingIssueAge).not.toBeNull();
    expect(kpis.firstFinancingIssueKind).toMatch(/holding/i);

    const sanity = sanityChecks(s, years);
    expect(sanity.find((c) => c.id === "holding-financing-short")).toBeDefined();
  });
});
