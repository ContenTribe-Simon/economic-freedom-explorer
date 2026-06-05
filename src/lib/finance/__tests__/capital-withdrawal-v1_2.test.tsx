/**
 * Kapitaludtræk v1.2 — UI labels og ny pensionThenHolding-strategi.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Inputs from "@/pages/Inputs";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { project } from "@/lib/finance/projection";
import { resolveOrder } from "@/lib/finance/capitalWithdrawal";
import type { Scenario } from "@/lib/finance/types";

function mkShortfall(): Scenario {
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
  s.inputs.spending.desiredMonthlyNet = 10000;
  s.inputs.debts = [];
  s.inputs.holding.balance = 500_000;
  s.inputs.holding.expectedExitValue = 500_000;
  s.inputs.holding.annualDistribution = 0;
  s.inputs.free.balance = 300_000;
  s.inputs.free.monthlyContribution = 0;
  s.inputs.free.annualExtraContribution = 0;
  s.inputs.pension.balance = 1_000_000;
  s.inputs.pension.employerContribution = 0;
  s.inputs.pension.monthlyContribution = 0;
  return s;
}

describe("Kapitaludtræk v1.2 — UI labels", () => {
  it("Inputs viser ikke ordet 'Legacy' nogensteds", () => {
    const { container } = render(
      <MemoryRouter>
        <Inputs />
      </MemoryRouter>,
    );
    expect(container.innerHTML).not.toMatch(/Legacy/);
  });

  it("Kapitaludtræk-section har tydelige labels", () => {
    const { container } = render(
      <MemoryRouter>
        <Inputs />
      </MemoryRouter>,
    );
    const html = container.innerHTML;
    expect(html).toContain("Udtræksrækkefølge");
    expect(html).toContain("Planlagt årligt kapitaludtræk");
    // Ny strategi-option synlig
    expect(html).toContain("Pension (når tilgængelig) → Holding → Almindeligt depot → ASK");
  });
});

describe("Kapitaludtræk v1.2 — pensionThenHolding", () => {
  it("resolveOrder returnerer pension → holding → depot → ask", () => {
    expect(resolveOrder("pensionThenHolding", undefined)).toEqual(["pension", "holding", "depot", "ask"]);
  });

  it("før pensionsalder: holding bruges før depot (pension springes over)", () => {
    const s = mkShortfall();
    s.inputs.pension.payoutFromAge = 65; // ikke tilgængelig ved 50
    s.inputs.capitalWithdrawal = {
      strategy: "pensionThenHolding",
      plannedWithdrawalPolicy: "none",
      plannedWithdrawalAmount: 0,
      startAge: null,
      startAtStopAge: false,
    };
    const y0 = project(s, defaultAssumptions)[0];
    const cw = y0.flows.capitalWithdrawal!;
    expect(cw.grossBySource.pension).toBe(0);
    expect(cw.grossBySource.holding).toBeGreaterThan(0);
    expect(cw.grossBySource.depot).toBeLessThan(1);
    expect(cw.effectiveOrder[0]).toBe("holding");
  });

  it("efter pensionsalder: pension bruges først", () => {
    const s = mkShortfall();
    s.inputs.person.currentAge = 70;
    s.inputs.person.lifeExpectancy = 80;
    s.inputs.stopAge = 70;
    s.inputs.fullRetireAge = 70;
    s.inputs.pension.payoutFromAge = 65;
    s.inputs.capitalWithdrawal = {
      strategy: "pensionThenHolding",
      plannedWithdrawalPolicy: "none",
      plannedWithdrawalAmount: 0,
      startAge: null,
      startAtStopAge: false,
    };
    const y0 = project(s, defaultAssumptions)[0];
    const cw = y0.flows.capitalWithdrawal!;
    expect(cw.grossBySource.pension).toBeGreaterThan(0);
    expect(cw.grossBySource.holding).toBe(0);
    expect(cw.effectiveOrder[0]).toBe("pension");
  });
});

describe("Kapitaludtræk v1.2 — startAge vs startAtStopAge", () => {
  it("startAtStopAge=true bruger stopAge som startalder uanset eksplicit startAge", () => {
    const s = mkShortfall();
    s.inputs.stopAge = 50;
    s.inputs.holding.annualDistribution = 0;
    s.inputs.capitalWithdrawal = {
      strategy: "holdingFirst",
      plannedWithdrawalPolicy: "fixedAnnual",
      plannedWithdrawalAmount: 50_000,
      startAge: 99, // skal IGNORERES når startAtStopAge=true
      startAtStopAge: true,
    };
    const y0 = project(s, defaultAssumptions)[0];
    const cw = y0.flows.capitalWithdrawal!;
    expect(cw.startAge).toBe(50);
    expect(cw.grossBySource.holding).toBeGreaterThan(0);
  });
});
