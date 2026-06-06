import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import type { CashflowSurplusPolicy } from "../types";

function workingScenario(policy: CashflowSurplusPolicy, bufferTarget: number | null = null) {
  const s = makeBaseScenario();
  s.inputs.savingsLogic = "planned";
  s.inputs.spending.desiredMonthlyNet = 10000; // sikrer positivt overskud
  s.inputs.free.monthlyContribution = 5000;
  s.inputs.free.annualExtraContribution = 0;
  s.inputs.cashflowAllocation = { surplusPolicy: policy, bufferTarget };
  return s;
}

describe("Cashflow allocation v1 — surplus håndtering", () => {
  it("default (undefined) bevarer gammel adfærd: unallocated > 0", () => {
    const s = makeBaseScenario();
    s.inputs.savingsLogic = "planned";
    s.inputs.spending.desiredMonthlyNet = 10000;
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.unallocatedCashflow).toBeGreaterThan(0);
  });

  it("toBuffer: overskud lægges til buffer, unallocated = 0", () => {
    const s = workingScenario("toBuffer");
    const initialBuffer = s.inputs.free.cashBuffer ?? 0;
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.unallocatedCashflow).toBe(0);
    expect(y0.flows.surplusAllocation?.policy).toBe("toBuffer");
    expect(y0.flows.surplusAllocation!.toBuffer).toBeGreaterThan(0);
    expect(y0.closing.buffer).toBeGreaterThan(initialBuffer);
  });

  it("bufferThenInvest: fylder buffer til mål, resten investeres", () => {
    const s = workingScenario("bufferThenInvest", (s => 0)(0));
    // sæt et lavt mål så resten investeres
    const initBuf = s.inputs.free.cashBuffer ?? 0;
    s.inputs.cashflowAllocation = { surplusPolicy: "bufferThenInvest", bufferTarget: initBuf + 1000 };
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.surplusAllocation?.toBuffer).toBeCloseTo(1000, 0);
    expect(y0.flows.surplusAllocation?.toFreeInvestment).toBeGreaterThan(0);
    expect(y0.flows.unallocatedCashflow).toBe(0);
  });

  it("investExtra: overskud investeres i fri kapital", () => {
    const s = workingScenario("investExtra");
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.unallocatedCashflow).toBe(0);
    expect(y0.flows.surplusAllocation?.toFreeInvestment).toBeGreaterThan(0);
    // freeContribution > planlagt opsparing
    expect(y0.flows.freeContribution).toBeGreaterThan(y0.flows.plannedFreeContribution);
  });

  it("extraSpending: registreres som ekstra forbrug, buffer/fri urørt", () => {
    const s = workingScenario("extraSpending");
    const baseBuffer = s.inputs.free.cashBuffer ?? 0;
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.unallocatedCashflow).toBe(0);
    expect(y0.flows.surplusAllocation?.extraSpending).toBeGreaterThan(0);
    expect(y0.closing.buffer).toBeCloseTo(baseBuffer, 0);
  });

  it("outOfModel: eksplicit valg viser unallocated > 0", () => {
    const s = workingScenario("outOfModel");
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.unallocatedCashflow).toBeGreaterThan(0);
    expect(y0.flows.surplusAllocation?.outOfModel).toBeGreaterThan(0);
  });

  it("toBuffer giver højere nettoformue end outOfModel", () => {
    const sA = workingScenario("toBuffer");
    const sB = workingScenario("outOfModel");
    const yA = project(sA, defaultAssumptions);
    const yB = project(sB, defaultAssumptions);
    expect(yA[yA.length - 1].netWorth).toBeGreaterThan(yB[yB.length - 1].netWorth);
  });

  it("ingen surplus → ingen surplusAllocation audit", () => {
    const s = makeBaseScenario();
    s.inputs.savingsLogic = "planned";
    s.inputs.spending.desiredMonthlyNet = 200000; // negativ cashflow
    s.inputs.cashflowAllocation = { surplusPolicy: "toBuffer", bufferTarget: null };
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.surplusAllocation).toBeUndefined();
  });
});
