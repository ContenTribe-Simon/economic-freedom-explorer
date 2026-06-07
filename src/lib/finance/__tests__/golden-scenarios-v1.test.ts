/**
 * Golden scenarios v1 — realistic reference projections whose key-year outputs are locked
 * so future engine changes that shift behaviour are caught.
 *
 * Design rules (per the golden-test brief):
 *  - Each scenario has a NAMED fixture + a short comment on the user situation it represents.
 *  - Key outputs are checked at selected ages using ROUNDED snapshots (nearest 1.000 kr) plus
 *    stable RELATIONAL assertions — not fragile exact decimals.
 *  - Exact integers are hard-coded only where the math is simple/intentional (e.g. life-event
 *    deltas, ASK deposit room) — NOT incidental tax decimals, so we don't lock simplifications
 *    in as if they were real Danish tax law.
 *  - Every scenario also passes structural invariants via projectGolden(): no NaN/Infinity,
 *    no negative bucket balances, and the engine's own oracles (runModelValidation /
 *    runIntegrityChecks) clean ⇒ no hidden inconsistency or hidden shortfall.
 *
 * Reference values were captured from the current (green-on-main) engine.
 */
import { describe, it, expect } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { runModelValidation } from "../modelValidation";
import { runIntegrityChecks } from "../integrity";
import { makeLifeEvent } from "../lifeEvents";
import type { Scenario, YearRow } from "../types";

const A = defaultAssumptions;
const TAX = A.tax;
const rk = (n: number) => Math.round(n / 1000) * 1000; // round to nearest 1.000 kr
const at = (years: YearRow[], age: number): YearRow => {
  const y = years.find((yy) => yy.age === age);
  if (!y) throw new Error(`no year for age ${age}`);
  return y;
};

/** Project + assert structural golden invariants that must hold for EVERY scenario. */
function projectGolden(s: Scenario): YearRow[] {
  const years = project(s, A);
  for (const y of years) {
    // No NaN / Infinity anywhere that matters.
    for (const v of [y.netWorth, y.shortfallAmount, y.totalIncomeNet, y.flows.investedAmount,
      y.closing.free, y.closing.buffer, y.closing.pension, y.closing.holding, y.closing.debt]) {
      expect(Number.isFinite(v), `finite @${y.age}`).toBe(true);
    }
    // Asset buckets never go negative (debt and net worth MAY be negative — explicitly modelled).
    for (const [k, v] of [["free", y.closing.free], ["buffer", y.closing.buffer], ["pension", y.closing.pension], ["holding", y.closing.holding]] as const) {
      expect(v, `${k} >= 0 @${y.age}`).toBeGreaterThanOrEqual(-0.5);
    }
    expect(y.shortfallAmount, `shortfall >= 0 @${y.age}`).toBeGreaterThanOrEqual(-0.5);
  }
  // Engine's own consistency oracles must be clean ⇒ no hidden shortfall / bracket / balance bugs.
  const rep = runModelValidation(s, years);
  expect(rep.failed, `runModelValidation: ${JSON.stringify(rep.results.filter((r) => r.status === "fail"))}`).toBe(0);
  expect(runIntegrityChecks(s, years)).toEqual([]);
  return years;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Simple wage earner with planned savings
//    A salaried 40-year-old who saves a fixed amount monthly, owns no company/holding,
//    retires at 55 and lives off free capital until the pension pays out from 64.
// ─────────────────────────────────────────────────────────────────────────────
function wageEarner(): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [];
  s.inputs.holding.balance = 0;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.free.balance = 200_000;
  s.inputs.free.cashBuffer = 100_000;
  s.inputs.free.monthlyContribution = 8_000;
  s.inputs.free.annualExtraContribution = 0;
  s.inputs.spending.desiredMonthlyNet = 30_000;
  s.inputs.person.lifeExpectancy = 90;
  s.inputs.cashflowAllocation = { surplusPolicy: "investExtra", bufferTarget: null, plannedInvestmentMethod: "planned", plannedShortfallPolicy: "useBuffer" };
  return s;
}

