/**
 * Model scenario matrix v1 — systematic, automated coverage of the projection engine.
 *
 * Goal: prove the model behaves correctly across the core cashflow, savings, withdrawal,
 * tax and persistence scenarios. This file deliberately favours RELATIONAL INVARIANTS
 * (sums, conservation, "bracket used once", strict ordering) and the engine's own
 * built-in oracles — runModelValidation() and runIntegrityChecks() — over hard-coded
 * magic numbers, so the matrix stays correct even if tax constants change.
 *
 * Areas covered:
 *   A. Cashflow & savings (modes, surplus policies, planned-shortfall policies)
 *   B. Buffer & shortfall (bufferUsableForShortfall true/false; no money creation)
 *   C. Capital withdrawal (ordering, pension gating, planned policies)
 *   D. Tax buckets (ASK separate; holding+depot shared 27/42 bracket; once/year; gain-only)
 *   E. Persistence / compatibility (old scenarios, JSON roundtrip, export/debug report)
 */
import { describe, it, expect } from "vitest";
import { defaultAssumptions, defaultInputs, makeBaseScenario } from "../defaults";
import { project, projectWithStopAge } from "../projection";
import { runModelValidation } from "../modelValidation";
import { runIntegrityChecks } from "../integrity";
import { resolveOrder } from "../capitalWithdrawal";
import { applyShareIncomeTax, grossSaleForNetNeeded, newShareIncomeCtx } from "../tax";
import {
  buildProjectionExport,
  buildProjectionCsv,
  buildYearAuditJson,
  PROJECTION_CSV_COLUMNS,
} from "../exportProjection";
import type {
  Assumptions,
  CapitalWithdrawalStrategy,
  CashflowAllocationInputs,
  PlannedShortfallPolicy,
  PlannedWithdrawalPolicy,
  Scenario,
} from "../types";

const TAX = defaultAssumptions.tax;
const ZERO_RETURN: Assumptions = {
  ...defaultAssumptions,
  realReturn: { free: 0, pension: 0, holding: 0 },
};

/** The engine's own invariant + integrity oracles must be clean for every scenario. */
function assertEngineInvariantsClean(s: Scenario, assumptions: Assumptions = ZERO_RETURN) {
  const years = project(s, assumptions);
  const report = runModelValidation(s, years);
  const integrity = runIntegrityChecks(s, years);
  expect(report.failed, `runModelValidation failures: ${JSON.stringify(report.results.filter((r) => r.status === "fail"), null, 2)}`).toBe(0);
  expect(integrity, `runIntegrityChecks errors: ${integrity.join("; ")}`).toEqual([]);
  return years;
}

/**
 * Working-phase scenario (age 40, before stopAge): no debt, no pension contributions,
 * configurable spending / planned savings / buffer / cashflow allocation. Income is the
 * default salary so cashflow sign is controlled purely by `spendingMonthly`.
 */
function workingScenario(opts: {
  spendingMonthly: number;
  monthlyContribution?: number;
  annualExtra?: number;
  cashBuffer?: number;
  bufferUsableForShortfall?: boolean;
  allocation?: CashflowAllocationInputs;
}): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [];
  s.inputs.pension.monthlyContribution = 0;
  s.inputs.pension.employerContribution = 0;
  s.inputs.spending.desiredMonthlyNet = opts.spendingMonthly;
  if (opts.monthlyContribution !== undefined) s.inputs.free.monthlyContribution = opts.monthlyContribution;
  if (opts.annualExtra !== undefined) s.inputs.free.annualExtraContribution = opts.annualExtra;
  if (opts.cashBuffer !== undefined) s.inputs.free.cashBuffer = opts.cashBuffer;
  if (opts.bufferUsableForShortfall !== undefined) s.inputs.free.bufferUsableForShortfall = opts.bufferUsableForShortfall;
  if (opts.allocation) s.inputs.cashflowAllocation = opts.allocation;
  return s;
}

const alloc = (
  plannedInvestmentMethod: "planned" | "cashflow" | "none",
  surplusPolicy: CashflowAllocationInputs["surplusPolicy"],
  plannedShortfallPolicy?: PlannedShortfallPolicy,
): CashflowAllocationInputs => ({
  surplusPolicy,
  bufferTarget: null,
  plannedInvestmentMethod,
  plannedShortfallPolicy,
});

