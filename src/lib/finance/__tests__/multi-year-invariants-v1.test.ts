/**
 * Multi-year invariants v1 — cumulative behaviour of the projection engine across a
 * full 20–55 year horizon. Where scenario-matrix-v1 mostly checks year 0 / one isolated
 * year, this file follows balances, buffer, cost basis, brackets and shortfall over time.
 *
 * Conventions:
 *  - Invariant-style assertions (telescoping, monotonicity, non-negativity, conservation,
 *    cross-run equality) are preferred over magic numbers.
 *  - Exact integers are only hard-coded where the math is deliberately simple (e.g. a
 *    constant 60.000 kr deficit against a 300.000 kr buffer at zero returns).
 *  - ZERO_RETURN isolates flow-of-funds (no growth); defaultAssumptions checks realism.
 *  - runModelValidation()/runIntegrityChecks() are used as built-in multi-year oracles.
 */
import { describe, it, expect } from "vitest";
import { defaultAssumptions, defaultInputs, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { runModelValidation } from "../modelValidation";
import { runIntegrityChecks } from "../integrity";
import { buildProjectionCsv, PROJECTION_CSV_COLUMNS } from "../exportProjection";
import type { Assumptions, Scenario, YearRow } from "../types";

const TAX = defaultAssumptions.tax;
const ZERO_RETURN: Assumptions = { ...defaultAssumptions, realReturn: { free: 0, pension: 0, holding: 0 } };
const NEG_FREE_RETURN: Assumptions = { ...defaultAssumptions, realReturn: { free: -0.1, pension: 0, holding: 0 } };

function nw(b: { free: number; pension: number; holding: number; buffer: number; debt: number }): number {
  return b.free + b.pension + b.holding + b.buffer - b.debt;
}

/** Run the engine's own validation + integrity oracles across the WHOLE projection. */
function sweepClean(s: Scenario, assumptions: Assumptions): YearRow[] {
  const years = project(s, assumptions);
  const report = runModelValidation(s, years);
  const integ = runIntegrityChecks(s, years);
  const fails = report.results.filter((r) => r.status === "fail");
  expect(fails, `runModelValidation failures: ${JSON.stringify(fails, null, 2)}`).toEqual([]);
  expect(integ, `runIntegrityChecks: ${integ.join("; ")}`).toEqual([]);
  return years;
}

/**
 * Solvent multi-decade scenario whose only wealth movers are income/spending into/out of
 * TAX-FREE buckets (free depot + buffer). No growth, no debt, no pension contributions, no
 * holding exit / distribution, no pension streams, no life events. ⇒ per-year identity
 * closingNW == openingNW + cashflowBeforeSavings holds exactly while solvent.
 */
function conservationScenario(): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [];
  s.inputs.pension.monthlyContribution = 0;
  s.inputs.pension.employerContribution = 0;
  s.inputs.pension.ratePensionEnabled = false;
  s.inputs.pension.lifeAnnuity = { ...s.inputs.pension.lifeAnnuity, enabled: false };
  s.inputs.pension.balance = 0;
  s.inputs.holding.balance = 0;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.holding.annualDistribution = 0;
  s.inputs.free.balance = 5_000_000; // ample tax-free capital so deficits never exhaust it
  s.inputs.free.cashBuffer = 500_000;
  s.inputs.free.bufferUsableForShortfall = true;
  s.inputs.spending.desiredMonthlyNet = 10_000;
  s.inputs.cashflowAllocation = {
    surplusPolicy: "investExtra",
    bufferTarget: null,
    plannedInvestmentMethod: "cashflow", // invest entire positive cashflow into (tax-free) free
    plannedShortfallPolicy: "useBuffer",
  };
  return s;
}

/**
 * Pure multi-year drawdown: person already at/after stopAge with NO labour/part-time/state
 * income, so spending forces a controlled shortfall covered via capitalWithdrawal each year.
 */