describe("Golden 1 — simple wage earner with planned savings", () => {
  it("locks key-year net worth and structural behaviour (no holding, pension only from 64)", () => {
    const years = projectGolden(wageEarner());
    // Golden net-worth snapshots: start / job-stop / pension age / final.
    expect(rk(at(years, 40).netWorth)).toBe(1_392_000);
    expect(rk(at(years, 55).netWorth)).toBe(7_677_000);
    expect(rk(at(years, 64).netWorth)).toBe(9_860_000);
    expect(rk(at(years, 90).netWorth)).toBe(9_481_000);
    // No holding anywhere; fully solvent (no shortfall) across the whole life.
    for (const y of years) {
      expect(y.closing.holding).toBe(0);
      expect(y.shortfallAmount).toBeLessThanOrEqual(0.5);
    }
    // Planned investment happens while working; pension is NOT drawn before pension age.
    expect(at(years, 40).flows.investedAmount).toBeGreaterThan(0);
    for (const y of years) {
      if (y.age < 64) expect(y.flows.ratePension.gross, `no pension payout @${y.age}`).toBeCloseTo(0, 1);
    }
    expect(at(years, 64).flows.ratePension.gross).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ASK-first investor
//    Investor whose planned savings auto-fill the ASK (Aktiesparekonto) up to the deposit
//    limit before spilling over into the ordinary depot. ASK is lager-taxed separately.
// ─────────────────────────────────────────────────────────────────────────────
function askFirstInvestor(): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [];
  s.inputs.holding.balance = 0;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.free.balance = 100_000;
  s.inputs.free.ask = {
    enabled: true, currentValue: 50_000, priorYearEndValue: 50_000, depositLimit: 174_200,
    taxRate: 0.17, autoFillFirst: true, taxCreditCarryForward: 0, taxPaymentMode: "deductFromASK",
    withdrawalStrategy: "askFirst",
  };
  s.inputs.free.monthlyContribution = 10_000;
  s.inputs.free.annualExtraContribution = 50_000;
  s.inputs.spending.desiredMonthlyNet = 25_000;
  s.inputs.person.lifeExpectancy = 90;
  return s;
}

describe("Golden 2 — ASK-first investor", () => {
  it("ASK fills to the deposit limit in year 0, overflow goes to depot, ASK tax stays separate", () => {
    const years = projectGolden(askFirstInvestor());
    const y0 = at(years, 40);
    const y1 = at(years, 41);

    // Net-worth snapshots.
    expect(rk(y0.netWorth)).toBe(1_348_000);
    expect(rk(y1.netWorth)).toBe(1_713_000);
    expect(rk(at(years, 55).netWorth)).toBe(8_882_000);

    // Year 0: ASK is filled by exactly the remaining deposit room (limit − prior-year-end).
    expect(y0.flows.ask!.depositRoom).toBe(174_200 - 50_000);
    expect(Math.round(y0.flows.ask!.contribution)).toBe(174_200 - 50_000);
    // Year 1 onward: ASK is full (no room), so contributions overflow into the ordinary depot.
    expect(y1.flows.ask!.depositRoom).toBe(0);
    expect(y1.flows.ask!.contribution).toBeCloseTo(0, 1);
    expect(y1.flows.ask!.freeDepotClosing).toBeGreaterThan(y0.flows.ask!.freeDepotClosing);

    // ASK has its own (separate) tax line every growth year; ASK + depot reconcile to free.
    for (const y of years) {
      const ask = y.flows.ask!;
      expect(ask.tax).toBeGreaterThanOrEqual(0);
      if (ask.growthGross > 0.5) expect(ask.tax).toBeGreaterThan(0);
      expect(ask.closing + ask.freeDepotClosing).toBeCloseTo(y.closing.free, 0);
    }
    // Rounded ASK / depot snapshots in the fill year.
    expect(rk(y0.flows.ask!.closing)).toBe(181_000);
    expect(rk(y0.flows.ask!.freeDepotClosing)).toBe(101_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Depot-only investor
//    No ASK, no holding. Ordinary depot (with a cost basis) grows during work and later
//    funds withdrawals via realization-simple tax. Cost basis / unrealized gains must stay
//    consistent and withdrawals must not create money.
// ─────────────────────────────────────────────────────────────────────────────
function depotOnlyInvestor(): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [];
  s.inputs.holding.balance = 0;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.free.balance = 1_000_000;
  s.inputs.free.cashBuffer = 50_000;
  s.inputs.free.depotTax = { enabled: true, method: "realizationSimple", costBasis: 400_000, showDeferredTax: true };
  s.inputs.spending.desiredMonthlyNet = 22_000;
  s.inputs.stopAge = 58;
  s.inputs.fullRetireAge = 58;
  s.inputs.person.lifeExpectancy = 85;
  return s;
}

describe("Golden 3 — depot-only investor", () => {
  it("depot grows then funds withdrawals; cost basis / unrealized gains stay consistent", () => {
    const years = projectGolden(depotOnlyInvestor());

    expect(rk(at(years, 40).netWorth)).toBe(2_245_000);
    expect(rk(at(years, 58).netWorth)).toBe(13_320_000);
    expect(rk(at(years, 63).netWorth)).toBe(15_422_000);
    expect(rk(at(years, 85).netWorth)).toBe(27_713_000);

    let sawSale = false;
    for (const y of years) {
      const d = y.flows.depot!;
      // Cost-basis invariants (durable, not tax-rate specific).
      expect(d.costBasisClosing, `cost basis >= 0 @${y.age}`).toBeGreaterThanOrEqual(-0.5);
      expect(d.costBasisClosing, `cost basis <= value @${y.age}`).toBeLessThanOrEqual(d.closing + 1);
      expect(d.unrealizedGainClosing, `unrealized def @${y.age}`).toBeCloseTo(Math.max(0, d.closing - d.costBasisClosing), 0);
      // Withdrawals do not create money: realized gain ≤ sale, net to cashflow = sale − tax.
      expect(d.realizedGain, `realized <= sale @${y.age}`).toBeLessThanOrEqual(d.grossSale + 1);
      expect(d.netToCashflow, `net = sale - tax @${y.age}`).toBeCloseTo(d.grossSale - d.saleTax, 0);
      if (d.grossSale > 0.5) { sawSale = true; expect(y.age).toBeGreaterThanOrEqual(58); }
    }
    expect(sawSale, "depot actually funds withdrawals after stop").toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Holding-exit scenario
//    Business owner whose holding company is exited (value lands in the exit year) and then
//    distributed via the capital-withdrawal strategy. Working years are kept SOLVENT so the
//    holding is genuinely untouched before the distribution phase begins at stopAge.
// ─────────────────────────────────────────────────────────────────────────────
function holdingExit(): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [];
  s.inputs.holding.balance = 500_000;
  s.inputs.holding.expectedExitValue = 2_000_000;
  s.inputs.holding.exitYear = new Date().getFullYear() + 10; // age 50
  s.inputs.holding.annualDistribution = 80_000;
  s.inputs.free.balance = 300_000;
  s.inputs.free.depotTax = { enabled: true, method: "realizationSimple", costBasis: 150_000, showDeferredTax: true };
  s.inputs.spending.desiredMonthlyNet = 28_000; // solvent while working ⇒ holding untouched pre-55
  s.inputs.stopAge = 55;
  s.inputs.fullRetireAge = 55;
  s.inputs.capitalWithdrawal = { strategy: "holdingFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 80_000, startAge: null, startAtStopAge: true };
  s.inputs.person.lifeExpectancy = 85;
  return s;
}

describe("Golden 4 — holding-exit scenario", () => {
  it("holding untouched before stopAge, exit value lands at age 50, distributions from 55, shared bracket respected", () => {
    const years = projectGolden(holdingExit());

    expect(rk(at(years, 40).netWorth)).toBe(2_043_000);
    expect(rk(at(years, 50).netWorth)).toBe(8_633_000);
    expect(rk(at(years, 55).netWorth)).toBe(11_540_000);
    expect(rk(at(years, 85).netWorth)).toBe(15_398_000);

    // Holding is NOT used before the distribution phase (stopAge 55).
    for (const y of years) {
      if (y.age < 55) expect(y.flows.capitalWithdrawal!.grossBySource.holding, `holding untouched @${y.age}`).toBeCloseTo(0, 1);
    }
    // Distributions begin at stopAge.
    expect(at(years, 55).flows.capitalWithdrawal!.grossBySource.holding).toBeGreaterThan(0);

    // Exit value (~2.000.000) lands in the exit year (age 50).
    expect(at(years, 50).closing.holding - at(years, 49).closing.holding).toBeGreaterThan(1_900_000);

    // Holding + depot share ONE personal 27/42 low bracket each year (never doubled).
    for (const y of years) {
      const si = y.flows.shareIncome;
      if (!si) continue;
      expect(si.taxedAtLow, `low<=threshold @${y.age}`).toBeLessThanOrEqual(si.threshold + 1);
      expect(si.totalShareIncome).toBeCloseTo(si.holdingGross + si.extraHoldingGross + si.realizedDepotGain + si.annualDepotTaxable, 0);
    }
  });

  // Separate explicit test: holdingFirst MAY cover a working-year cashflow deficit when holding
  // capital is available and the strategy allows it. This is intentional behaviour and must
  // remain covered even though the golden fixture above keeps working years solvent.
  it("holdingFirst covers a genuine working-year deficit from holding (intentional, not a hidden shortfall)", () => {
    const s = holdingExit();
    s.inputs.spending.desiredMonthlyNet = 40_000; // income < spending in early working years ⇒ small deficit
    const years = projectGolden(s);
    const y0 = at(years, 40);
    // There is a real (small) cashflow deficit at age 40...
    expect(y0.flows.cashflowBridge!.cashflowBeforeSavings).toBeLessThan(0);
    // ...covered by a holding withdrawal (holdingFirst), so there is NO consumption shortfall.
    expect(y0.flows.capitalWithdrawal!.grossBySource.holding).toBeGreaterThan(0);
    expect(y0.flows.holdingExtra.net).toBeGreaterThan(0);
    expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5);
    // The cover is genuine: net delivered ≈ the deficit (no money created).
    expect(y0.flows.holdingExtra.net).toBeCloseTo(-y0.flows.cashflowBridge!.cashflowBeforeSavings, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. High debt + low buffer
//    Highly leveraged household with a big mortgage and a thin cash buffer. Debt service
//    squeezes cashflow; the buffer is spent first, then the shortfall becomes visible.
// ─────────────────────────────────────────────────────────────────────────────
function highDebtLowBuffer(): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [{ id: "L", name: "Boliglån", kind: "private", balance: 2_500_000, interestRate: 0.05, monthlyPayment: 16_000, impact: "private", includeInNetWorth: true }];
  s.inputs.holding.balance = 0;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.free.balance = 150_000;
  s.inputs.free.cashBuffer = 80_000;
  s.inputs.free.bufferUsableForShortfall = true;
  s.inputs.free.monthlyContribution = 2_000;
  s.inputs.free.annualExtraContribution = 0;
  s.inputs.spending.desiredMonthlyNet = 32_000;
  s.inputs.stopAge = 55;
  s.inputs.fullRetireAge = 60;
  s.inputs.person.lifeExpectancy = 85;
  return s;
}

describe("Golden 5 — high debt + low buffer", () => {
  it("debt amortizes, buffer depletes, shortfall becomes visible, net worth is not artificially preserved", () => {
    const years = projectGolden(highDebtLowBuffer());

    // Net worth starts NEGATIVE (debt > assets) — explicitly modelled — then recovers as debt is paid.
    expect(rk(at(years, 40).netWorth)).toBe(-1_340_000);
    expect(rk(at(years, 50).netWorth)).toBe(1_610_000);
    expect(rk(at(years, 55).netWorth)).toBe(3_686_000);
    expect(rk(at(years, 85).netWorth)).toBe(0);

    // Debt amortizes monotonically to zero.
    for (let i = 1; i < years.length; i++) {
      expect(years[i].closing.debt, `debt non-increasing @${years[i].age}`).toBeLessThanOrEqual(years[i - 1].closing.debt + 0.5);
    }
    expect(rk(at(years, 40).closing.debt)).toBe(2_433_000);
    expect(at(years, 85).closing.debt).toBeCloseTo(0, 0);

    // Low buffer is depleted (allowed), then a real, visible shortfall appears.
    expect(at(years, 50).closing.buffer).toBeCloseTo(0, 0);
    expect(at(years, 50).shortfallAmount).toBeGreaterThan(0);
    // Net worth is not artificially preserved once capital is gone.
    expect(at(years, 85).netWorth).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Life phase scenario
//    Family with children raising spending for ~9 years, plus a temporary extra income for
//    a few of those years. Effects must apply only inside their intended age windows.
// ─────────────────────────────────────────────────────────────────────────────
function lifePhase(): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [];
  s.inputs.holding.balance = 0;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.free.balance = 300_000;
  s.inputs.free.cashBuffer = 100_000;
  s.inputs.spending.desiredMonthlyNet = 28_000;
  s.inputs.person.lifeExpectancy = 88;
  s.inputs.lifeEvents = [
    makeLifeEvent({ name: "Børn", category: "children", effectTarget: "privateSpending", effectDirection: "increase", frequency: "monthly", amount: 6_000, startAge: 42, endAge: 50 }),
    makeLifeEvent({ name: "Ekstra job", category: "income_change", effectTarget: "privateIncome", effectDirection: "increase", frequency: "monthly", amount: 5_000, startAge: 45, endAge: 47 }),
  ];
  return s;
}

describe("Golden 6 — life phase (children + temporary extra income)", () => {
  it("life-event effects apply only within their intended age windows", () => {
    const years = projectGolden(lifePhase());

    // Extra spending (+6.000/md = +72.000/yr) is active ages 42–50 inclusive, zero outside.
    for (const y of years) {
      const sd = y.flows.lifeEventEffects?.spendingDelta ?? 0;
      if (y.age >= 42 && y.age <= 50) expect(sd, `spendDelta active @${y.age}`).toBeCloseTo(72_000, 0);
      else expect(sd, `spendDelta off @${y.age}`).toBeCloseTo(0, 0);
    }
    // Extra income (+5.000/md = +60.000/yr) is active ages 45–47 inclusive, zero outside.
    for (const y of years) {
      const id = y.flows.lifeEventEffects?.incomeDelta ?? 0;
      if (y.age >= 45 && y.age <= 47) expect(id, `incDelta active @${y.age}`).toBeCloseTo(60_000, 0);
      else expect(id, `incDelta off @${y.age}`).toBeCloseTo(0, 0);
    }
    // Spending flow reflects the children window exactly (base 336.000 → 408.000).
    expect(at(years, 41).flows.spending).toBeCloseTo(336_000, 0);
    expect(at(years, 42).flows.spending).toBeCloseTo(408_000, 0);
    expect(at(years, 51).flows.spending).toBeCloseTo(336_000, 0);
    // Fully solvent throughout; locked final net worth.
    for (const y of years) expect(y.shortfallAmount).toBeLessThanOrEqual(0.5);
    expect(rk(at(years, 88).netWorth)).toBe(11_438_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Early stop before pension
//    Retires at 50 with employment income ending, but the pension is only available from 67.
//    Free/holding capital must bridge the gap; if it runs out, a shortfall appears, and the
//    pension is never used before its availability age.
// ─────────────────────────────────────────────────────────────────────────────
function earlyStop(): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [];
  s.inputs.holding.balance = 400_000;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.holding.annualDistribution = 0;
  s.inputs.free.balance = 1_500_000;
  s.inputs.free.cashBuffer = 200_000;
  s.inputs.pension.balance = 1_000_000;
  s.inputs.pension.payoutFromAge = 67;
  s.inputs.pension.ratePensionEnabled = true;
  s.inputs.income.statePension = { ...s.inputs.income.statePension, fromAge: 67 };
  s.inputs.spending.desiredMonthlyNet = 35_000;
  s.inputs.stopAge = 50;
  s.inputs.fullRetireAge = 50;
  s.inputs.capitalWithdrawal = { strategy: "depotFirst", plannedWithdrawalPolicy: "none", plannedWithdrawalAmount: 0, startAge: null, startAtStopAge: true };
  s.inputs.person.lifeExpectancy = 85;
  return s;
}

describe("Golden 7 — early stop before pension", () => {
  it("free/holding bridge the gap, pension is never used before 67, shortfall appears when the bridge is insufficient", () => {
    const years = projectGolden(earlyStop());

    expect(rk(at(years, 50).netWorth)).toBe(7_073_000);
    expect(rk(at(years, 64).netWorth)).toBe(6_881_000);
    expect(rk(at(years, 67).netWorth)).toBe(7_386_000);

    // Pension is NOT used (neither payout stream nor capital withdrawal) before the availability age.
    for (const y of years) {
      if (y.age < 67) {
        expect(y.flows.ratePension.gross, `no ratepension @${y.age}`).toBeCloseTo(0, 1);
        expect(y.flows.capitalWithdrawal!.grossBySource.pension, `no pension CW @${y.age}`).toBeCloseTo(0, 1);
      }
    }
    // Bridge capital funds the early-retirement years (free is drawn down before pension age).
    expect(at(years, 50).closing.free).toBeGreaterThan(0);
    expect(at(years, 64).closing.free).toBeLessThan(at(years, 50).closing.free);
    // Bridge eventually insufficient ⇒ a visible shortfall before pension unlocks...
    expect(at(years, 64).shortfallAmount).toBeGreaterThan(0);
    // ...then the pension pays out from 67 and covers spending again.
    expect(at(years, 67).flows.ratePension.gross).toBeGreaterThan(0);
    expect(at(years, 67).shortfallAmount).toBeLessThanOrEqual(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Pension-first drawdown
//    A 60-year-old retiree using a pension-first strategy with a large pension pot. The
//    pension may only be tapped from its availability age (64); before that, other capital
//    is used. The pension balance must decrease consistently and never be double-counted.
// ─────────────────────────────────────────────────────────────────────────────
function pensionFirst(): Scenario {
  const s = makeBaseScenario();
  s.inputs.debts = [];
  s.inputs.holding.balance = 0;
  s.inputs.holding.expectedExitValue = 0;
  s.inputs.free.balance = 300_000;
  s.inputs.free.cashBuffer = 0;
  s.inputs.pension.balance = 3_000_000;
  s.inputs.pension.payoutFromAge = 64;
  s.inputs.pension.ratePensionEnabled = false;
  s.inputs.income.statePension = { ...s.inputs.income.statePension, mode: "none" };
  s.inputs.income.familyFundAnnualNet = 0;
  s.inputs.spending.desiredMonthlyNet = 30_000;
  s.inputs.person.currentAge = 60;
  s.inputs.stopAge = 60;
  s.inputs.fullRetireAge = 60;
  s.inputs.capitalWithdrawal = { strategy: "pensionFirst", plannedWithdrawalPolicy: "none", plannedWithdrawalAmount: 0, startAge: null, startAtStopAge: true };
  s.inputs.person.lifeExpectancy = 85;
  return s;
}

describe("Golden 8 — pension-first drawdown", () => {
  it("pension is used only from its availability age, decreases consistently, and is not double-counted", () => {
    const years = projectGolden(pensionFirst());

    expect(rk(at(years, 60).netWorth)).toBe(3_150_000);
    expect(rk(at(years, 64).netWorth)).toBe(3_199_000);
    expect(rk(at(years, 65).netWorth)).toBe(2_729_000);
    expect(rk(at(years, 85).netWorth)).toBe(0);

    // Pension is NOT tapped before its availability age (64); other capital (depot) is used instead.
    for (const y of years) {
      if (y.age < 64) expect(y.flows.capitalWithdrawal!.grossBySource.pension, `no pension before 64 @${y.age}`).toBeCloseTo(0, 1);
    }
    expect(at(years, 60).flows.capitalWithdrawal!.grossBySource.depot).toBeGreaterThan(0); // bridge from depot first
    expect(at(years, 64).flows.capitalWithdrawal!.grossBySource.pension).toBeGreaterThan(0); // pension unlocks at 64

    // Pension balance decreases consistently once drawdown begins (never increases, never negative).
    const drawdownYears = years.filter((y) => y.age >= 64);
    for (let i = 1; i < drawdownYears.length; i++) {
      expect(drawdownYears[i].closing.pension, `pension non-increasing @${drawdownYears[i].age}`).toBeLessThanOrEqual(drawdownYears[i - 1].closing.pension + 0.5);
      expect(drawdownYears[i].closing.pension).toBeGreaterThanOrEqual(-0.5);
    }
  });
});
