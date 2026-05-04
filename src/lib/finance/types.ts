export type Bucket = "free" | "pension" | "holding";

export interface PersonInputs {
  currentAge: number;
  lifeExpectancy: number;
}

export interface FreeBucketInputs {
  balance: number;
  monthlyContribution: number;
  annualExtraContribution: number;
}

export interface PensionBucketInputs {
  balance: number;
  monthlyContribution: number;
  employerContribution: number; // monthly
}

export interface HoldingBucketInputs {
  balance: number;
  expectedExitValue: number;
  exitYear: number; // calendar year (or 0 = none)
  annualDistribution: number; // planned dividend
  /** Modellen må først udlodde fra denne alder. */
  distributionFromAge: number;
  /** Hvis true: distributionFromAge følger altid stopAge. */
  startDistributionAtStopAge: boolean;
}

export interface DebtInputs {
  balance: number;
  interestRate: number; // nominal real-ish, 0.04 etc
  monthlyPayment: number;
}

export interface IncomeInputs {
  salaryGross: number; // annual gross salary (before AM, tax)
  partTimeAnnualGross: number;
  partTimeFromAge: number;
  partTimeUntilAge: number;
  familyFundAnnualNet: number; // tax-free assumption
  familyFundUntilAge: number;
  statePensionFromAge: number;
}

export interface SpendingInputs {
  desiredMonthlyNet: number; // in real DKK
}

export interface TargetInputs {
  /** Mindste ønskede nettoformue ved slutalder (levealder). */
  minNetWorthAtEnd: number;
}

export type SavingsLogic = "planned" | "cashflow" | "hybrid";

export interface ScenarioInputs {
  person: PersonInputs;
  free: FreeBucketInputs;
  pension: PensionBucketInputs;
  holding: HoldingBucketInputs;
  debt: DebtInputs;
  income: IncomeInputs;
  spending: SpendingInputs;
  target: TargetInputs;
  stopAge: number; // age fuldtidsstop
  fullRetireAge: number; // age helt stop (deltid slutter)
  savingsLogic: SavingsLogic; // hvordan opsparing håndteres før stopalder
}

export interface TaxAssumptions {
  amBidrag: number; // 0.08
  laborBottomRate: number; // ~0.37 effective bottom incl. kommune
  laborTopRate: number; // ~0.52
  laborTopBracket: number; // DKK gross after AM where top kicks in
  personalAllowance: number; // DKK personfradrag
  shareLowRate: number; // 0.27
  shareHighRate: number; // 0.42
  shareThreshold: number; // DKK threshold (single)
  pensionPayoutRate: number; // 0.40 effective
  corporateRate: number; // 0.22 (info)
}

export interface Assumptions {
  realReturn: { free: number; pension: number; holding: number };
  inflation: number; // info only; we calc in real terms
  tax: TaxAssumptions;
  statePensionAnnualNet: number; // DKK/yr in real terms
  withdrawOrder: Bucket[]; // priority for shortfall withdrawals
}

export interface YearFlows {
  salaryGross: number;
  salaryNet: number;
  partTimeNet: number;
  familyFundNet: number;
  statePensionNet: number;
  holdingDistributionNet: number;
  pensionPayoutNet: number;
  employerPensionContribution: number;
  ownPensionContribution: number;
  freeContribution: number;
  spending: number;
  taxes: number;
  debtInterest: number;
  debtPrincipal: number;
  withdrawals: { free: number; pension: number; holding: number };
  // Bruttobeløb hævet fra holding/pension (før skat) til at dække udtræk
  withdrawalsGross: { free: number; pension: number; holding: number };
  // Hybrid mode: forskel mellem cashflow og planlagt opsparing (kan være negativ)
  cashflowSurplus: number;
  // Vækst på hver kasse (for audit)
  growth: { free: number; pension: number; holding: number };
}

export interface YearRow {
  age: number;
  yearIndex: number;
  opening: { free: number; pension: number; holding: number; debt: number };
  closing: { free: number; pension: number; holding: number; debt: number };
  flows: YearFlows;
  totalIncomeNet: number;
  netWorth: number;
  shortfall: boolean;
  shortfallAmount: number;
  monthlyGap: number;
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: number;
  notes?: string;
  inputs: ScenarioInputs;
  assumptionsOverride?: Partial<Assumptions>;
}

export interface KPIs {
  plannedStopAge: number;
  earliestSustainableStopAge: number | null;
  capitalAtStopAge: number;
  capitalAt65: number;
  capitalAt95: number;
  firstShortfallAge: number | null;
  monthlyGapAfterStop: number;
  robustnessScore: number;
}
