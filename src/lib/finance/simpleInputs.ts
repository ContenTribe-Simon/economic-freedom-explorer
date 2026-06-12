import type { Assumptions, Scenario, ScenarioInputs } from "./types";
import { defaultAssumptions, defaultInputs } from "./defaults";

/**
 * Simple public input surface (MVP) → existing model mapping.
 *
 * This module is a PRESENTATION / INPUT-MAPPING layer only. It builds a standard, valid
 * `ScenarioInputs` (+ `Assumptions`) that the EXISTING projection engine consumes — it does
 * NOT contain any projection logic and is NOT a second model. See docs/public-mvp-scope-v1.md
 * (§3 inputs) and docs/model-primitives-v1.md (§8 "Public MVP vs Advanced Mode").
 *
 * Naming is intentionally generic — no Simon-/Denmark-specific terms (no holding/ASK/folkepension/
 * ratepension/livrente/Barma). Advanced surfaces the simple form does not expose are mapped to
 * safe OFF/zero defaults; nothing about the engine or existing scenarios is changed.
 */
export interface SimplePublicInputs {
  /** Current age (start of the projection horizon). */
  currentAge: number;
  /** Planning horizon end age. */
  lifeExpectancy: number;
  /** Gross annual income today, in real terms. */
  annualIncome: number;
  /** Desired monthly spending (net, real terms) — the dominant lever. */
  monthlySpending: number;
  /** Current invested capital ("what you've invested so far"). */
  currentInvestments: number;
  /** Ongoing monthly saving into investments. */
  monthlySavings: number;
  /** Current pension balance. */
  pensionBalance: number;
  /** Age the pension becomes accessible / starts paying out. */
  pensionAccessAge: number;
  /** Expected real return as a decimal (e.g. 0.04 = 4%). One field for the simple surface. */
  expectedRealReturn: number;
  /** Desired stop / retirement age (the user's goal). */
  desiredStopAge: number;
  /** Optional FI target: minimum net worth required at the end of the horizon. */
  fiTargetMinNetWorth?: number;
}

/** A neutral, generic default persona for the simple public form (NOT Simon-specific). */
export const DEFAULT_SIMPLE_INPUTS: SimplePublicInputs = {
  currentAge: 35,
  lifeExpectancy: 90,
  annualIncome: 500_000,
  monthlySpending: 20_000,
  currentInvestments: 200_000,
  monthlySavings: 8_000,
  pensionBalance: 300_000,
  pensionAccessAge: 67,
  expectedRealReturn: 0.04,
  desiredStopAge: 60,
};

/**
 * Map simple public inputs onto a full `ScenarioInputs`.
 *
 * Strategy: start from the existing `defaultInputs` (so every nested field is present and the
 * result is structurally valid), set the public fields, and DISABLE the advanced surfaces the
 * simple form intentionally does not expose:
 *   - business/holding capital, ASK / depot-tax treatments, cash buffer,
 *   - part-time bridge income, private transfers, locale state pension,
 *   - ongoing pension contributions / lifetime annuity, debt, life events,
 *   - advanced cashflow-allocation / capital-withdrawal policies.
 *
 * These are mapping choices for the *simple surface* — they describe what a simple scenario
 * contains, and do not change the engine, the defaults, or any existing scenario.
 */
export function toScenarioInputs(s: SimplePublicInputs): ScenarioInputs {
  const inp: ScenarioInputs = structuredClone(defaultInputs);

  // ---- Lifecycle ----
  inp.person.currentAge = s.currentAge;
  inp.person.lifeExpectancy = s.lifeExpectancy;
  inp.stopAge = s.desiredStopAge;
  inp.fullRetireAge = s.desiredStopAge;

  // ---- Income: a single salary stream while working. Advanced / locale streams off. ----
  inp.income.salaryGross = s.annualIncome;
  inp.income.partTime = { ...inp.income.partTime, grossAnnual: 0, netMonthly: 0 };
  inp.income.familyFundAnnualNet = 0;
  inp.income.statePension = { ...inp.income.statePension, mode: "none" };

  // ---- Spending ----
  inp.spending.desiredMonthlyNet = s.monthlySpending;

  // ---- Investments (free capital). No ASK / depot-tax / buffer in the simple surface. ----
  inp.free.balance = s.currentInvestments;
  inp.free.monthlyContribution = s.monthlySavings;
  inp.free.annualExtraContribution = 0;
  inp.free.cashBuffer = 0;
  delete (inp.free as { ask?: unknown }).ask;
  delete (inp.free as { depotTax?: unknown }).depotTax;

  // ---- Pension: a starting balance + access age. No ongoing contributions / annuity in v1. ----
  inp.pension.balance = s.pensionBalance;
  inp.pension.payoutFromAge = s.pensionAccessAge;
  inp.pension.monthlyContribution = 0;
  inp.pension.employerContribution = 0;
  inp.pension.lifeAnnuity = { ...inp.pension.lifeAnnuity, enabled: false };

  // ---- Business / holding capital is an advanced feature — off in the simple surface. ----
  inp.holding.balance = 0;
  inp.holding.expectedExitValue = 0;
  inp.holding.annualDistribution = 0;

  // ---- No debt / life events / advanced policies in the simple surface. ----
  // `cashflowAllocation` is intentionally left undefined ⇒ the engine's existing default
  // applies: invest the stated `monthlySavings` (planned), and any *surplus* beyond it is not
  // auto-invested (surplus policy "outOfModel"). This keeps `monthlySavings` a meaningful lever
  // (more savings → more invested, up to available cashflow). Whether surplus should instead be
  // auto-invested (investExtra) in the public MVP is an OPEN PRODUCT QUESTION — see
  // docs/public-mvp-scope-v1.md. We do not change the engine default here.
  inp.debts = [];
  inp.lifeEvents = [];
  delete (inp as { capitalWithdrawal?: unknown }).capitalWithdrawal;
  delete (inp as { cashflowAllocation?: unknown }).cashflowAllocation;

  // ---- FI target ----
  inp.target = { minNetWorthAtEnd: s.fiTargetMinNetWorth ?? 0 };

  return inp;
}

/**
 * Map the one public "expected real return" onto the engine's per-bucket `realReturn`
 * assumptions (free / pension / holding). Every other assumption is taken unchanged from
 * `base` (default: the existing `defaultAssumptions`) — nothing else is altered.
 */
export function toAssumptions(s: SimplePublicInputs, base: Assumptions = defaultAssumptions): Assumptions {
  return {
    ...base,
    realReturn: {
      free: s.expectedRealReturn,
      pension: s.expectedRealReturn,
      holding: s.expectedRealReturn,
    },
  };
}

/**
 * Wrap the mapped inputs into a `Scenario` (type `custom`). Pure data construction — it does
 * NOT call the engine. Callers project it with the existing `project(scenario, assumptions)`
 * using `toAssumptions(simple)`.
 */
export function toScenario(s: SimplePublicInputs, opts?: { id?: string; name?: string; createdAt?: number }): Scenario {
  const id =
    opts?.id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  return {
    id,
    name: opts?.name ?? "Simple scenario",
    createdAt: opts?.createdAt ?? 0,
    type: "custom",
    inputs: toScenarioInputs(s),
  };
}