/**
 * Pure drawdown scenario: person is already at/after stopAge with NO income, so spending
 * forces a controlled shortfall that is covered via capitalWithdrawal ordering. Balances
 * per bucket are explicit. ratePension/life-annuity/holding-exit disabled to avoid noise.
 */
function drawdownScenario(
  strategy: CapitalWithdrawalStrategy,
  opts: {
    currentAge?: number;
    free?: number;
    holding?: number;
    pension?: number;
    ask?: number;
    spendingMonthly?: number;
    planned?: PlannedWithdrawalPolicy;
    plannedAmount?: number;
    startAtStopAge?: boolean;
  } = {},
): Scenario {
  const s = makeBaseScenario();
  const age = opts.currentAge ?? 60;
  s.inputs.person.currentAge = age;
  s.inputs.stopAge = age;
  s.inputs.fullRetireAge = age;
  s.inputs.debts = [];
  s.inputs.income.familyFundAnnualNet = 0;
  s.inputs.income.statePension = { ...s.inputs.income.statePension, mode: "none" };
  s.inputs.pension.ratePensionEnabled = false;
  s.inputs.pension.lifeAnnuity = { ...s.inputs.pension.lifeAnnuity, enabled: false };
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.holding.annualDistribution = 0;
  s.inputs.spending.desiredMonthlyNet = opts.spendingMonthly ?? 40000;
  s.inputs.free.balance = opts.free ?? 0;
  s.inputs.holding.balance = opts.holding ?? 0;
  s.inputs.pension.balance = opts.pension ?? 0;
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
    strategy,
    plannedWithdrawalPolicy: opts.planned ?? "none",
    plannedWithdrawalAmount: opts.plannedAmount ?? 0,
    startAge: null,
    startAtStopAge: opts.startAtStopAge ?? true,
  };
  return s;
}

