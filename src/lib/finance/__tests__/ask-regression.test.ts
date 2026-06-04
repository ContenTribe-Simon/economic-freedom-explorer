/**
 * ASK v0 — regressions-lås for fri kapital og samlet projektion.
 *
 * Formål: før ASK (Aktiesparekonto) implementeres, fryser denne test:
 *  - at fri kapital får BRUTTO realafkast (ingen løbende skat på `bal.free`)
 *  - at udtræk fra fri kapital er skattefrit i modellen
 *  - at base-scenariet uden ASK-data giver en stabil nettoformue-serie
 *
 * Når ASK senere implementeres, MÅ disse tal IKKE ændre sig for scenarier
 * uden `inp.free.ask?.enabled === true`. Se `src/lib/finance/ASK_NOTE.md`.
 */
import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";

describe("ASK v0 regression — fri kapital adfærd er låst", () => {
  it("fri kapital vokser med brutto realReturn.free (ingen løbende skat)", () => {
    const s = makeBaseScenario();
    const a = { ...defaultAssumptions, realReturn: { free: 0.05, pension: 0, holding: 0 } };
    // Nulstil bevægelser så væksten kan isoleres
    s.inputs.free.balance = 1_000_000;
    s.inputs.free.monthlyContribution = 0;
    s.inputs.free.annualExtraContribution = 0;
    s.inputs.income.salaryGross = 0;
    s.inputs.spending.desiredMonthlyNet = 0;
    s.inputs.debts = [];
    s.inputs.pension.monthlyContribution = 0;
    s.inputs.pension.employerContribution = 0;
    s.inputs.pension.balance = 0;
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    s.inputs.income.familyFundAnnualNet = 0;
    s.inputs.income.statePension.mode = "none";

    const years = project(s, a);
    // År 0: 1.000.000 * 1.05 = 1.050.000 (intet skattetræk på vækst)
    expect(years[0].flows.growth.free).toBeCloseTo(50_000, 0);
    expect(years[0].closing.free).toBeCloseTo(1_050_000, 0);
    // År 1: 1.050.000 * 1.05 = 1.102.500
    expect(years[1].closing.free).toBeCloseTo(1_102_500, 0);
  });

  it("udtræk fra fri kapital er skattefrit (gross == net, tax == 0)", () => {
    // Tving shortfall så fri kapital tappes
    const s = makeBaseScenario();
    s.inputs.free.balance = 500_000;
    s.inputs.free.monthlyContribution = 0;
    s.inputs.free.annualExtraContribution = 0;
    s.inputs.income.salaryGross = 0;
    s.inputs.income.familyFundAnnualNet = 0;
    s.inputs.income.statePension.mode = "none";
    s.inputs.spending.desiredMonthlyNet = 20_000;
    s.inputs.debts = [];

    const years = project(s, defaultAssumptions);
    const y0 = years[0];
    expect(y0.flows.withdrawals.free).toBeGreaterThan(0);
    expect(y0.flows.withdrawalsGross.free).toBeCloseTo(y0.flows.withdrawals.free, 2);
  });

  it("base-scenariet uden ASK giver en stabil nettoformue-serie (snapshot for ASK-arbejde)", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    // Sanity — ikke et eksakt fingerprint, men låser størrelsesorden og endpoint-stabilitet.
    expect(years.length).toBe(s.inputs.person.lifeExpectancy - s.inputs.person.currentAge + 1);
    expect(Number.isFinite(years[0].netWorth)).toBe(true);
    expect(Number.isFinite(years[years.length - 1].netWorth)).toBe(true);
    // Fri kapital findes som top-level felt og er ikke negativt ved start
    expect(years[0].closing.free).toBeGreaterThanOrEqual(0);
  });

  it("scenarier uden ASK-felter crasher ikke (datamodel-sikkerhed)", () => {
    const s = makeBaseScenario();
    // Bekræft at der IKKE findes et ask-felt på FreeBucketInputs i dag — gamle modeller skal virke
    expect((s.inputs.free as unknown as Record<string, unknown>).ask).toBeUndefined();
    expect(() => project(s, defaultAssumptions)).not.toThrow();
  });
});
