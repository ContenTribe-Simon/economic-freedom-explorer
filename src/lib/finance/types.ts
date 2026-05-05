export type Bucket = "free" | "pension" | "holding";

export interface PersonInputs {
  currentAge: number;
  lifeExpectancy: number;
}

export interface FreeBucketInputs {
  /** Investerbar/fri kapital — får realafkast og bruges først ved udtræk. */
  balance: number;
  monthlyContribution: number;
  annualExtraContribution: number;
  /** Kontant buffer — tæller med i nettoformue, men investeres ikke. */
  cashBuffer: number;
  /** Hvis true må buffer bruges hvis fri kapital løber tør, før holding/pension. */
  bufferUsableForShortfall: boolean;
}

export interface PensionBucketInputs {
  balance: number;
  monthlyContribution: number;
  employerContribution: number; // monthly
}

export interface HoldingBucketInputs {
  balance: number;
  expectedExitValue: number;
  exitYear: number;
  annualDistribution: number;
  distributionFromAge: number;
  startDistributionAtStopAge: boolean;
}

export type DebtKind = "su" | "private" | "holding" | "personal_liability";
/** Hvor påvirker gælden cashflow.
 *  - private: fratrækkes privat cashflow (rente + ydelse)
 *  - holding: fratrækkes holdings cashflow (reducerer holding-saldo)
 *  - risk_only: vises i nettoformue/risiko, men påvirker ikke cashflow
 */
export type DebtCashflowImpact = "private" | "holding" | "risk_only";

export interface DebtItem {
  id: string;
  name: string;
  kind: DebtKind;
  balance: number;
  interestRate: number;
  monthlyPayment: number;
  impact: DebtCashflowImpact;
}

export type PartTimeMode = "gross_annual" | "net_monthly";
export interface PartTimeInputs {
  mode: PartTimeMode;
  grossAnnual: number;
  netMonthly: number;
  fromAge: number;
  untilAge: number;
}

export type StatePensionMode = "none" | "baseOnly" | "manualNet";
export interface StatePensionInputs {
  mode: StatePensionMode;
  fromAge: number;
  /** Brutto/år når mode = baseOnly. 2026 grundbeløb ≈ 90.528 kr. */
  baseGrossAnnual: number;
  /** Effektiv skat på folkepension (decimal). */
  effectiveTaxRate: number;
  /** Manuelt nettobeløb pr. år når mode = manualNet. */
  manualNetAnnual: number;
}

export interface IncomeInputs {
  salaryGross: number;
  partTime: PartTimeInputs;
  familyFundAnnualNet: number;
  familyFundUntilAge: number;
  statePension: StatePensionInputs;
}

export interface SpendingInputs {
  desiredMonthlyNet: number;
}

export interface TargetInputs {
  minNetWorthAtEnd: number;
}

export type SavingsLogic = "planned" | "cashflow" | "hybrid";

export interface ScenarioInputs {
  person: PersonInputs;
  free: FreeBucketInputs;
  pension: PensionBucketInputs;
  holding: HoldingBucketInputs;
  debts: DebtItem[];
  income: IncomeInputs;
  spending: SpendingInputs;
  target: TargetInputs;
  stopAge: number;
  fullRetireAge: number;
  savingsLogic: SavingsLogic;
}

export interface TaxAssumptions {
  amBidrag: number;
  laborBottomRate: number;
  laborTopRate: number;
  laborTopBracket: number;
  personalAllowance: number;
  shareLowRate: number;
  shareHighRate: number;
  shareThreshold: number;
  /** Effektiv skat ved PRIVAT/arbejdsmarkedspensionsudbetaling. Påvirker IKKE folkepension. */
  pensionPayoutRate: number;
  corporateRate: number;
}

export interface Assumptions {
  realReturn: { free: number; pension: number; holding: number };
  inflation: number;
  tax: TaxAssumptions;
  /** @deprecated — bruges som fallback hvis scenarier endnu ikke har statePension-objekt. */
  statePensionAnnualNet: number;
  withdrawOrder: Bucket[];
}

export interface YearFlows {
  salaryGross: number;
  salaryNet: number;
  partTimeNet: number;
  familyFundNet: number;
  statePensionNet: number;
  statePensionGross: number;
  statePensionTax: number;
  holdingDistributionNet: number;
  pensionPayoutNet: number;
  employerPensionContribution: number;
  ownPensionContribution: number;
  freeContribution: number;
  bufferContribution: number;
  spending: number;
  taxes: number;
  debtInterest: number;
  debtPrincipal: number;
  withdrawals: { free: number; pension: number; holding: number; buffer: number };
  withdrawalsGross: { free: number; pension: number; holding: number; buffer: number };
  cashflowSurplus: number;
  growth: { free: number; pension: number; holding: number };
}

export interface YearRow {
  age: number;
  yearIndex: number;
  opening: { free: number; pension: number; holding: number; debt: number; buffer: number };
  closing: { free: number; pension: number; holding: number; debt: number; buffer: number };
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
  /** Finansiel robusthed: 0–100 baseret på shortfall/slutformue. */
  financialRobustness: number;
  /** Antagelsesrisiko: 0–100, højere = mere afhængig af optimistiske antagelser. */
  assumptionRisk: number;
  /** Bagudkompatibel — alias for financialRobustness. */
  robustnessScore: number;
  minNetWorthAtEnd: number;
}

export type SanitySeverity = "info" | "warn" | "error";
export interface SanityCheck {
  id: string;
  severity: SanitySeverity;
  title: string;
  detail?: string;
}
