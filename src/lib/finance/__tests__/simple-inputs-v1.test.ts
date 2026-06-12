/**
 * Simple public input mapping (v1) — proves the public/simple MVP input surface maps onto a
 * valid full `ScenarioInputs` (+ `Assumptions`) that the EXISTING engine projects correctly.
 *
 * This is a mapping layer only — no projection logic is duplicated; tests project via the real
 * `project()` engine. Assertions are relational (direction of change), not long-horizon exact
 * numbers.
 */
import { describe, it, expect } from "vitest";
import { project } from "../projection";
import { runModelValidation } from "../modelValidation";
import { runIntegrityChecks } from "../integrity";
import { defaultAssumptions } from "../defaults";
import {
  DEFAULT_SIMPLE_INPUTS,
  toAssumptions,
  toScenario,
  toScenarioInputs,
  type SimplePublicInputs,
} from "../simpleInputs";
import type { YearRow } from "../types";

/** Project a simple-input persona through the real engine and return the years. */
function projectSimple(s: SimplePublicInputs): YearRow[] {
  return project(toScenario(s), toAssumptions(s));
}

/**
 * Net worth at a specific age. Used for directional assertions: comparing the FINAL year is
 * unreliable because a persona can fully deplete to 0 by the end (so two variants both read 0,
 * differing only in *when* they deplete). A mid-horizon age reveals the accumulation difference.
 */
function netWorthAtAge(s: SimplePublicInputs, age: number): number {
  const y = projectSimple(s).find((r) => r.age === age);
  if (!y) throw new Error(`no projected year for age ${age}`);
  return y.netWorth;
}

function assertAllFinite(v: unknown, path = "root"): void {
  if (typeof v === "number") expect(Number.isFinite(v), `finite at ${path}`).toBe(true);
  else if (Array.isArray(v)) v.forEach((x, i) => assertAllFinite(x, `${path}[${i}]`));
  else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) assertAllFinite(val, `${path}.${k}`);
}

