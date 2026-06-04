/**
 * ASK v1 — implementeringstests.
 *
 * Dækker:
 *  - Backwards compatibility (uden ASK = uændret adfærd)
 *  - Ingen dobbelttælling af ASK i fri kapital
 *  - ASK-vækst og lagerskat
 *  - Negativt ASK-afkast og fremført negativ skat
 *  - Indskudsloft og auto-fill
 *  - Shortfall-rækkefølge (depot før ASK)
 *  - Audit-felter
 *  - Persistence via JSON roundtrip
 */
import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import type { AskInputs } from "../types";

const baseAsk = (overrides: Partial<AskInputs> = {}): AskInputs => ({
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

function isolatedScenario() {
  const s = makeBaseScenario();
  s.inputs.free.balance = 0;
  s.inputs.free.monthlyContribution = 0;
  s.inputs.free.annualExtraContribution = 0;
  s.inputs.free.cashBuffer = 0;
  s.inputs.income.salaryGross = 0;
  s.inputs.income.familyFundAnnualNet = 0;
  s.inputs.income.statePension.mode = "none";
  s.inputs.income.partTime = { mode: "net_monthly", grossAnnual: 0, netMonthly: 0, fromAge: 99, untilAge: 99 };
  s.inputs.pension.balance = 0;
  s.inputs.pension.monthlyContribution = 0;
  s.inputs.pension.employerContribution = 0;
  s.inputs.holding.balance = 0;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.spending.desiredMonthlyNet = 0;
  s.inputs.debts = [];
  return s;
}

describe("ASK v1 — backwards compatibility", () => {
  it("ask.enabled=false giver præcis samme resultater som uden ask-felt", () => {
    const a = { ...defaultAssumptions };
    const sA = makeBaseScenario();
    const sB = makeBaseScenario();
    sB.inputs.free.ask = baseAsk({ enabled: false, currentValue: 100_000 });
    const yA = project(sA, a);
    const yB = project(sB, a);
    expect(yB[0].closing.free).toBeCloseTo(yA[0].closing.free, 2);
    expect(yB[10].closing.free).toBeCloseTo(yA[10].closing.free, 2);
    expect(yB[20].netWorth).toBeCloseTo(yA[20].netWorth, 2);
    expect(yB[0].flows.ask).toBeUndefined();
  });
});

describe("ASK v1 — ingen dobbelttælling", () => {
  it("ASK trækkes fra fri kapital som 'heraf ASK', ikke lagt oveni", () => {
    const a = { ...defaultAssumptions, realReturn: { free: 0, pension: 0, holding: 0 } };
    const s = isolatedScenario();
    s.inputs.free.balance = 300_000;
    s.inputs.free.ask = baseAsk({ enabled: true, currentValue: 100_000, priorYearEndValue: 100_000 });
    const y = project(s, a);
    // closing.free skal være 300.000 — ikke 400.000
    expect(y[0].closing.free).toBeCloseTo(300_000, 2);
    expect(y[0].flows.ask!.closing).toBeCloseTo(100_000, 2);
    expect(y[0].flows.ask!.freeDepotClosing).toBeCloseTo(200_000, 2);
  });

  it("currentValue > total free clamps til total", () => {
    const a = { ...defaultAssumptions, realReturn: { free: 0, pension: 0, holding: 0 } };
    const s = isolatedScenario();
    s.inputs.free.balance = 100_000;
    s.inputs.free.ask = baseAsk({ enabled: true, currentValue: 500_000, priorYearEndValue: 500_000 });
    const y = project(s, a);
    expect(y[0].closing.free).toBeCloseTo(100_000, 2);
    expect(y[0].flows.ask!.closing).toBeCloseTo(100_000, 2);
    expect(y[0].flows.ask!.freeDepotClosing).toBeCloseTo(0, 2);
  });
});

describe("ASK v1 — vækst og lagerskat", () => {
  it("100.000 ASK ved 5% afkast giver 5.000 brutto og 850 skat", () => {
    const a = { ...defaultAssumptions, realReturn: { free: 0.05, pension: 0, holding: 0 } };
    const s = isolatedScenario();
    s.inputs.free.balance = 100_000;
    s.inputs.free.ask = baseAsk({ enabled: true, currentValue: 100_000, priorYearEndValue: 100_000 });
    const y = project(s, a);
    expect(y[0].flows.ask!.growthGross).toBeCloseTo(5_000, 2);
    expect(y[0].flows.ask!.tax).toBeCloseTo(850, 2);
    expect(y[0].flows.ask!.closing).toBeCloseTo(100_000 + 5_000 - 850, 2);
  });

  it("negativt ASK-afkast giver 0 skat og fremfører tab", () => {
    const a = { ...defaultAssumptions, realReturn: { free: -0.1, pension: 0, holding: 0 } };
    const s = isolatedScenario();
    s.inputs.free.balance = 100_000;
    s.inputs.free.ask = baseAsk({ enabled: true, currentValue: 100_000, priorYearEndValue: 100_000 });
    const y = project(s, a);
    expect(y[0].flows.ask!.tax).toBe(0);
    expect(y[0].flows.ask!.carryForwardEnd).toBeCloseTo(10_000, 2);
  });

  it("fremført tab modregnes i senere positive afkast", () => {
    const a = { ...defaultAssumptions, realReturn: { free: 0.05, pension: 0, holding: 0 } };
    const s = isolatedScenario();
    s.inputs.free.balance = 100_000;
    s.inputs.free.ask = baseAsk({
      enabled: true,
      currentValue: 100_000,
      priorYearEndValue: 100_000,
      taxCreditCarryForward: 3_000,
    });
    const y = project(s, a);
    // 5.000 gain - 3.000 carry = 2.000 skattepligtigt * 17% = 340
    expect(y[0].flows.ask!.carryForwardUsed).toBeCloseTo(3_000, 2);
    expect(y[0].flows.ask!.tax).toBeCloseTo(340, 2);
    expect(y[0].flows.ask!.carryForwardEnd).toBeCloseTo(0, 2);
  });
});

describe("ASK v1 — indskudsloft og auto-fill", () => {
  it("autoFillFirst lægger fri opsparing i ASK op til loftet", () => {
    const a = { ...defaultAssumptions, realReturn: { free: 0, pension: 0, holding: 0 } };
    const s = isolatedScenario();
    s.inputs.free.balance = 0;
    s.inputs.free.monthlyContribution = 5_000; // 60.000/år
    s.inputs.income.salaryGross = 500_000;
    s.inputs.free.ask = baseAsk({
      enabled: true,
      currentValue: 0,
      priorYearEndValue: 0,
      autoFillFirst: true,
    });
    const y = project(s, a);
    // Hele 60.000 går til ASK (under 174.200 loft)
    expect(y[0].flows.ask!.contribution).toBeCloseTo(60_000, 0);
    expect(y[0].flows.ask!.freeDepotClosing).toBeCloseTo(0, 0);
  });

  it("ASK over loftet pga. afkast tvinger ikke salg, men nye indskud blokeres", () => {
    const a = { ...defaultAssumptions, realReturn: { free: 0.05, pension: 0, holding: 0 } };
    const s = isolatedScenario();
    s.inputs.free.balance = 200_000;
    s.inputs.free.monthlyContribution = 5_000;
    s.inputs.income.salaryGross = 500_000;
    s.inputs.free.ask = baseAsk({
      enabled: true,
      currentValue: 200_000,
      priorYearEndValue: 200_000, // allerede over loft 174.200
      autoFillFirst: true,
    });
    const y = project(s, a);
    expect(y[0].flows.ask!.contribution).toBe(0);
    // Indskuddet går i stedet til almindeligt depot
    expect(y[0].flows.ask!.freeDepotClosing).toBeGreaterThan(0);
  });

  it("autoFillFirst=false sender hele opsparingen til depot som før", () => {
    const a = { ...defaultAssumptions, realReturn: { free: 0, pension: 0, holding: 0 } };
    const s = isolatedScenario();
    s.inputs.free.monthlyContribution = 5_000;
    s.inputs.income.salaryGross = 500_000;
    s.inputs.free.ask = baseAsk({ enabled: true, currentValue: 0, autoFillFirst: false });
    const y = project(s, a);
    expect(y[0].flows.ask!.contribution).toBe(0);
    expect(y[0].flows.ask!.freeDepotClosing).toBeGreaterThan(0);
  });
});

describe("ASK v1 — shortfall rækkefølge", () => {
  it("depot tømmes før ASK; samlet free-withdrawal er skattefri", () => {
    const a = { ...defaultAssumptions, realReturn: { free: 0, pension: 0, holding: 0 } };
    const s = isolatedScenario();
    s.inputs.person.currentAge = 60;
    s.inputs.stopAge = 55;
    s.inputs.fullRetireAge = 55;
    s.inputs.free.balance = 300_000;
    s.inputs.free.ask = baseAsk({ enabled: true, currentValue: 100_000, priorYearEndValue: 100_000 });
    s.inputs.spending.desiredMonthlyNet = 20_000; // 240.000/år shortfall
    const y = project(s, a);
    // Depot havde 200.000 → først helt drænet, så 40.000 fra ASK
    expect(y[0].flows.ask!.freeDepotClosing).toBeCloseTo(0, 0);
    expect(y[0].flows.ask!.withdrawal).toBeCloseTo(40_000, 0);
    // Stadig skattefri: gross == net
    expect(y[0].flows.withdrawalsGross.free).toBeCloseTo(y[0].flows.withdrawals.free, 2);
  });
});

describe("ASK v1 — JSON roundtrip", () => {
  it("ASK-data overlever JSON serialize/parse", () => {
    const s = isolatedScenario();
    s.inputs.free.ask = baseAsk({ enabled: true, currentValue: 50_000 });
    const json = JSON.stringify(s);
    const parsed = JSON.parse(json);
    expect(parsed.inputs.free.ask.enabled).toBe(true);
    expect(parsed.inputs.free.ask.currentValue).toBe(50_000);
    expect(() => project(parsed, defaultAssumptions)).not.toThrow();
  });
});
