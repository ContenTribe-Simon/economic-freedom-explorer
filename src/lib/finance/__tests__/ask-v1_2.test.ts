/**
 * ASK v1.2 — eksplicit og konfigurerbar nedsparingsrækkefølge.
 */
import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import type { AskInputs, AskWithdrawalStrategy } from "../types";

const mkAsk = (overrides: Partial<AskInputs> = {}): AskInputs => ({
  enabled: true,
  currentValue: 0,
  priorYearEndValue: 0,
  depositLimit: 174_200,
  taxRate: 0.17,
  autoFillFirst: false,
  taxCreditCarryForward: 0,
  taxPaymentMode: "deductFromASK",
  ...overrides,
});

function shortfallScenario(strategy?: AskWithdrawalStrategy, askValue = 100_000, depotValue = 100_000) {
  const s = makeBaseScenario();
  // Trigger withdrawals: stop arbejde tidligt og høj spending uden andre indtægter.
  s.inputs.person.currentAge = 50;
  s.inputs.person.lifeExpectancy = 55;
  s.inputs.stopAge = 50;
  s.inputs.fullRetireAge = 50;
  s.inputs.income.salaryGross = 0;
  s.inputs.income.partTime = { mode: "gross_annual", grossAnnual: 0, netMonthly: 0, fromAge: 99, untilAge: 99 };
  s.inputs.income.familyFundAnnualNet = 0;
  s.inputs.income.familyFundUntilAge = 0;
  s.inputs.income.statePension = { mode: "none", fromAge: 67, baseGrossAnnual: 0, effectiveTaxRate: 0, manualNetAnnual: 0 };
  s.inputs.spending.desiredMonthlyNet = 5_000; // 60k/år
  s.inputs.holding.balance = 0;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.holding.annualDistribution = 0;
  s.inputs.pension.balance = 0;
  s.inputs.pension.employerContribution = 0;
  s.inputs.pension.monthlyContribution = 0;
  s.inputs.pension.ratePensionEnabled = false;
  s.inputs.pension.lifeAnnuity.enabled = false;
  s.inputs.debts = [];
  s.inputs.free.balance = askValue + depotValue;
  s.inputs.free.monthlyContribution = 0;
  s.inputs.free.annualExtraContribution = 0;
  s.inputs.free.ask = mkAsk({
    currentValue: askValue,
    priorYearEndValue: askValue,
    withdrawalStrategy: strategy,
  });
  return s;
}

describe("ASK v1.2 — withdrawal strategy", () => {
  it("default for legacy ASK uden withdrawalStrategy = depotFirst", () => {
    const s = shortfallScenario(undefined, 100_000, 200_000);
    const years = project(s, defaultAssumptions);
    const y0 = years[0];
    expect(y0.flows.ask!.withdrawalStrategy).toBe("depotFirst");
    // Depot dækker hele udtrækket (60k < 200k), ASK uberørt.
    expect(y0.flows.ask!.withdrawal).toBe(0);
    expect(y0.flows.ask!.withdrawalFreeDepot).toBeGreaterThan(0);
  });

  it("scenarier helt uden ASK giver uændret projection", () => {
    const a = makeBaseScenario();
    const b = makeBaseScenario();
    b.inputs.free.ask = undefined;
    const ya = project(a, defaultAssumptions);
    const yb = project(b, defaultAssumptions);
    expect(yb.map((y) => y.netWorth)).toEqual(ya.map((y) => y.netWorth));
  });

  it("depotFirst: depot dækker hele udtræk → ASK-udtræk = 0", () => {
    const s = shortfallScenario("depotFirst", 50_000, 500_000);
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.ask!.withdrawal).toBe(0);
    expect(y0.flows.ask!.withdrawalFreeDepot).toBeGreaterThan(0);
  });

  it("depotFirst: depot for lavt → resten trækkes fra ASK", () => {
    const s = shortfallScenario("depotFirst", 200_000, 20_000);
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.ask!.withdrawalFreeDepot).toBeGreaterThan(0);
    expect(y0.flows.ask!.withdrawal).toBeGreaterThan(0);
    expect(y0.flows.ask!.withdrawalFreeDepot).toBeCloseTo(20_000, 0);
  });

  it("askFirst: ASK dækker hele udtræk → depot-udtræk = 0", () => {
    const s = shortfallScenario("askFirst", 500_000, 100_000);
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.ask!.withdrawalFreeDepot).toBe(0);
    expect(y0.flows.ask!.withdrawal).toBeGreaterThan(0);
  });

  it("askFirst: ASK for lav → resten trækkes fra depot", () => {
    const s = shortfallScenario("askFirst", 20_000, 200_000);
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.ask!.withdrawal).toBeGreaterThan(0);
    expect(y0.flows.ask!.withdrawalFreeDepot).toBeGreaterThan(0);
    // ASK skal være drænet (op til startsaldo ~20k).
    expect(y0.flows.ask!.withdrawal).toBeCloseTo(20_000, 0);
  });

  it("proRata: fordeler udtræk proportionalt", () => {
    const s = shortfallScenario("proRata", 100_000, 100_000);
    const y0 = project(s, defaultAssumptions)[0];
    const total = y0.flows.ask!.withdrawal + y0.flows.ask!.withdrawalFreeDepot;
    expect(total).toBeGreaterThan(0);
    // Lige fordeling ved 50/50 primo.
    expect(y0.flows.ask!.withdrawal).toBeCloseTo(total / 2, 0);
    expect(y0.flows.ask!.withdrawalFreeDepot).toBeCloseTo(total / 2, 0);
  });

  it("proRata: samlet udtræk matcher samlet free-withdrawal", () => {
    const s = shortfallScenario("proRata", 100_000, 100_000);
    const y0 = project(s, defaultAssumptions)[0];
    const total = y0.flows.ask!.withdrawal + y0.flows.ask!.withdrawalFreeDepot;
    expect(total).toBeCloseTo(y0.flows.withdrawals.free, 0);
  });

  it("audit: rapporterer valgt strategi", () => {
    for (const strat of ["depotFirst", "askFirst", "proRata"] as const) {
      const s = shortfallScenario(strat, 100_000, 100_000);
      const y0 = project(s, defaultAssumptions)[0];
      expect(y0.flows.ask!.withdrawalStrategy).toBe(strat);
    }
  });
});
