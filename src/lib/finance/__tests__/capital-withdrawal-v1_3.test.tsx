/**
 * Kapitaludtræk v1.3 — fjern "Legacy" fra UI, ny "Træk kun ved behov"-policy
 * og brugerforståelige policy-labels.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Inputs from "@/pages/Inputs";
import Assumptions from "@/pages/Assumptions";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { project } from "@/lib/finance/projection";
import type { Scenario } from "@/lib/finance/types";

function mkScenario(): Scenario {
  const s = makeBaseScenario();
  s.inputs.person.currentAge = 50;
  s.inputs.person.lifeExpectancy = 70;
  s.inputs.stopAge = 50;
  s.inputs.fullRetireAge = 50;
  s.inputs.income.salaryGross = 0;
  s.inputs.income.partTime = { mode: "gross_annual", grossAnnual: 0, netMonthly: 0, fromAge: 99, untilAge: 99 };
  s.inputs.income.familyFundAnnualNet = 0;
  s.inputs.income.familyFundUntilAge = 0;
  s.inputs.income.statePension = { mode: "none", fromAge: 67, baseGrossAnnual: 0, effectiveTaxRate: 0, manualNetAnnual: 0 };
  s.inputs.spending.desiredMonthlyNet = 0;
  s.inputs.debts = [];
  s.inputs.holding.balance = 500_000;
  s.inputs.holding.expectedExitValue = 500_000;
  s.inputs.holding.annualDistribution = 0;
  s.inputs.free.balance = 300_000;
  s.inputs.free.monthlyContribution = 0;
  s.inputs.free.annualExtraContribution = 0;
  s.inputs.pension.balance = 0;
  s.inputs.pension.employerContribution = 0;
  s.inputs.pension.monthlyContribution = 0;
  return s;
}

describe("Kapitaludtræk v1.3 — UI uden 'Legacy'", () => {
  it("Inputs viser ikke 'Legacy'", () => {
    const { container } = render(<MemoryRouter><Inputs /></MemoryRouter>);
    expect(container.innerHTML).not.toMatch(/Legacy/);
  });
  it("Assumptions viser ikke 'Legacy'", () => {
    const { container } = render(<MemoryRouter><Assumptions /></MemoryRouter>);
    expect(container.innerHTML).not.toMatch(/Legacy/);
  });
  it("Depot-skat-optionen vises som 'Uden eksplicit depot-skat'", () => {
    const { container } = render(<MemoryRouter><Inputs /></MemoryRouter>);
    expect(container.innerHTML).toContain("Uden eksplicit depot-skat");
  });
});

describe("Kapitaludtræk v1.3 — policy labels", () => {
  it("indeholder de tre brugerforståelige policy-labels", () => {
    const { container } = render(<MemoryRouter><Inputs /></MemoryRouter>);
    const html = container.innerHTML;
    expect(html).toContain("Træk kun ved behov");
    expect(html).toContain("Fast årligt brutto kapitaludtræk");
    expect(html).toContain("Udnyt lav personlig aktieindkomstgrænse");
    expect(html).not.toContain("Ingen planlagt årligt kapitaludtræk");
  });
});

describe("Kapitaludtræk v1.3 — 'Træk kun ved behov'", () => {
  it("ingen cashflow-shortfall → ingen kapital trækkes ud", () => {
    const s = mkScenario();
    s.inputs.spending.desiredMonthlyNet = 0;
    s.inputs.capitalWithdrawal = {
      strategy: "holdingFirst",
      plannedWithdrawalPolicy: "none",
      plannedWithdrawalAmount: 0,
      startAge: null,
      startAtStopAge: false,
    };
    const y0 = project(s, defaultAssumptions)[0];
    const cw = y0.flows.capitalWithdrawal!;
    expect(cw.totalGross).toBe(0);
    expect(cw.totalNet).toBe(0);
    expect(cw.grossBySource.holding).toBe(0);
    expect(cw.grossBySource.depot).toBe(0);
  });

  it("cashflow-shortfall → kun nødvendigt beløb hæves efter valgt rækkefølge", () => {
    const s = mkScenario();
    s.inputs.spending.desiredMonthlyNet = 10000; // 120k/år
    s.inputs.capitalWithdrawal = {
      strategy: "holdingFirst",
      plannedWithdrawalPolicy: "none",
      plannedWithdrawalAmount: 0,
      startAge: null,
      startAtStopAge: false,
    };
    const y0 = project(s, defaultAssumptions)[0];
    const cw = y0.flows.capitalWithdrawal!;
    expect(cw.totalNet).toBeGreaterThan(0);
    // Holding bruges først ifølge strategi
    expect(cw.grossBySource.holding).toBeGreaterThan(0);
    expect(cw.effectiveOrder[0]).toBe("holding");
  });
});

describe("Kapitaludtræk v1.3 — audit policy-label", () => {
  it("audit indeholder plannedAmount-felt", () => {
    const s = mkScenario();
    s.inputs.capitalWithdrawal = {
      strategy: "holdingFirst",
      plannedWithdrawalPolicy: "fixedAnnual",
      plannedWithdrawalAmount: 60_000,
      startAge: 50,
      startAtStopAge: false,
    };
    const y0 = project(s, defaultAssumptions)[0];
    const cw = y0.flows.capitalWithdrawal!;
    expect(cw.plannedAmount).toBe(60_000);
    expect(cw.plannedPolicy).toBe("fixedAnnual");
  });
});
