import { Assumptions, DebtItem, Scenario, ScenarioInputs } from "./types";

export const defaultAssumptions: Assumptions = {
  realReturn: { free: 0.05, pension: 0.05, holding: 0.04 },
  inflation: 0.02,
  tax: {
    amBidrag: 0.08,
    laborBottomRate: 0.37,
    laborTopRate: 0.52,
    laborTopBracket: 611800,
    personalAllowance: 51600,
    shareLowRate: 0.27,
    shareHighRate: 0.42,
    shareThreshold: 79400,
    corporateRate: 0.22,
  },
  statePensionAnnualNet: 90000,
  withdrawOrder: ["free", "holding", "pension"],
};

const id = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export const defaultDebts: DebtItem[] = [
  {
    id: id(),
    name: "Privat boliglån",
    kind: "private",
    balance: 1500000,
    interestRate: 0.04,
    monthlyPayment: 9000,
    impact: "private",
    includeInNetWorth: true,
  },
  { id: id(), name: "SU-lån", kind: "su", balance: 0, interestRate: 0.04, monthlyPayment: 0, impact: "private", includeInNetWorth: true },
  { id: id(), name: "Holdinggæld", kind: "holding", balance: 0, interestRate: 0.05, monthlyPayment: 0, impact: "holding", includeInNetWorth: true, holdingFinancing: "holding_capital" },
  { id: id(), name: "Personlig hæftelse", kind: "personal_liability", balance: 0, interestRate: 0, monthlyPayment: 0, impact: "risk_only", includeInNetWorth: false },
];

export const defaultInputs: ScenarioInputs = {
  person: { currentAge: 40, lifeExpectancy: 95 },
  free: {
    balance: 500000,
    monthlyContribution: 10000,
    annualExtraContribution: 50000,
    cashBuffer: 100000,
    bufferUsableForShortfall: false,
  },
  pension: {
    balance: 800000,
    monthlyContribution: 4000,
    employerContribution: 6000,
    payoutFromAge: 64,
    ratePensionEnabled: true,
    ratePensionPayoutYears: 15,
    ratePensionEffectiveTaxRate: 0.4,
    lifeAnnuity: {
      enabled: false,
      mode: "gross",
      annualGross: 0,
      annualNet: 0,
      fromAge: 67,
      effectiveTaxRate: 0.4,
    },
  },
  holding: {
    balance: 1000000,
    expectedExitValue: 3000000,
    exitYear: new Date().getFullYear() + 10,
    annualDistribution: 0,
    distributionFromAge: 55,
    startDistributionAtStopAge: true,
    withdrawalStrategy: "planned_only",
    pensionAvailableFromAge: 60,
  },
  debts: defaultDebts,
  income: {
    salaryGross: 750000,
    partTime: {
      mode: "net_monthly",
      grossAnnual: 350000,
      netMonthly: 18000,
      fromAge: 55,
      untilAge: 62,
    },
    familyFundAnnualNet: 50000,
    familyFundUntilAge: 70,
    statePension: {
      mode: "baseOnly",
      fromAge: 67,
      baseGrossAnnual: 90528,
      effectiveTaxRate: 0.37,
      manualNetAnnual: 90000,
    },
  },
  spending: { desiredMonthlyNet: 35000 },
  target: { minNetWorthAtEnd: 0 },
  stopAge: 55,
  fullRetireAge: 62,
  savingsLogic: "planned",
};

export function makeBaseScenario(): Scenario {
  return {
    id: id(),
    name: "Base case",
    createdAt: Date.now(),
    inputs: structuredClone(defaultInputs),
  };
}