// ───────────────────────────────────────────────────────────────────────────
// A. Cashflow and savings
// ───────────────────────────────────────────────────────────────────────────
describe("Matrix A — Cashflow & savings", () => {
  it("positive cashflow with planned savings LOWER than cashflow ⇒ planned invested, surplus allocated", () => {
    const s = workingScenario({ spendingMonthly: 10_000, allocation: alloc("planned", "outOfModel") });
    const y0 = assertEngineInvariantsClean(s)[0];
    const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
    const planned = y0.flows.plannedFreeContribution;
    expect(cf).toBeGreaterThan(planned); // precondition: cashflow above planned
    expect(y0.flows.investedAmount).toBeCloseTo(planned, 0);
    expect(y0.flows.cashflowSurplus).toBeCloseTo(cf - planned, 0);
  });

  it("positive cashflow with planned savings HIGHER than cashflow ⇒ invest only available cashflow, rest is planned-savings-shortfall", () => {
    const s = workingScenario({
      spendingMonthly: 35_000,
      cashBuffer: 0,
      allocation: alloc("planned", "outOfModel", "capToCashflow"),
    });
    const y0 = assertEngineInvariantsClean(s)[0];
    const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
    const planned = y0.flows.plannedFreeContribution;
    expect(cf).toBeGreaterThan(0);
    expect(cf).toBeLessThan(planned); // precondition: positive but below planned
    expect(y0.flows.investedAmount).toBeCloseTo(cf, 0);
    expect(y0.flows.plannedSavingsShortfall!.unmetPlannedInvestment).toBeCloseTo(planned - cf, 0);
    expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5); // not a consumption shortfall
  });

  it("negative cashflow before savings ⇒ no planned investment", () => {
    const s = workingScenario({ spendingMonthly: 60_000, allocation: alloc("planned", "outOfModel", "capToCashflow") });
    const y0 = assertEngineInvariantsClean(s)[0];
    expect(y0.flows.cashflowBridge!.cashflowBeforeSavings).toBeLessThan(0);
    expect(y0.flows.investedAmount).toBeLessThanOrEqual(0.5);
  });

  it("cashflow-based savings mode ⇒ entire positive cashflow invested", () => {
    const s = workingScenario({ spendingMonthly: 10_000, allocation: alloc("cashflow", "outOfModel") });
    const y0 = assertEngineInvariantsClean(s)[0];
    const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
    expect(cf).toBeGreaterThan(0);
    expect(y0.flows.investedAmount).toBeCloseTo(cf, 0);
    expect(y0.flows.unallocatedCashflow).toBeLessThanOrEqual(0.5);
  });

  it("planned savings mode ⇒ exactly the planned amount invested when cashflow allows", () => {
    const s = workingScenario({ spendingMonthly: 10_000, allocation: alloc("planned", "investExtra") });
    const y0 = assertEngineInvariantsClean(s)[0];
    const planned = y0.flows.plannedFreeContribution;
    // investExtra reinvests the surplus too, so invested == full cashflow; planned is the floor.
    expect(y0.flows.investedAmount).toBeGreaterThanOrEqual(planned - 0.5);
  });

  it("no automatic investment mode (none) + outOfModel ⇒ nothing invested, cashflow left unallocated", () => {
    const s = workingScenario({ spendingMonthly: 10_000, allocation: alloc("none", "outOfModel") });
    const y0 = assertEngineInvariantsClean(s)[0];
    const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
    expect(cf).toBeGreaterThan(0);
    expect(y0.flows.investedAmount).toBeLessThanOrEqual(0.5);
    expect(y0.flows.unallocatedCashflow).toBeCloseTo(cf, 0);
  });

  describe("Surplus policies (planned mode, cashflow > planned)", () => {
    it("surplus toBuffer ⇒ surplus added to closing buffer", () => {
      const s = workingScenario({ spendingMonthly: 10_000, cashBuffer: 100_000, allocation: alloc("planned", "toBuffer") });
      const y0 = assertEngineInvariantsClean(s)[0];
      const surplus = y0.flows.cashflowBridge!.cashflowBeforeSavings - y0.flows.plannedFreeContribution;
      expect(surplus).toBeGreaterThan(0);
      expect(y0.flows.surplusAllocation!.toBuffer).toBeCloseTo(surplus, 0);
      expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer + surplus, 0);
    });

    it("surplus investExtra ⇒ surplus invested into free, buffer untouched", () => {
      const s = workingScenario({ spendingMonthly: 10_000, cashBuffer: 100_000, allocation: alloc("planned", "investExtra") });
      const y0 = assertEngineInvariantsClean(s)[0];
      const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
      const surplus = cf - y0.flows.plannedFreeContribution;
      expect(y0.flows.surplusAllocation!.toFreeInvestment).toBeCloseTo(surplus, 0);
      expect(y0.flows.investedAmount).toBeCloseTo(cf, 0);
      expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer, 0);
    });

    it("surplus outOfModel ⇒ surplus neither invested nor buffered (visible as unallocated)", () => {
      const s = workingScenario({ spendingMonthly: 10_000, cashBuffer: 100_000, allocation: alloc("planned", "outOfModel") });
      const y0 = assertEngineInvariantsClean(s)[0];
      const surplus = y0.flows.cashflowBridge!.cashflowBeforeSavings - y0.flows.plannedFreeContribution;
      expect(y0.flows.unallocatedCashflow).toBeCloseTo(surplus, 0);
      expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer, 0);
      expect(y0.flows.investedAmount).toBeCloseTo(y0.flows.plannedFreeContribution, 0);
    });
  });

  describe("Planned shortfall policies (positive cashflow below planned)", () => {
    function shortfallScenario(policy: PlannedShortfallPolicy, cashBuffer: number) {
      return workingScenario({ spendingMonthly: 35_000, cashBuffer, allocation: alloc("planned", "outOfModel", policy) });
    }

    it("capToCashflow ⇒ invest only available cashflow, buffer untouched, rest is unmet", () => {
      const s = shortfallScenario("capToCashflow", 200_000);
      const y0 = assertEngineInvariantsClean(s)[0];
      const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
      const planned = y0.flows.plannedFreeContribution;
      expect(y0.flows.investedAmount).toBeCloseTo(cf, 0);
      expect(y0.flows.plannedSavingsShortfall!.coveredByBuffer).toBeLessThanOrEqual(0.5);
      expect(y0.flows.plannedSavingsShortfall!.unmetPlannedInvestment).toBeCloseTo(planned - cf, 0);
      expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer, 0);
    });

    it("useBuffer ⇒ buffer tops up to the planned amount, buffer reduced accordingly", () => {
      const s = shortfallScenario("useBuffer", 200_000);
      const y0 = assertEngineInvariantsClean(s)[0];
      const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
      const planned = y0.flows.plannedFreeContribution;
      const gap = planned - cf;
      expect(y0.flows.plannedSavingsShortfall!.coveredByBuffer).toBeCloseTo(gap, 0);
      expect(y0.flows.investedAmount).toBeCloseTo(planned, 0);
      expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer - gap, 0);
    });

    it("showShortfall ⇒ shows missing planned savings, buffer untouched, not a consumption shortfall", () => {
      const s = shortfallScenario("showShortfall", 200_000);
      const y0 = assertEngineInvariantsClean(s)[0];
      const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
      const planned = y0.flows.plannedFreeContribution;
      expect(y0.flows.plannedSavingsShortfall!.policy).toBe("showShortfall");
      expect(y0.flows.plannedSavingsShortfall!.unmetPlannedInvestment).toBeCloseTo(planned - cf, 0);
      expect(y0.flows.investedAmount).toBeCloseTo(cf, 0);
      expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer, 0);
      expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// B. Buffer and shortfall
// ───────────────────────────────────────────────────────────────────────────
describe("Matrix B — Buffer & shortfall", () => {
  /** Negative cashflow, no other capital — buffer is the only possible source. */
  function deficitOnlyBuffer(bufferUsable: boolean) {
    const s = workingScenario({ spendingMonthly: 60_000, cashBuffer: 1_000_000, bufferUsableForShortfall: bufferUsable, allocation: alloc("planned", "outOfModel", "useBuffer") });
    s.inputs.free.balance = 0;
    s.inputs.holding.balance = 0;
    s.inputs.pension.balance = 0;
    return s;
  }

  it("bufferUsableForShortfall=false ⇒ buffer is NOT reduced; deficit is visible as shortfall (no money creation)", () => {
    const s = deficitOnlyBuffer(false);
    const y0 = assertEngineInvariantsClean(s)[0];
    const deficit = -y0.flows.cashflowBridge!.cashflowBeforeSavings;
    expect(deficit).toBeGreaterThan(0);
    expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer, 1);
    expect(y0.flows.withdrawals.buffer).toBeCloseTo(0, 1);
    expect(y0.shortfallAmount).toBeCloseTo(deficit, 1);
  });

  it("bufferUsableForShortfall=true ⇒ buffer reduction reflected in closing balance + audit, no shortfall", () => {
    const s = deficitOnlyBuffer(true);
    const y0 = assertEngineInvariantsClean(s)[0];
    const deficit = -y0.flows.cashflowBridge!.cashflowBeforeSavings;
    expect(deficit).toBeGreaterThan(0);
    expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer - deficit, 1);
    expect(y0.flows.withdrawals.buffer).toBeCloseTo(deficit, 1); // audit shows it clearly
    expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5);
  });

  it("negative cashflow never creates money: closing net worth = opening net worth + cashflow (zero returns, ample buffer)", () => {
    const s = deficitOnlyBuffer(true);
    const y0 = assertEngineInvariantsClean(s)[0];
    const nw = (b: typeof y0.opening) => b.free + b.pension + b.holding + b.buffer - b.debt;
    const cf = y0.flows.cashflowBridge!.cashflowBeforeSavings;
    expect(nw(y0.closing)).toBeCloseTo(nw(y0.opening) + cf, 1);
  });

  it("if buffer disallowed but other capital exists ⇒ capital covers deficit, buffer untouched", () => {
    const s = workingScenario({ spendingMonthly: 60_000, cashBuffer: 300_000, bufferUsableForShortfall: false, allocation: alloc("planned", "outOfModel", "useBuffer") });
    s.inputs.free.balance = 2_000_000;
    s.inputs.holding.balance = 0;
    s.inputs.pension.balance = 0;
    const y0 = assertEngineInvariantsClean(s)[0];
    const deficit = -y0.flows.cashflowBridge!.cashflowBeforeSavings;
    expect(deficit).toBeGreaterThan(0);
    expect(y0.closing.free).toBeCloseTo(y0.opening.free - deficit, 1);
    expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer, 1);
    expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// C. Capital withdrawal
// ───────────────────────────────────────────────────────────────────────────
describe("Matrix C — Capital withdrawal", () => {
  it("depotFirst ⇒ depot drained before holding", () => {
    const s = drawdownScenario("depotFirst", { free: 1_000_000, holding: 1_000_000 });
    const cw = assertEngineInvariantsClean(s)[0].flows.capitalWithdrawal!;
    expect(cw.effectiveOrder[0]).toBe("depot");
    expect(cw.grossBySource.depot).toBeGreaterThan(0);
    expect(cw.grossBySource.holding).toBeLessThanOrEqual(0.5);
  });

  it("holdingFirst ⇒ holding drained before depot", () => {
    const s = drawdownScenario("holdingFirst", { free: 1_000_000, holding: 2_000_000 });
    const cw = assertEngineInvariantsClean(s)[0].flows.capitalWithdrawal!;
    expect(cw.effectiveOrder[0]).toBe("holding");
    expect(cw.grossBySource.holding).toBeGreaterThan(0);
    expect(cw.grossBySource.depot).toBeLessThanOrEqual(0.5);
  });

  it("askFirst ⇒ ASK drained before depot", () => {
    const s = drawdownScenario("askFirst", { free: 1_000_000, ask: 800_000, holding: 1_000_000 });
    const cw = assertEngineInvariantsClean(s)[0].flows.capitalWithdrawal!;
    expect(cw.effectiveOrder[0]).toBe("ask");
    expect(cw.grossBySource.ask).toBeGreaterThan(0);
    expect(cw.grossBySource.depot).toBeLessThanOrEqual(0.5);
  });

  it("proRata ⇒ deficit split across depot and holding", () => {
    const s = drawdownScenario("proRata", { free: 1_000_000, holding: 1_000_000 });
    const cw = assertEngineInvariantsClean(s)[0].flows.capitalWithdrawal!;
    expect(cw.grossBySource.depot).toBeGreaterThan(0);
    expect(cw.grossBySource.holding).toBeGreaterThan(0);
  });

  it("pensionFirst BEFORE pension is available ⇒ pension is not touched, falls through to depot", () => {
    const s = drawdownScenario("pensionFirst", { currentAge: 60, free: 1_000_000, pension: 1_000_000 });
    const cw = assertEngineInvariantsClean(s)[0].flows.capitalWithdrawal!;
    expect(cw.grossBySource.pension).toBeLessThanOrEqual(0.5);
    expect(cw.grossBySource.depot).toBeGreaterThan(0);
  });

  it("pensionFirst AFTER pension is available ⇒ pension drained first", () => {
    const s = drawdownScenario("pensionFirst", { currentAge: 65, free: 1_000_000, pension: 1_000_000 });
    const cw = assertEngineInvariantsClean(s)[0].flows.capitalWithdrawal!;
    expect(cw.grossBySource.pension).toBeGreaterThan(0);
    expect(cw.grossBySource.depot).toBeLessThanOrEqual(0.5);
  });

  it("planned fixedAnnual capital withdrawal ⇒ fixed gross pulled from the chosen source even without a shortfall", () => {
    const s = drawdownScenario("depotFirst", { currentAge: 60, free: 1_000_000, spendingMonthly: 0, planned: "fixedAnnual", plannedAmount: 100_000 });
    const cw = assertEngineInvariantsClean(s)[0].flows.capitalWithdrawal!;
    expect(cw.grossBySource.depot).toBeCloseTo(100_000, 0);
    expect(cw.totalGross).toBeGreaterThan(0);
  });

  it("fillLowShareIncomeBracket ⇒ withdraws holding up to (but not above) the low-rate share-income bracket", () => {
    const s = drawdownScenario("holdingFirst", { currentAge: 60, holding: 5_000_000, spendingMonthly: 0, planned: "fillLowShareIncomeBracket" });
    const y0 = assertEngineInvariantsClean(s)[0];
    const cw = y0.flows.capitalWithdrawal!;
    expect(cw.grossBySource.holding).toBeCloseTo(TAX.shareThreshold, 0);
    // Everything sits in the low bracket ⇒ tax == gross * lowRate.
    expect(y0.flows.holdingPlanned.tax).toBeCloseTo(TAX.shareThreshold * TAX.shareLowRate, 0);
  });

  it("pull only what is needed: 'none' policy with sufficient cashflow makes no withdrawal", () => {
    const s = drawdownScenario("depotFirst", { currentAge: 60, free: 1_000_000, spendingMonthly: 0, planned: "none" });
    const cw = assertEngineInvariantsClean(s)[0].flows.capitalWithdrawal!;
    expect(cw.totalGross).toBeLessThanOrEqual(0.5);
  });

  it("resolveOrder gives the documented default ordering per strategy", () => {
    expect(resolveOrder("depotFirst", undefined)).toEqual(["depot", "holding", "ask", "pension"]);
    expect(resolveOrder("holdingFirst", undefined)).toEqual(["holding", "depot", "ask", "pension"]);
    expect(resolveOrder("askFirst", undefined)).toEqual(["ask", "depot", "holding", "pension"]);
    expect(resolveOrder("pensionFirst", undefined)).toEqual(["pension", "depot", "holding", "ask"]);
    expect(resolveOrder("custom", ["ask", "depot"])).toEqual(["ask", "depot", "holding", "pension"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// D. Tax buckets
// ───────────────────────────────────────────────────────────────────────────
describe("Matrix D — Tax buckets", () => {
  it("ASK tax stays separate and does NOT consume the 27/42 share-income bracket", () => {
    const inp = JSON.parse(JSON.stringify(defaultInputs));
    inp.free.depotTax = { enabled: true, method: "annualShareIncomeTax", costBasis: null, showDeferredTax: true };
    inp.free.ask = {
      enabled: true,
      currentValue: 100_000,
      priorYearEndValue: 100_000,
      depositLimit: 174_200,
      taxRate: 0.17,
      autoFillFirst: false,
      taxCreditCarryForward: 0,
      taxPaymentMode: "deductFromASK",
      withdrawalStrategy: "depotFirst",
    };
    const y0 = projectWithStopAge(inp, defaultAssumptions, inp.stopAge)[0];
    // ASK has its own (17%) tax line.
    expect(y0.flows.ask!.tax).toBeGreaterThan(0);
    // Share-income pool only sees the depot return, never the ASK growth.
    expect(y0.flows.shareIncome!.annualDepotTaxable).toBeCloseTo(Math.max(0, y0.flows.depot!.growthGross), 0);
  });

  it("holding distributions and realized depot gains share ONE personal 27/42 bracket (used once/year)", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 2_000_000;
    s.inputs.holding.balance = 3_000_000;
    s.inputs.holding.annualDistribution = 60_000;
    s.inputs.holding.startDistributionAtStopAge = false;
    s.inputs.holding.distributionFromAge = s.inputs.person.currentAge; // distribute immediately
    s.inputs.free.depotTax = { enabled: true, method: "realizationSimple", costBasis: 500_000, showDeferredTax: true };
    s.inputs.stopAge = s.inputs.person.currentAge; // force drawdown ⇒ depot realization too
    s.inputs.spending.desiredMonthlyNet = 50_000;
    s.inputs.income.familyFundAnnualNet = 0;
    const years = project(s, defaultAssumptions);
    const si = years[0].flows.shareIncome!;
    // Low bracket can be used at most once per year.
    expect(si.taxedAtLow).toBeLessThanOrEqual(si.threshold + 1);
    // Total share income = holding gross + realized depot gain (single shared pool, no double count).
    expect(si.totalShareIncome).toBeCloseTo(si.holdingGross + si.extraHoldingGross + si.realizedDepotGain, 0);
    expect(si.taxedAtLow + si.taxedAtHigh).toBeCloseTo(si.totalShareIncome, 0);
    // Engine's own once-per-year + sum-consistency oracles must also be clean for this scenario.
    expect(runModelValidation(s, years).failed).toBe(0);
  });

  it("the low-rate bracket is filled once across sources (applyShareIncomeTax pool)", () => {
    const ctx = newShareIncomeCtx(TAX);
    const a = applyShareIncomeTax(ctx, 30_000); // e.g. holding
    const b = applyShareIncomeTax(ctx, 80_000); // e.g. depot gain
    expect(a.atLow).toBeCloseTo(30_000, 6);
    expect(b.atLow).toBeCloseTo(TAX.shareThreshold - 30_000, 6); // only the remaining low room
    // Cumulative low-rate base never exceeds the threshold.
    expect(a.atLow + b.atLow).toBeCloseTo(TAX.shareThreshold, 6);
    expect(b.atHigh).toBeCloseTo(80_000 - (TAX.shareThreshold - 30_000), 6);
  });

  it("depot realization taxes ONLY the gain share, not the whole sale", () => {
    const gainRatio = 0.4;
    const r = grossSaleForNetNeeded(50_000, gainRatio, TAX.shareThreshold, TAX.shareLowRate, TAX.shareHighRate, 1_000_000);
    expect(r.realizedGain).toBeCloseTo(r.sale * gainRatio, 6); // only 40% of the sale is taxable gain
    expect(r.realizedGain).toBeLessThan(r.sale);
    // Tax is on the gain, so strictly less than taxing the full sale at the low rate.
    expect(r.tax).toBeLessThan(r.sale * TAX.shareLowRate);
    expect(r.sale - r.tax).toBeCloseTo(50_000, 0); // grossed-up to deliver the needed net
  });

  it("no double taxation: a sale with zero latent gain (costBasis = market value) incurs no share-income tax", () => {
    const r = grossSaleForNetNeeded(40_000, 0, TAX.shareThreshold, TAX.shareLowRate, TAX.shareHighRate, 1_000_000);
    expect(r.tax).toBe(0);
    expect(r.realizedGain).toBe(0);
    expect(r.sale).toBeCloseTo(40_000, 6);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// E. Persistence / compatibility
// ───────────────────────────────────────────────────────────────────────────
describe("Matrix E — Persistence & compatibility", () => {
  it("old scenario without the new fields still runs and validates", () => {
    const s = makeBaseScenario();
    // Strip every post-v0 field a legacy model would not have.
    delete (s.inputs as Record<string, unknown>).cashflowAllocation;
    delete (s.inputs as Record<string, unknown>).capitalWithdrawal;
    delete (s.inputs.free as Record<string, unknown>).ask;
    delete (s.inputs.free as Record<string, unknown>).depotTax;
    const years = project(s, defaultAssumptions);
    expect(years.length).toBeGreaterThan(0);
    expect(runModelValidation(s, years).failed).toBe(0);
    expect(runIntegrityChecks(s, years)).toEqual([]);
  });

  it("JSON roundtrip preserves the new fields and reproduces the projection exactly", () => {
    const s = makeBaseScenario();
    s.inputs.cashflowAllocation = alloc("planned", "investExtra", "useBuffer");
    s.inputs.capitalWithdrawal = {
      strategy: "holdingFirst",
      plannedWithdrawalPolicy: "fixedAnnual",
      plannedWithdrawalAmount: 50_000,
      startAge: null,
      startAtStopAge: true,
    };
    s.inputs.free.ask = {
      enabled: true,
      currentValue: 50_000,
      priorYearEndValue: 50_000,
      depositLimit: 174_200,
      taxRate: 0.17,
      autoFillFirst: true,
      taxCreditCarryForward: 0,
      taxPaymentMode: "deductFromASK",
      withdrawalStrategy: "askFirst",
    };
    s.inputs.free.depotTax = { enabled: true, method: "realizationSimple", costBasis: 200_000, showDeferredTax: true };

    const back = JSON.parse(JSON.stringify(s)) as Scenario;
    // Fields survive serialization.
    expect(back.inputs.cashflowAllocation).toEqual(s.inputs.cashflowAllocation);
    expect(back.inputs.capitalWithdrawal).toEqual(s.inputs.capitalWithdrawal);
    expect(back.inputs.free.ask).toEqual(s.inputs.free.ask);
    expect(back.inputs.free.depotTax).toEqual(s.inputs.free.depotTax);
    // Projection is byte-for-byte reproducible.
    const a = project(s, defaultAssumptions);
    const b = project(back, defaultAssumptions);
    expect(b.map((y) => y.netWorth)).toEqual(a.map((y) => y.netWorth));
  });

  it("export/debug report exposes enough to explain cashflow, savings, shortfall and capital withdrawal", () => {
    const s = makeBaseScenario();
    s.inputs.capitalWithdrawal = {
      strategy: "depotFirst",
      plannedWithdrawalPolicy: "fixedAnnual",
      plannedWithdrawalAmount: 40_000,
      startAge: null,
      startAtStopAge: true,
    };
    const years = project(s, defaultAssumptions);

    const exp = buildProjectionExport(s, defaultAssumptions, years);
    expect(exp.years.length).toBe(years.length);
    expect(exp.inputs).toBeDefined();
    expect(exp.assumptions).toBeDefined();

    // CSV carries the columns needed to explain each pillar.
    for (const col of [
      "cashflowBeforeSavings",
      "plannedInvestment",
      "actualInvestment",
      "surplusToBuffer",
      "surplusInvested",
      "surplusOutOfModel",
      "shortfall",
      "plannedSavingsShortfall",
    ] as const) {
      expect(PROJECTION_CSV_COLUMNS).toContain(col);
    }
    const csv = buildProjectionCsv(years);
    expect(csv.split("\n")[0]).toBe(PROJECTION_CSV_COLUMNS.join(","));
    expect(csv.split("\n").length).toBe(years.length + 1);

    // Per-year audit JSON parses and carries the full flows (incl. cashflow bridge + capital withdrawal).
    const audit = JSON.parse(buildYearAuditJson(s, years[0]));
    expect(audit.flows.cashflowBridge).toBeDefined();
    expect(audit.flows.capitalWithdrawal).toBeDefined();
    expect(audit).toHaveProperty("shortfallAmount");
    expect(audit).toHaveProperty("netWorth");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Broad invariant sweep — every matrix scenario must satisfy the engine's own
// validation + integrity oracles under BOTH zero-return and realistic returns.
// ───────────────────────────────────────────────────────────────────────────
describe("Matrix — broad invariant sweep (runModelValidation + runIntegrityChecks)", () => {
  const cases: Array<{ name: string; make: () => Scenario }> = [
    { name: "planned/surplus toBuffer", make: () => workingScenario({ spendingMonthly: 10_000, allocation: alloc("planned", "toBuffer") }) },
    { name: "planned/surplus investExtra", make: () => workingScenario({ spendingMonthly: 10_000, allocation: alloc("planned", "investExtra") }) },
    { name: "planned/surplus outOfModel", make: () => workingScenario({ spendingMonthly: 10_000, allocation: alloc("planned", "outOfModel") }) },
    { name: "cashflow mode", make: () => workingScenario({ spendingMonthly: 10_000, allocation: alloc("cashflow", "investExtra") }) },
    { name: "none mode/outOfModel", make: () => workingScenario({ spendingMonthly: 10_000, allocation: alloc("none", "outOfModel") }) },
    { name: "planned shortfall capToCashflow", make: () => workingScenario({ spendingMonthly: 35_000, cashBuffer: 200_000, allocation: alloc("planned", "outOfModel", "capToCashflow") }) },
    { name: "planned shortfall useBuffer", make: () => workingScenario({ spendingMonthly: 35_000, cashBuffer: 200_000, allocation: alloc("planned", "outOfModel", "useBuffer") }) },
    { name: "planned shortfall showShortfall", make: () => workingScenario({ spendingMonthly: 35_000, cashBuffer: 200_000, allocation: alloc("planned", "outOfModel", "showShortfall") }) },
    { name: "negative cashflow, buffer disallowed", make: () => { const s = workingScenario({ spendingMonthly: 60_000, cashBuffer: 1_000_000, bufferUsableForShortfall: false, allocation: alloc("planned", "outOfModel", "useBuffer") }); s.inputs.free.balance = 0; s.inputs.holding.balance = 0; s.inputs.pension.balance = 0; return s; } },
    { name: "negative cashflow, buffer allowed", make: () => { const s = workingScenario({ spendingMonthly: 60_000, cashBuffer: 1_000_000, bufferUsableForShortfall: true, allocation: alloc("planned", "outOfModel", "useBuffer") }); s.inputs.free.balance = 0; s.inputs.holding.balance = 0; s.inputs.pension.balance = 0; return s; } },
    { name: "withdrawal depotFirst", make: () => drawdownScenario("depotFirst", { free: 1_000_000, holding: 1_000_000 }) },
    { name: "withdrawal holdingFirst", make: () => drawdownScenario("holdingFirst", { free: 1_000_000, holding: 2_000_000 }) },
    { name: "withdrawal askFirst", make: () => drawdownScenario("askFirst", { free: 1_000_000, ask: 800_000, holding: 1_000_000 }) },
    { name: "withdrawal proRata", make: () => drawdownScenario("proRata", { free: 1_000_000, holding: 1_000_000 }) },
    { name: "withdrawal pensionFirst (after avail)", make: () => drawdownScenario("pensionFirst", { currentAge: 65, free: 1_000_000, pension: 1_000_000 }) },
    { name: "withdrawal fixedAnnual", make: () => drawdownScenario("depotFirst", { currentAge: 60, free: 1_000_000, spendingMonthly: 0, planned: "fixedAnnual", plannedAmount: 100_000 }) },
    { name: "default base scenario", make: () => makeBaseScenario() },
  ];

  for (const c of cases) {
    it(`valid under zero returns: ${c.name}`, () => {
      assertEngineInvariantsClean(c.make(), ZERO_RETURN);
    });
    it(`valid under realistic returns: ${c.name}`, () => {
      assertEngineInvariantsClean(c.make(), defaultAssumptions);
    });
  }
});