describe("Simple public inputs — mapping to the full model", () => {
  it("maps simple inputs onto a valid, complete ScenarioInputs with advanced surfaces off", () => {
    const inp = toScenarioInputs(DEFAULT_SIMPLE_INPUTS);

    // Public fields mapped onto the real model paths.
    expect(inp.person.currentAge).toBe(DEFAULT_SIMPLE_INPUTS.currentAge);
    expect(inp.person.lifeExpectancy).toBe(DEFAULT_SIMPLE_INPUTS.lifeExpectancy);
    expect(inp.income.salaryGross).toBe(DEFAULT_SIMPLE_INPUTS.annualIncome);
    expect(inp.spending.desiredMonthlyNet).toBe(DEFAULT_SIMPLE_INPUTS.monthlySpending);
    expect(inp.free.balance).toBe(DEFAULT_SIMPLE_INPUTS.currentInvestments);
    expect(inp.free.monthlyContribution).toBe(DEFAULT_SIMPLE_INPUTS.monthlySavings);
    expect(inp.pension.balance).toBe(DEFAULT_SIMPLE_INPUTS.pensionBalance);
    expect(inp.pension.payoutFromAge).toBe(DEFAULT_SIMPLE_INPUTS.pensionAccessAge);
    expect(inp.stopAge).toBe(DEFAULT_SIMPLE_INPUTS.desiredStopAge);
    expect(inp.fullRetireAge).toBe(DEFAULT_SIMPLE_INPUTS.desiredStopAge);
    expect(inp.target.minNetWorthAtEnd).toBe(0);

    // Advanced / Simon-specific surfaces are disabled in the simple mapping.
    expect(inp.holding.balance).toBe(0);
    expect(inp.holding.expectedExitValue).toBe(0);
    expect(inp.holding.annualDistribution).toBe(0);
    expect(inp.debts).toEqual([]);
    expect(inp.lifeEvents).toEqual([]);
    expect(inp.income.statePension.mode).toBe("none");
    expect(inp.income.partTime.netMonthly).toBe(0);
    expect(inp.income.partTime.grossAnnual).toBe(0);
    expect(inp.income.familyFundAnnualNet).toBe(0);
    expect(inp.pension.monthlyContribution).toBe(0);
    expect(inp.pension.employerContribution).toBe(0);
    expect(inp.pension.lifeAnnuity.enabled).toBe(false);
    expect(inp.free.cashBuffer).toBe(0);
    expect(inp.free.ask).toBeUndefined();
    expect(inp.free.depotTax).toBeUndefined();
    expect(inp.capitalWithdrawal).toBeUndefined();
    expect(inp.cashflowAllocation).toBeUndefined();
  });

  it("maps the single expected real return onto all per-bucket realReturn assumptions; nothing else changes", () => {
    const a = toAssumptions({ ...DEFAULT_SIMPLE_INPUTS, expectedRealReturn: 0.06 });
    expect(a.realReturn).toEqual({ free: 0.06, pension: 0.06, holding: 0.06 });
    // Other assumptions are taken unchanged from the existing defaults.
    expect(a.tax).toEqual(defaultAssumptions.tax);
    expect(a.inflation).toBe(defaultAssumptions.inflation);
    expect(a.withdrawOrder).toEqual(defaultAssumptions.withdrawOrder);
  });

  it("projects without crashing and produces finite values across the whole horizon", () => {
    const years = projectSimple(DEFAULT_SIMPLE_INPUTS);
    expect(years.length).toBeGreaterThan(0);
    expect(years[0].age).toBe(DEFAULT_SIMPLE_INPUTS.currentAge);
    expect(years[years.length - 1].age).toBe(DEFAULT_SIMPLE_INPUTS.lifeExpectancy);
    assertAllFinite(years.map((y) => ({ nw: y.netWorth, ...y.closing, short: y.shortfallAmount })));
  });

  it("passes the engine's own validation + integrity oracles", () => {
    const s = toScenario(DEFAULT_SIMPLE_INPUTS);
    const years = project(s, toAssumptions(DEFAULT_SIMPLE_INPUTS));
    const report = runModelValidation(s, years);
    expect(report.failed, JSON.stringify(report.results.filter((r) => r.status === "fail"))).toBe(0);
    expect(runIntegrityChecks(s, years)).toEqual([]);
    // Asset buckets never negative.
    for (const y of years) {
      for (const v of [y.closing.free, y.closing.buffer, y.closing.pension, y.closing.holding]) {
        expect(v).toBeGreaterThanOrEqual(-0.5);
      }
    }
  });

  describe("simple levers move the projection in the expected direction", () => {
    const base = DEFAULT_SIMPLE_INPUTS; // stop age 60, horizon to 90
    const STOP = base.desiredStopAge; // compare accumulation at the stop age (60)

    it("higher monthly spending ⇒ lower net worth at stop age", () => {
      expect(netWorthAtAge({ ...base, monthlySpending: 35_000 }, STOP)).toBeLessThan(
        netWorthAtAge({ ...base, monthlySpending: 12_000 }, STOP),
      );
    });

    it("higher monthly savings ⇒ higher net worth at stop age", () => {
      expect(netWorthAtAge({ ...base, monthlySavings: 20_000 }, STOP)).toBeGreaterThan(
        netWorthAtAge({ ...base, monthlySavings: 2_000 }, STOP),
      );
    });

    it("higher expected real return ⇒ higher net worth at stop age", () => {
      expect(netWorthAtAge({ ...base, expectedRealReturn: 0.07 }, STOP)).toBeGreaterThan(
        netWorthAtAge({ ...base, expectedRealReturn: 0.01 }, STOP),
      );
    });

    it("a later stop age ⇒ higher net worth at a common later age (more accumulation, less drawdown)", () => {
      // Compare at age 70 (both personas have passed their stop age and reach this age).
      expect(netWorthAtAge({ ...base, desiredStopAge: 65 }, 70)).toBeGreaterThan(
        netWorthAtAge({ ...base, desiredStopAge: 55 }, 70),
      );
    });
  });

  it("the simple input type uses only generic field names (no Simon-/Denmark-specific labels)", () => {
    const keys = Object.keys(DEFAULT_SIMPLE_INPUTS).sort();
    expect(keys).toEqual(
      [
        "annualIncome",
        "currentAge",
        "currentInvestments",
        "desiredStopAge",
        "expectedRealReturn",
        "lifeExpectancy",
        "monthlySavings",
        "monthlySpending",
        "pensionAccessAge",
        "pensionBalance",
      ].sort(),
    );
    // No field name leaks an advanced/locale/personal concept.
    const forbidden = /holding|barma|folkepension|ratepension|livrente|\bask\b|depot|salary|kr\b/i;
    for (const k of keys) expect(k, `field "${k}"`).not.toMatch(forbidden);
  });
});
