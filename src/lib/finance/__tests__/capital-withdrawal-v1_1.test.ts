/**
 * Kapitaludtræk v1.1 — source-of-truth regressionstests.
 *
 * Når inputs.capitalWithdrawal er sat, må ændringer i legacy-felter
 * (holding.withdrawalStrategy, ask.withdrawalStrategy, depotTax.shareIncomeFundingStrategy)
 * ikke ændre projection-resultatet.
 */
import { describe, it, expect } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { project } from "@/lib/finance/projection";
import { resolveCapitalWithdrawal } from "@/lib/finance/capitalWithdrawal";
import type { Scenario } from "@/lib/finance/types";

function clone(s: Scenario): Scenario {
  return JSON.parse(JSON.stringify(s));
}

function fingerprint(s: Scenario) {
  const years = project(s, defaultAssumptions);
  return JSON.stringify(
    years.map((y) => ({
      a: y.age,
      nw: Math.round(y.netWorth ?? 0),
      cw: y.flows.capitalWithdrawal
        ? { g: Math.round(y.flows.capitalWithdrawal.totalGross), bs: y.flows.capitalWithdrawal.grossBySource }
        : null,
    })),
  );
}

function withCw(): Scenario {
  const s = makeBaseScenario();
  s.inputs.capitalWithdrawal = {
    strategy: "holdingFirst",
    plannedWithdrawalPolicy: "fixedAnnual",
    plannedWithdrawalAmount: 50000,
    startAge: 55,
    startAtStopAge: false,
  };
  // enable ASK + depotTax så legacy-felter findes at mutere
  s.inputs.free.ask = {
    enabled: true,
    currentValue: 100000,
    priorYearEndValue: 100000,
    depositLimit: 174200,
    taxRate: 0.17,
    autoFillFirst: false,
    taxCreditCarryForward: 0,
    taxPaymentMode: "deductFromASK",
    withdrawalStrategy: "depotFirst",
  };
  s.inputs.free.depotTax = {
    enabled: true,
    method: "realizationSimple",
    costBasis: null,
    showDeferredTax: true,
    shareIncomeFundingStrategy: "holdingFirst",
  };
  return s;
}

describe("capitalWithdrawal er source of truth", () => {
  it("ændring i holding.withdrawalStrategy påvirker ikke projection", () => {
    const a = withCw();
    const b = clone(a);
    b.inputs.holding.withdrawalStrategy = "pension_before_extra_holding";
    b.inputs.holding.annualDistribution = 999999;
    b.inputs.holding.distributionFromAge = 30;
    b.inputs.holding.startDistributionAtStopAge = true;
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("ændring i ask.withdrawalStrategy påvirker ikke projection", () => {
    const a = withCw();
    const b = clone(a);
    b.inputs.free.ask!.withdrawalStrategy = "askFirst";
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("ændring i depotTax.shareIncomeFundingStrategy påvirker ikke projection", () => {
    const a = withCw();
    const b = clone(a);
    b.inputs.free.depotTax!.shareIncomeFundingStrategy = "depotFirst";
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});

describe("resolveCapitalWithdrawal — UI display fallback for legacy modeller", () => {
  it("base scenarie uden capitalWithdrawal får meningsfulde resolved værdier", () => {
    const s = makeBaseScenario();
    expect(s.inputs.capitalWithdrawal).toBeUndefined();
    const r = resolveCapitalWithdrawal(s.inputs);
    expect(["depotFirst", "holdingFirst", "askFirst", "pensionFirst", "proRata", "custom"]).toContain(r.strategy);
    expect(["none", "fixedAnnual", "fillLowShareIncomeBracket"]).toContain(r.plannedWithdrawalPolicy);
  });

  it("legacy up_to_low_threshold resolver til holdingFirst + fillLowShareIncomeBracket", () => {
    const s = makeBaseScenario();
    s.inputs.holding.withdrawalStrategy = "up_to_low_threshold";
    const r = resolveCapitalWithdrawal(s.inputs);
    expect(r.strategy).toBe("holdingFirst");
    expect(r.plannedWithdrawalPolicy).toBe("fillLowShareIncomeBracket");
  });
});