function drawdown(opts: {
  strategy: import("../types").CapitalWithdrawalStrategy;
  currentAge?: number;
  free?: number;
  ask?: number;
  holding?: number;
  pension?: number;
  buffer?: number;
  bufferUsable?: boolean;
  spendingMonthly?: number;
  depotTax?: import("../types").DepotTaxInputs;
}): Scenario {
  const s = makeBaseScenario();
  const age = opts.currentAge ?? 60;
  s.inputs.person.currentAge = age;
  s.inputs.stopAge = age;
  s.inputs.fullRetireAge = age; // ⇒ part-time gate (age < fullRetireAge) is false ⇒ no part-time income
  s.inputs.debts = [];
  s.inputs.income.familyFundAnnualNet = 0;
  s.inputs.income.statePension = { ...s.inputs.income.statePension, mode: "none" };
  s.inputs.pension.ratePensionEnabled = false;
  s.inputs.pension.lifeAnnuity = { ...s.inputs.pension.lifeAnnuity, enabled: false };
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.holding.annualDistribution = 0;
  s.inputs.spending.desiredMonthlyNet = opts.spendingMonthly ?? 40_000;
  s.inputs.free.balance = opts.free ?? 0;
  s.inputs.holding.balance = opts.holding ?? 0;
  s.inputs.pension.balance = opts.pension ?? 0;
  s.inputs.free.cashBuffer = opts.buffer ?? 0;
  s.inputs.free.bufferUsableForShortfall = opts.bufferUsable ?? false;
  if (opts.depotTax) s.inputs.free.depotTax = opts.depotTax;
  if (opts.ask !== undefined) {
    s.inputs.free.ask = {
      enabled: true,
      currentValue: opts.ask,
      priorYearEndValue: opts.ask,
      depositLimit: 174_200,
      taxRate: 0.17,
      autoFillFirst: false,
      taxCreditCarryForward: 0,
      taxPaymentMode: "deductFromASK",
      withdrawalStrategy: "depotFirst",
    };
  }
  s.inputs.capitalWithdrawal = {
    strategy: opts.strategy,
    plannedWithdrawalPolicy: "none",
    plannedWithdrawalAmount: 0,
    startAge: null,
    startAtStopAge: true,
  };
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Multi-year conservation
// ─────────────────────────────────────────────────────────────────────────────
describe("A. Multi-year conservation", () => {
  it("every year: closing net worth = opening net worth + cashflow (tax-free buckets, zero returns)", () => {
    const s = conservationScenario();
    const years = sweepClean(s, ZERO_RETURN);
    expect(years.length).toBeGreaterThanOrEqual(40); // multi-decade horizon
    for (const y of years) {
      expect(y.shortfallAmount, `solvent precondition @${y.age}`).toBeLessThanOrEqual(0.5);
      const cf = y.flows.cashflowBridge!.cashflowBeforeSavings;
      expect(nw(y.closing), `conservation @${y.age}`).toBeCloseTo(nw(y.opening) + cf, 1);
    }
  });

  it("balances are continuous: opening[i+1] equals closing[i] for the whole horizon", () => {
    const years = project(conservationScenario(), ZERO_RETURN);
    for (let i = 1; i < years.length; i++) {
      expect(nw(years[i].opening)).toBeCloseTo(nw(years[i - 1].closing), 1);
      expect(years[i].opening.free).toBeCloseTo(years[i - 1].closing.free, 1);
      expect(years[i].opening.buffer).toBeCloseTo(years[i - 1].closing.buffer, 1);
    }
  });

  it("negative-cashflow years never increase net worth (zero growth)", () => {
    const years = project(conservationScenario(), ZERO_RETURN);
    const negativeYears = years.filter((y) => y.flows.cashflowBridge!.cashflowBeforeSavings < -0.5);
    expect(negativeYears.length).toBeGreaterThan(0); // the scenario does run deficits late in life
    for (const y of negativeYears) {
      expect(nw(y.closing), `no money creation @${y.age}`).toBeLessThanOrEqual(nw(y.opening) + 0.5);
    }
  });

  it("validation + integrity oracles stay clean across all years under realistic returns", () => {
    sweepClean(conservationScenario(), defaultAssumptions);
    sweepClean(makeBaseScenario(), defaultAssumptions);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Buffer over time
// ─────────────────────────────────────────────────────────────────────────────
describe("B. Buffer over time", () => {
  const DEFICIT = 60_000; // income 0, spending 5.000/md ⇒ exact 60.000 kr/yr deficit
  const START_BUFFER = 300_000;

  function bufferOnly(bufferUsable: boolean): Scenario {
    const s = drawdown({ strategy: "depotFirst", currentAge: 60, free: 0, holding: 0, pension: 0, buffer: START_BUFFER, bufferUsable, spendingMonthly: 5_000 });
    return s;
  }

  it("bufferUsableForShortfall=true: buffer drains exactly year by year, then shortfall appears, never negative", () => {
    const years = sweepClean(bufferOnly(true), ZERO_RETURN);
    for (const y of years) {
      const i = y.yearIndex;
      const openBuf = Math.max(0, START_BUFFER - DEFICIT * i);
      const expectClose = Math.max(0, START_BUFFER - DEFICIT * (i + 1));
      const expectShort = Math.max(0, DEFICIT - openBuf);
      expect(y.closing.buffer, `buffer close @${y.age}`).toBeCloseTo(expectClose, 1);
      expect(y.shortfallAmount, `shortfall @${y.age}`).toBeCloseTo(expectShort, 1);
      expect(y.closing.buffer).toBeGreaterThanOrEqual(-0.5);
    }
    // Monotonic non-increasing buffer.
    for (let i = 1; i < years.length; i++) {
      expect(years[i].closing.buffer).toBeLessThanOrEqual(years[i - 1].closing.buffer + 0.5);
    }
    // After exhaustion the full deficit is a visible shortfall.
    const exhausted = years.filter((y) => y.closing.buffer <= 0.5 && y.opening.buffer <= 0.5);
    expect(exhausted.length).toBeGreaterThan(0);
    for (const y of exhausted) expect(y.shortfallAmount).toBeCloseTo(DEFICIT, 1);
  });

  it("bufferUsableForShortfall=false: buffer is never touched, deficit is fully visible every year", () => {
    const years = sweepClean(bufferOnly(false), ZERO_RETURN);
    for (const y of years) {
      expect(y.closing.buffer, `buffer untouched @${y.age}`).toBeCloseTo(START_BUFFER, 1);
      expect(y.flows.withdrawals.buffer).toBeCloseTo(0, 1);
      expect(y.shortfallAmount, `shortfall @${y.age}`).toBeCloseTo(DEFICIT, 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Depot cost basis over multiple sales
// ─────────────────────────────────────────────────────────────────────────────
describe("C. Depot cost basis over multiple sales", () => {
  const DEPOT_START = 2_000_000;
  const COST_BASIS = 200_000;
  const INITIAL_LATENT = DEPOT_START - COST_BASIS;

  function depotDrawdown(): Scenario {
    return drawdown({
      strategy: "depotFirst",
      currentAge: 55,
      free: DEPOT_START,
      holding: 0,
      pension: 0,
      buffer: 0,
      spendingMonthly: 15_000,
      depotTax: { enabled: true, method: "realizationSimple", costBasis: COST_BASIS, showDeferredTax: true },
    });
  }

  it("cost basis only shrinks, never negative, never exceeds depot value", () => {
    const years = sweepClean(depotDrawdown(), ZERO_RETURN);
    let prev = COST_BASIS;
    for (const y of years) {
      const d = y.flows.depot;
      if (!d) continue;
      expect(d.costBasisClosing, `cost basis >= 0 @${y.age}`).toBeGreaterThanOrEqual(-0.5);
      expect(d.costBasisClosing, `cost basis <= depot @${y.age}`).toBeLessThanOrEqual(d.closing + 1);
      expect(d.costBasisClosing, `cost basis non-increasing @${y.age}`).toBeLessThanOrEqual(prev + 1);
      prev = d.costBasisClosing;
    }
  });

  it("realized gains are conserved (not double-counted): cumulativeRealized + remainingLatent = initial latent", () => {
    const years = project(depotDrawdown(), ZERO_RETURN);
    let cumulativeRealized = 0;
    let sawSale = false;
    for (const y of years) {
      const d = y.flows.depot;
      if (!d) continue;
      expect(d.realizedGain, `realized <= sale @${y.age}`).toBeLessThanOrEqual(d.grossSale + 1);
      cumulativeRealized += d.realizedGain;
      if (d.grossSale > 0.5) sawSale = true;
      const remainingLatent = Math.max(0, d.closing - d.costBasisClosing);
      expect(cumulativeRealized + remainingLatent, `gain conservation @${y.age}`).toBeCloseTo(INITIAL_LATENT, 0);
    }
    expect(sawSale).toBe(true);
    // Cumulative realized gain can never exceed the total latent gain that ever existed.
    expect(cumulativeRealized).toBeLessThanOrEqual(INITIAL_LATENT + 1);
  });

  it("latent-gain/cost-basis invariants hold (durable, not tied to the deferred-tax heuristic)", () => {
    const years = project(depotDrawdown(), ZERO_RETURN);
    for (const y of years) {
      const d = y.flows.depot;
      if (!d) continue;
      // Cost basis is well-formed: non-negative and never above the depot value (no growth here).
      expect(d.costBasisClosing, `cost basis >= 0 @${y.age}`).toBeGreaterThanOrEqual(-0.5);
      expect(d.costBasisClosing, `cost basis <= value @${y.age}`).toBeLessThanOrEqual(d.closing + 1);
      // Unrealized gain is exactly max(0, value - cost basis) — a definitional invariant.
      const latent = Math.max(0, d.closing - d.costBasisClosing);
      expect(d.unrealizedGainClosing, `unrealized gain def @${y.age}`).toBeCloseTo(latent, 0);
      // Deferred-tax indicator: only assert durable bounds, NOT the exact average-rate formula.
      // It must be non-negative and never tax more than the gain at the maximum share rate.
      expect(d.deferredTaxClosing, `deferred tax >= 0 @${y.age}`).toBeGreaterThanOrEqual(-0.5);
      expect(d.deferredTaxClosing, `deferred tax bounded by gain*highRate @${y.age}`).toBeLessThanOrEqual(latent * TAX.shareHighRate + 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. ASK multi-year behaviour
// ─────────────────────────────────────────────────────────────────────────────
describe("D. ASK multi-year behaviour", () => {
  const DEPOT_PORTION = 400_000;
  const ASK_VALUE = 100_000;

  /** Long pure-accumulation scenario (no withdrawals) with identical depot portion. */
  function accumulation(withAsk: boolean): Scenario {
    const s = makeBaseScenario();
    s.inputs.stopAge = 90; // keep working ⇒ no drawdown, ASK/depot just grow
    s.inputs.fullRetireAge = 90;
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    s.inputs.holding.annualDistribution = 0;
    s.inputs.free.balance = withAsk ? DEPOT_PORTION + ASK_VALUE : DEPOT_PORTION;
    s.inputs.free.depotTax = { enabled: true, method: "annualShareIncomeTax", costBasis: null, showDeferredTax: true };
    if (withAsk) {
      s.inputs.free.ask = {
        enabled: true,
        currentValue: ASK_VALUE,
        priorYearEndValue: ASK_VALUE,
        depositLimit: 174_200,
        taxRate: 0.17,
        autoFillFirst: false, // contributions go to depot in both runs ⇒ depot trajectory identical
        taxCreditCarryForward: 0,
        taxPaymentMode: "deductFromASK",
        withdrawalStrategy: "depotFirst",
      };
    }
    return s;
  }

  it("ASK growth never enters the share-income pool over the whole horizon (with-vs-without ASK identical)", () => {
    const withAsk = sweepClean(accumulation(true), defaultAssumptions);
    const noAsk = project(accumulation(false), defaultAssumptions);
    expect(withAsk.length).toBe(noAsk.length);
    let askTaxYears = 0;
    for (let i = 0; i < withAsk.length; i++) {
      const a = withAsk[i].flows.shareIncome!;
      const b = noAsk[i].flows.shareIncome!;
      // Bracket usage and totals identical whether or not the extra ASK pot exists.
      expect(a.totalShareIncome, `totalShareIncome @${withAsk[i].age}`).toBeCloseTo(b.totalShareIncome, 0);
      expect(a.taxedAtLow, `taxedAtLow @${withAsk[i].age}`).toBeCloseTo(b.taxedAtLow, 0);
      expect(a.taxedAtHigh, `taxedAtHigh @${withAsk[i].age}`).toBeCloseTo(b.taxedAtHigh, 0);
      // The pool only ever reflects depot/holding taxable components.
      expect(a.totalShareIncome).toBeCloseTo(a.holdingGross + a.extraHoldingGross + a.realizedDepotGain + a.annualDepotTaxable, 0);
      const ask = withAsk[i].flows.ask!;
      if (ask.growthGross > 0.5) {
        expect(ask.tax).toBeGreaterThan(0); // ASK taxed via its own line
        askTaxYears++;
      }
    }
    expect(askTaxYears).toBeGreaterThan(0);
  });

  it("negative ASK return: tax stays 0 and the loss carry-forward accumulates consistently year by year", () => {
    const s = drawdown({ strategy: "depotFirst", currentAge: 40, free: 200_000, ask: 200_000, holding: 0, pension: 0, spendingMonthly: 0 });
    // free.balance == ask.currentValue ⇒ depot portion 0; spending 0 + income 0 ⇒ no withdrawals.
    const years = project(s, NEG_FREE_RETURN);
    let prevCarry = 0;
    let shrinkingYears = 0;
    for (const y of years) {
      const ask = y.flows.ask;
      if (!ask) continue;
      expect(ask.closing, `ASK never negative @${y.age}`).toBeGreaterThanOrEqual(-0.5);
      if (ask.growthGross < -0.5) {
        expect(ask.tax, `no tax on a loss @${y.age}`).toBeCloseTo(0, 6);
        expect(ask.carryForwardEnd, `carry-forward accumulates @${y.age}`).toBeGreaterThanOrEqual(prevCarry - 0.5);
        shrinkingYears++;
      }
      prevCarry = ask.carryForwardEnd;
    }
    expect(shrinkingYears).toBeGreaterThan(0);
  });

  it("ASK withdrawals do not consume the personal 27/42 bracket (drawdown, askFirst)", () => {
    const s = drawdown({
      strategy: "askFirst",
      currentAge: 60,
      free: 700_000,
      ask: 500_000,
      holding: 1_000_000,
      pension: 0,
      spendingMonthly: 30_000,
      depotTax: { enabled: true, method: "realizationSimple", costBasis: 100_000, showDeferredTax: true },
    });
    const years = sweepClean(s, ZERO_RETURN);
    for (const y of years) {
      const si = y.flows.shareIncome;
      if (!si) continue;
      // Pool reflects only holding + realized depot gain; ASK withdrawals never appear.
      expect(si.totalShareIncome, `pool excludes ASK @${y.age}`).toBeCloseTo(
        si.holdingGross + si.extraHoldingGross + si.realizedDepotGain + si.annualDepotTaxable,
        0,
      );
      expect(si.taxedAtLow).toBeLessThanOrEqual(si.threshold + 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Holding + depot shared 27/42 bracket over multiple years
// ─────────────────────────────────────────────────────────────────────────────
describe("E. Holding + depot shared bracket over multiple years", () => {
  /**
   * LEGACY path (no inputs.capitalWithdrawal): projection.ts only runs the planned
   * holding distribution (holdingPlanned, feeding the shared shareIncome ctx) when
   * capitalWithdrawal is NOT active. A consumption deficit then forces a depot
   * realization from `free`, so holding distribution AND realized depot gain land in
   * the SAME per-year share-income pool — the case Codex asked us to exercise.
   */
  function legacySharedBracket(): Scenario {
    const s = makeBaseScenario();
    s.inputs.person.currentAge = 55;
    s.inputs.stopAge = 55;
    s.inputs.fullRetireAge = 55; // no labour / part-time income
    s.inputs.debts = [];
    s.inputs.income.familyFundAnnualNet = 0;
    s.inputs.income.statePension = { ...s.inputs.income.statePension, mode: "none" };
    s.inputs.pension.ratePensionEnabled = false;
    s.inputs.pension.lifeAnnuity = { ...s.inputs.pension.lifeAnnuity, enabled: false };
    s.inputs.pension.balance = 0;
    s.inputs.holding.balance = 2_000_000;
    s.inputs.holding.expectedExitValue = 0;
    s.inputs.holding.annualDistribution = 50_000; // planned holding distribution each year
    s.inputs.holding.startDistributionAtStopAge = true;
    s.inputs.holding.withdrawalStrategy = "planned_only"; // ⇒ shortfall cannot reach holding, must hit depot
    s.inputs.free.balance = 2_000_000;
    s.inputs.free.cashBuffer = 0;
    s.inputs.free.depotTax = { enabled: true, method: "realizationSimple", costBasis: 200_000, showDeferredTax: true };
    s.inputs.spending.desiredMonthlyNet = 30_000; // deficit ⇒ depot realization to cover it
    // capitalWithdrawal intentionally left undefined (legacy shared-bracket path).
    return s;
  }

  it("same year: a holding distribution AND a realized depot gain both feed ONE shared 27/42 low bracket", () => {
    const years = sweepClean(legacySharedBracket(), ZERO_RETURN);
    // There must be a year where BOTH sources are positive simultaneously.
    const both = years.find(
      (y) => (y.flows.shareIncome?.holdingGross ?? 0) > 0.5 && (y.flows.shareIncome?.realizedDepotGain ?? 0) > 0.5,
    );
    expect(both, "a year with BOTH holding distribution and realized depot gain").toBeDefined();
    const si = both!.flows.shareIncome!;

    // Both sources are genuinely present this year.
    expect(si.holdingGross).toBeGreaterThan(0);
    expect(si.realizedDepotGain).toBeGreaterThan(0);

    // Both enter the same pool; total = holding + depot components (no double count).
    expect(si.totalShareIncome).toBeCloseTo(
      si.holdingGross + si.extraHoldingGross + si.realizedDepotGain + si.annualDepotTaxable,
      0,
    );
    expect(si.taxedAtLow + si.taxedAtHigh).toBeCloseTo(si.totalShareIncome, 0);

    // ONE low bracket across holding + depot combined (never 2× — that would allow up to 2×threshold).
    expect(si.taxedAtLow).toBeLessThanOrEqual(si.threshold + 1);
    // Combined income exceeds the threshold here ⇒ low bracket fully used once, remainder at high rate.
    expect(si.totalShareIncome).toBeGreaterThan(si.threshold);
    expect(si.taxedAtLow).toBeCloseTo(si.threshold, 0);
    expect(si.taxedAtHigh).toBeGreaterThan(0);
  });

  it("low bracket resets each year (independent full refill across many years), never carried", () => {
    const years = project(legacySharedBracket(), ZERO_RETURN);
    let fullLowYears = 0;
    for (const y of years) {
      const si = y.flows.shareIncome;
      if (!si) continue;
      expect(si.taxedAtLow, `low<=threshold @${y.age}`).toBeLessThanOrEqual(si.threshold + 1);
      if (si.totalShareIncome > si.threshold + 1) {
        expect(si.taxedAtLow).toBeCloseTo(si.threshold, 0); // refilled to the full threshold again
        fullLowYears++;
      }
    }
    expect(fullLowYears).toBeGreaterThan(1); // multiple independent years each get the full low bracket
  });

  it("fillLowShareIncomeBracket allocates ONE combined low bracket across holding + depot (not one each)", () => {
    const s = drawdown({
      strategy: "holdingFirst",
      currentAge: 55,
      free: 1_000_000, // depot with full latent gain (costBasis 0 ⇒ gainRatio 1)
      holding: 40_000, // below the threshold ⇒ depot must fill the remaining low room
      pension: 0,
      spendingMonthly: 0,
      depotTax: { enabled: true, method: "realizationSimple", costBasis: 0, showDeferredTax: true },
    });
    s.inputs.capitalWithdrawal = {
      strategy: "holdingFirst",
      plannedWithdrawalPolicy: "fillLowShareIncomeBracket",
      plannedWithdrawalAmount: 0,
      startAge: null,
      startAtStopAge: true,
    };
    const years = sweepClean(s, ZERO_RETURN);
    const both = years.find(
      (y) => y.flows.holdingPlanned.gross > 0.5 && (y.flows.shareIncome?.realizedDepotGain ?? 0) > 0.5,
    );
    expect(both, "a fill-low year drawing from BOTH holding and depot").toBeDefined();
    const si = both!.flows.shareIncome!;
    // Holding + depot together fill a single low bracket — combined taxedAtLow ≈ threshold, never 2×.
    expect(both!.flows.holdingPlanned.gross).toBeGreaterThan(0);
    expect(si.realizedDepotGain).toBeGreaterThan(0);
    expect(si.taxedAtLow).toBeLessThanOrEqual(si.threshold + 1);
    expect(si.taxedAtLow).toBeCloseTo(si.threshold, 0);
    // Every year stays within a single low bracket.
    for (const y of years) {
      const s2 = y.flows.shareIncome;
      if (s2) expect(s2.taxedAtLow, `fillLow<=threshold @${y.age}`).toBeLessThanOrEqual(s2.threshold + 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Capital exhaustion edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe("F. Capital exhaustion edge cases", () => {
  const SPENDING_MONTHLY = 30_000;
  const SPENDING = SPENDING_MONTHLY * 12;

  function exhausting(): Scenario {
    return drawdown({
      strategy: "depotFirst",
      currentAge: 60,
      free: 300_000, // depot 200k + ask 100k
      ask: 100_000,
      holding: 200_000,
      pension: 0,
      buffer: 100_000,
      bufferUsable: true,
      spendingMonthly: SPENDING_MONTHLY,
    });
  }

  it("all accessible capital is consumed, residual deficit becomes a visible shortfall, net worth floors at ~0", () => {
    const years = sweepClean(exhausting(), ZERO_RETURN);
    // No balance ever goes negative.
    for (const y of years) {
      for (const v of [y.closing.free, y.closing.buffer, y.closing.pension, y.closing.holding]) {
        expect(v, `non-negative balance @${y.age}`).toBeGreaterThanOrEqual(-0.5);
      }
      expect(y.netWorth).toBeGreaterThanOrEqual(-0.5);
    }
    // Capital is genuinely consumed, not artificially preserved.
    const last = years[years.length - 1];
    expect(last.netWorth, "net worth not preserved after exhaustion").toBeLessThanOrEqual(1);
    expect(nw(years[0].opening)).toBeGreaterThan(500_000);
    // Once exhausted (income 0), the full spending shows up as shortfall.
    expect(last.shortfallAmount).toBeCloseTo(SPENDING, 0);
    // Years entered ALREADY broke (opening net worth ~0) show the full spending as shortfall.
    const enteredBroke = years.filter((y) => nw(y.opening) <= 0.5);
    expect(enteredBroke.length).toBeGreaterThan(0);
    for (const y of enteredBroke) expect(y.shortfallAmount).toBeCloseTo(SPENDING, 0);

    // The transition year (entered with capital > 0, drained to ~0 mid-year) MUST exist.
    const transition = years.filter((y) => nw(y.opening) > 0.5 && y.netWorth <= 1);
    expect(transition.length, "a transition year must be present").toBeGreaterThan(0);
    for (const y of transition) {
      // Partial shortfall: capital covered part, the rest is the honest remainder.
      expect(y.shortfallAmount, `partial shortfall > 0 @${y.age}`).toBeGreaterThan(0);
      expect(y.shortfallAmount, `partial shortfall < full spending @${y.age}`).toBeLessThan(SPENDING);
      // No money creation: with zero income, net covered = SPENDING − shortfall must have come from
      // a genuine drop in net worth (gross drained ≥ net covered), so:
      //   (openingNW − closingNW) + shortfall ≥ SPENDING.
      const nwDrop = nw(y.opening) - nw(y.closing);
      expect(nwDrop + y.shortfallAmount, `no money creation @${y.age}`).toBeGreaterThanOrEqual(SPENDING - 0.5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Pension availability over time
// ─────────────────────────────────────────────────────────────────────────────
describe("G. Pension availability over time", () => {
  const AVAIL_AGE = defaultInputs.pension.payoutFromAge; // pensionAvailableFromAge (64)
  const PENSION_START = 3_000_000;

  function pensionDrawdown(): Scenario {
    return drawdown({
      strategy: "pensionFirst",
      currentAge: 60,
      free: 0,
      holding: 0,
      pension: PENSION_START,
      buffer: 0,
      spendingMonthly: 40_000,
    });
  }

  it("pensionFirst does NOT touch pension before the availability age, and DOES once reached", () => {
    const years = sweepClean(pensionDrawdown(), ZERO_RETURN);
    let usedBefore = 0;
    let usedAfterCount = 0;
    for (const y of years) {
      const g = y.flows.capitalWithdrawal!.grossBySource.pension;
      if (y.age < AVAIL_AGE) {
        usedBefore += g;
        // No other capital ⇒ deficit is a visible shortfall before pension unlocks.
        expect(y.shortfallAmount, `shortfall before pension @${y.age}`).toBeGreaterThan(0);
      } else if (y.closing.pension > 0.5 || g > 0.5) {
        if (g > 0.5) usedAfterCount++;
      }
    }
    expect(usedBefore, "pension untouched before availability").toBeCloseTo(0, 1);
    expect(usedAfterCount, "pension used after availability").toBeGreaterThan(0);
  });

  it("pension balance is never double-counted: cumulative pension gross out = initial - final (zero returns)", () => {
    const years = project(pensionDrawdown(), ZERO_RETURN);
    let cumulativeGross = 0;
    for (const y of years) {
      cumulativeGross += y.flows.capitalWithdrawal!.grossBySource.pension;
      expect(y.closing.pension, `pension never negative @${y.age}`).toBeGreaterThanOrEqual(-0.5);
    }
    const finalPension = years[years.length - 1].closing.pension;
    expect(cumulativeGross).toBeCloseTo(PENSION_START - finalPension, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. Pro rata over multiple years
// ─────────────────────────────────────────────────────────────────────────────
describe("H. Pro rata over multiple years", () => {
  function proRataDrawdown(): Scenario {
    return drawdown({
      strategy: "proRata",
      currentAge: 60,
      free: 1_500_000,
      holding: 1_500_000,
      pension: 0,
      spendingMonthly: 30_000,
    });
  }

  it("pro rata draws from both depot and holding while both have balance; pools never overdrawn", () => {
    const years = sweepClean(proRataDrawdown(), ZERO_RETURN);
    let bothDrawnYears = 0;
    let prevFree = years[0].opening.free;
    let prevHolding = years[0].opening.holding;
    for (const y of years) {
      const cw = y.flows.capitalWithdrawal!;
      expect(y.closing.free, `free >= 0 @${y.age}`).toBeGreaterThanOrEqual(-0.5);
      expect(y.closing.holding, `holding >= 0 @${y.age}`).toBeGreaterThanOrEqual(-0.5);
      // Monotonic non-increasing pools (no growth, drawdown only).
      expect(y.closing.free).toBeLessThanOrEqual(prevFree + 0.5);
      expect(y.closing.holding).toBeLessThanOrEqual(prevHolding + 0.5);
      prevFree = y.closing.free;
      prevHolding = y.closing.holding;
      if (cw.grossBySource.depot > 0.5 && cw.grossBySource.holding > 0.5) bothDrawnYears++;
    }
    expect(bothDrawnYears, "both pools drawn in pro-rata years").toBeGreaterThan(1);
  });

  it("source-specific tax holds across years: holding withdrawals are taxed, depot withdrawals are tax-free", () => {
    const years = project(proRataDrawdown(), ZERO_RETURN);
    let checkedHolding = false;
    let checkedDepot = false;
    for (const y of years) {
      const cw = y.flows.capitalWithdrawal!;
      if (cw.grossBySource.holding > 1) {
        expect(cw.taxBySource.holding, `holding taxed @${y.age}`).toBeGreaterThan(0);
        expect(cw.netBySource.holding).toBeLessThan(cw.grossBySource.holding);
        checkedHolding = true;
      }
      if (cw.grossBySource.depot > 1) {
        expect(cw.taxBySource.depot, `depot tax-free @${y.age}`).toBeCloseTo(0, 1);
        expect(cw.netBySource.depot).toBeCloseTo(cw.grossBySource.depot, 0);
        checkedDepot = true;
      }
    }
    expect(checkedHolding && checkedDepot).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. Persistence / projection export consistency (multi-year)
// ─────────────────────────────────────────────────────────────────────────────
describe("I. Persistence & export consistency (multi-year)", () => {
  function richScenario(): Scenario {
    const s = makeBaseScenario();
    s.inputs.cashflowAllocation = { surplusPolicy: "bufferThenInvest", bufferTarget: 200_000, plannedInvestmentMethod: "planned", plannedShortfallPolicy: "useBuffer" };
    s.inputs.capitalWithdrawal = { strategy: "holdingFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 40_000, startAge: null, startAtStopAge: true };
    s.inputs.free.ask = { enabled: true, currentValue: 80_000, priorYearEndValue: 80_000, depositLimit: 174_200, taxRate: 0.17, autoFillFirst: true, taxCreditCarryForward: 0, taxPaymentMode: "deductFromASK", withdrawalStrategy: "askFirst" };
    s.inputs.free.depotTax = { enabled: true, method: "realizationSimple", costBasis: 150_000, showDeferredTax: true };
    return s;
  }

  it("CSV export has one row per projected year and carries every multi-year explanatory column", () => {
    const years = project(richScenario(), defaultAssumptions);
    const csv = buildProjectionCsv(years);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(PROJECTION_CSV_COLUMNS.join(","));
    expect(lines.length).toBe(years.length + 1);
    for (const col of ["bufferEnd", "shortfall", "plannedSavingsShortfall", "depotEnd", "askEnd", "actualInvestment", "cashflowBeforeSavings"] as const) {
      expect(PROJECTION_CSV_COLUMNS).toContain(col);
    }
  });

  it("per-year audit fields needed to explain buffer/shortfall/withdrawals/ASK/depot/holding are present", () => {
    const years = project(richScenario(), defaultAssumptions);
    for (const y of years) {
      expect(y.flows.cashflowBridge).toBeDefined();
      expect(y).toHaveProperty("shortfallAmount");
      expect(y.flows.withdrawals).toHaveProperty("buffer");
      expect(y.flows.capitalWithdrawal).toBeDefined();
      expect(y.flows.ask).toBeDefined();
      expect(y.flows.depot).toBeDefined();
      expect(y.flows.holdingPlanned).toBeDefined();
    }
  });

  it("JSON roundtrip reproduces the ENTIRE multi-year projection byte-for-byte", () => {
    const s = richScenario();
    const back = JSON.parse(JSON.stringify(s)) as Scenario;
    const a = project(s, defaultAssumptions);
    const b = project(back, defaultAssumptions);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
