import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";

function workingScenario() {
  const s = makeBaseScenario();
  s.inputs.spending.desiredMonthlyNet = 10000;
  s.inputs.free.monthlyContribution = 5000;
  s.inputs.free.annualExtraContribution = 0;
  return s;
}

describe("Opsparing & cashflow v1 — cashflow bridge", () => {
  it("eksponerer cashflow bridge på alle år", () => {
    const s = workingScenario();
    const years = project(s, defaultAssumptions);
    for (const y of years) {
      expect(y.flows.cashflowBridge).toBeDefined();
      const b = y.flows.cashflowBridge!;
      expect(b.totalIncomeToCashflow).toBeCloseTo(b.baseIncomeNet + b.lifeEventIncome, 1);
      expect(b.cashflowBeforeSavings).toBeCloseTo(
        b.totalIncomeToCashflow - y.flows.spending - y.flows.debtInterest - y.flows.debtPrincipal,
        1,
      );
    }
  });
});

describe("Opsparing & cashflow v1 — investér alt disponibelt cashflow", () => {
  it("investerer hele cashflow, ingen separat surplus til buffer", () => {
    const s = workingScenario();
    s.inputs.cashflowAllocation = {
      surplusPolicy: "toBuffer", // skal ignoreres
      bufferTarget: null,
      plannedInvestmentMethod: "cashflow",
    };
    const initialBuffer = s.inputs.free.cashBuffer ?? 0;
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.investedAmount).toBeGreaterThan(0);
    // Buffer må ikke have modtaget penge fra surplus-policy.
    expect(y0.closing.buffer).toBeCloseTo(initialBuffer, 0);
    expect(y0.flows.surplusAllocation?.toBuffer ?? 0).toBeLessThanOrEqual(0.5);
  });
});

describe("Opsparing & cashflow v1 — planlagt opsparing kan ikke dækkes", () => {
  function tightScenario() {
    const s = makeBaseScenario();
    // Stort planlagt beløb, så cashflow ikke kan dække
    s.inputs.free.monthlyContribution = 100000;
    s.inputs.free.annualExtraContribution = 0;
    s.inputs.spending.desiredMonthlyNet = 25000;
    s.inputs.free.cashBuffer = 200000;
    s.inputs.free.bufferUsableForShortfall = false;
    return s;
  }

  it("capToCashflow: investerer kun disponibelt cashflow; unmet > 0; ingen forbrugs-shortfall", () => {
    const s = tightScenario();
    s.inputs.cashflowAllocation = {
      surplusPolicy: "outOfModel",
      bufferTarget: null,
      plannedInvestmentMethod: "planned",
      plannedShortfallPolicy: "capToCashflow",
    };
    const y0 = project(s, defaultAssumptions)[0];
    const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
    expect(y0.flows.investedAmount).toBeCloseTo(Math.max(0, cf), 0);
    expect(y0.flows.plannedSavingsShortfall).toBeDefined();
    expect(y0.flows.plannedSavingsShortfall!.unmetPlannedInvestment).toBeGreaterThan(0);
    expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5); // intet forbrugs-shortfall
  });

  it("useBuffer: bruger buffer; rest vises som unmet; ingen forbrugs-shortfall", () => {
    const s = tightScenario();
    s.inputs.free.cashBuffer = 50000; // begrænset buffer
    s.inputs.cashflowAllocation = {
      surplusPolicy: "outOfModel",
      bufferTarget: null,
      plannedInvestmentMethod: "planned",
      plannedShortfallPolicy: "useBuffer",
    };
    const y0 = project(s, defaultAssumptions)[0];
    const ps = y0.flows.plannedSavingsShortfall!;
    expect(ps.coveredByBuffer).toBeGreaterThan(0);
    expect(ps.coveredByBuffer).toBeLessThanOrEqual(50000 + 0.5);
    expect(y0.flows.investedAmount).toBeCloseTo(ps.availableCashflow + ps.coveredByBuffer, 0);
    expect(ps.unmetPlannedInvestment).toBeGreaterThan(0);
    expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5);
  });

  it("showShortfall: viser manglende opsparing — påvirker ikke shortfallAmount", () => {
    const s = tightScenario();
    s.inputs.cashflowAllocation = {
      surplusPolicy: "outOfModel",
      bufferTarget: null,
      plannedInvestmentMethod: "planned",
      plannedShortfallPolicy: "showShortfall",
    };
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.plannedSavingsShortfall?.unmetPlannedInvestment ?? 0).toBeGreaterThan(0);
    expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5);
  });
});

describe("Opsparing & cashflow v1 — invariant", () => {
  it("faktisk investering må ikke overstige cashflow + buffer-dækning", () => {
    const s = workingScenario();
    s.inputs.cashflowAllocation = {
      surplusPolicy: "toBuffer",
      bufferTarget: null,
      plannedInvestmentMethod: "planned",
      plannedShortfallPolicy: "capToCashflow",
    };
    const years = project(s, defaultAssumptions);
    for (const y of years) {
      const cf = y.flows.cashflowBridge?.cashflowBeforeSavings ?? 0;
      const covered = y.flows.plannedSavingsShortfall?.coveredByBuffer ?? 0;
      expect(y.flows.investedAmount).toBeLessThanOrEqual(Math.max(0, cf) + covered + 1);
    }
  });
});

describe("Opsparing & cashflow v1 — source of truth", () => {
  it("plannedInvestmentMethod overskygger legacy savingsLogic", () => {
    const sA = workingScenario();
    sA.inputs.savingsLogic = "planned";
    sA.inputs.cashflowAllocation = {
      surplusPolicy: "investExtra",
      bufferTarget: null,
      plannedInvestmentMethod: "cashflow",
    };
    const sB = workingScenario();
    sB.inputs.savingsLogic = "cashflow";
    sB.inputs.cashflowAllocation = {
      surplusPolicy: "investExtra",
      bufferTarget: null,
      plannedInvestmentMethod: "cashflow",
    };
    const yA = project(sA, defaultAssumptions);
    const yB = project(sB, defaultAssumptions);
    expect(yA[0].flows.investedAmount).toBeCloseTo(yB[0].flows.investedAmount, 0);
    expect(yA[yA.length - 1].netWorth).toBeCloseTo(yB[yB.length - 1].netWorth, 0);
  });
});

describe("Opsparing & cashflow v1 — negativt cashflow bruger eksisterende shortfall", () => {
  it("cashflow før opsparing < 0 → drainShortfall, ingen planlagt investering", () => {
    const s = makeBaseScenario();
    s.inputs.spending.desiredMonthlyNet = 200000;
    s.inputs.cashflowAllocation = {
      surplusPolicy: "outOfModel",
      bufferTarget: null,
      plannedInvestmentMethod: "planned",
      plannedShortfallPolicy: "capToCashflow",
    };
    const y0 = project(s, defaultAssumptions)[0];
    expect(y0.flows.cashflowBridge!.cashflowBeforeSavings).toBeLessThan(0);
    // Ingen planlagt investering når cashflow er negativt
    expect(y0.flows.investedAmount).toBeLessThanOrEqual(0.5);
    expect(y0.flows.plannedSavingsShortfall).toBeUndefined();
  });
});
