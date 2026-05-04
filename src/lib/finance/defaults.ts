import { Assumptions, Scenario, ScenarioInputs } from "./types";

export const defaultAssumptions: Assumptions = {
  realReturn: { free: 0.05, pension: 0.05, holding: 0.04 },
  inflation: 0.02,
  tax: {
    amBidrag: 0.08,
    laborBottomRate: 0.37,
    laborTopRate: 0.52,
    laborTopBracket: 611800, // 2025-niveau ca.
    personalAllowance: 51600,
    shareLowRate: 0.27,
    shareHighRate: 0.42,
    shareThreshold: 79400, // single 2026
    pensionPayoutRate: 0.4,
    corporateRate: 0.22,
  },
  statePensionAnnualNet: 90000,
  withdrawOrder: ["free", "holding", "pension"],
};

export const defaultInputs: ScenarioInputs = {
  person: { currentAge: 40, lifeExpectancy: 95 },
  free: { balance: 500000, monthlyContribution: 10000, annualExtraContribution: 50000 },
  pension: { balance: 800000, monthlyContribution: 4000, employerContribution: 6000 },
  holding: {
    balance: 1000000,
    expectedExitValue: 3000000,
    exitYear: new Date().getFullYear() + 10,
    annualDistribution: 0,
    distributionFromAge: 55,
    startDistributionAtStopAge: true,
  },
  debt: { balance: 1500000, interestRate: 0.04, monthlyPayment: 9000 },
  income: {
    salaryGross: 750000,
    partTimeAnnualGross: 350000,
    partTimeFromAge: 55,
    partTimeUntilAge: 62,
    familyFundAnnualNet: 50000,
    familyFundUntilAge: 70,
    statePensionFromAge: 67,
  },
  spending: { desiredMonthlyNet: 35000 },
  target: { minNetWorthAtEnd: 0 },
  stopAge: 55,
  fullRetireAge: 62,
  savingsLogic: "planned",
};

export function makeBaseScenario(): Scenario {
  return {
    id: crypto.randomUUID(),
    name: "Base case",
    createdAt: Date.now(),
    inputs: structuredClone(defaultInputs),
  };
}
