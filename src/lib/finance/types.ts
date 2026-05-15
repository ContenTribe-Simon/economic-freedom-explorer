export type Bucket = "free" | "pension" | "holding";

export interface PersonInputs {
  currentAge: number;
  lifeExpectancy: number;
}

/**
 * Stopregel for planlagt fri opsparing.
 *  - "stopAge": stop ved jobstop / stopalder (default)
 *  - "fullRetireAge": stop ved fuld pension (også deltid stoppet)
 *  - "customAge": stop ved en brugerdefineret alder
 *  - "never": fortsæt hele livet
 */
export type FreeContributionStopRule = "stopAge" | "fullRetireAge" | "customAge" | "never";

export interface FreeBucketInputs {
  /** Investerbar/fri kapital — får realafkast og bruges først ved udtræk. */
  balance: number;
  monthlyContribution: number;
  annualExtraContribution: number;
  /** Kontant buffer — tæller med i nettoformue, men investeres ikke. */
  cashBuffer: number;
  /** Hvis true må buffer bruges hvis fri kapital løber tør, før holding/pension. */
  bufferUsableForShortfall: boolean;
  /** Eksplicit stopregel for planlagt fri opsparing. Default: "stopAge". */
  contributionStopRule?: FreeContributionStopRule;
  /** Anvendt når contributionStopRule = "customAge". */
  contributionStopAge?: number;
}

export type LifeAnnuityMode = "gross" | "net";

export interface LifeAnnuityInputs {
  enabled: boolean;
  mode: LifeAnnuityMode;
  /** Forventet brutto/år (når mode = gross). */
  annualGross: number;
  /** Forventet netto/år (når mode = net). Bruges direkte uden yderligere skat. */
  annualNet: number;
  fromAge: number;
  /** Effektiv pensionsskat når mode = gross. */
  effectiveTaxRate: number;
}

export interface PensionBucketInputs {
  /** RATEPENSION (kapitalpulje med fast udbetalingsperiode) */
  /** Bagudkompatibel: ratepensionens nuværende saldo. */
  balance: number;
  /** Egen månedlig indbetaling til ratepension. */
  monthlyContribution: number;
  /** Arbejdsgiverbidrag til ratepension (månedligt). */
  employerContribution: number;
  /** Alder hvor ratepension begynder at udbetale. */
  payoutFromAge: number;
  /** Skal ratepension regnes med? */
  ratePensionEnabled: boolean;
  /** Udbetalingsperiode i år (typisk 10/15/20/25/30). */
  ratePensionPayoutYears: number;
  /** Effektiv skat ved ratepensionsudbetaling. */
  ratePensionEffectiveTaxRate: number;

  /** LIVSVARIG PENSION / LIVRENTE — stream uden kapitalpulje */
  lifeAnnuity: LifeAnnuityInputs;
}

/** Hvordan ekstra holdingudtræk håndteres ud over planlagt udlodning. */
export type HoldingWithdrawalStrategy =
  | "planned_only"               // kun planlagt årlig udlodning
  | "up_to_low_threshold"        // udlod automatisk op til lav-sats grænsen (efter distFromAge)
  | "allow_extra_on_shortfall"   // tillad ekstra holdingudtræk hvis shortfall
  | "pension_before_extra_holding"; // brug pension før ekstra holding (når pension er tilgængelig)

export interface HoldingBucketInputs {
  balance: number;
  expectedExitValue: number;
  exitYear: number;
  annualDistribution: number;
  distributionFromAge: number;
  startDistributionAtStopAge: boolean;
  withdrawalStrategy: HoldingWithdrawalStrategy;
  /** Pensionsudbetaling antages tilgængelig fra denne alder (bruges af pension_before_extra_holding). */
  pensionAvailableFromAge: number;
}

export type DebtKind = "su" | "private" | "holding" | "personal_liability";
/** Hvor påvirker gælden cashflow.
 *  - private: fratrækkes privat cashflow (rente + ydelse)
 *  - holding: fratrækkes holdings cashflow (reducerer holding-saldo) — se også HoldingDebtFinancing
 *  - risk_only: vises i nettoformue/risiko, men påvirker ikke cashflow
 */
export type DebtCashflowImpact = "private" | "holding" | "risk_only";

/** Hvordan en holdinggæld finansieres. */
export type HoldingDebtFinancing =
  | "holding_capital"   // betales af holdingens eksisterende kapital (kan udløse holding-shortfall)
  | "private_cashflow"  // betales af privat cashflow (som privat gæld)
  | "external_company"  // betales af ekstern selskabscashflow uden for modellen — ingen påvirkning
  | "exit_only"         // afdrages først ved exit — ingen løbende ydelse
  | "display_only";     // kun visning/risiko — ingen cashflow eller saldoreduktion

export interface DebtItem {
  id: string;
  name: string;
  kind: DebtKind;
  balance: number;
  interestRate: number;
  monthlyPayment: number;
  impact: DebtCashflowImpact;
  /** Skal denne post indgå i nettoformuen? Default true for reel gæld, false for risk_only. */
  includeInNetWorth?: boolean;
  /** Hvis denne post er en hæftelse koblet til en anden gældspost (typisk holdinggæld). */
  linkedDebtId?: string;
  /** Kun for kind=holding: hvordan gælden finansieres. Default: holding_capital. */
  holdingFinancing?: HoldingDebtFinancing;
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

/**
 * Generisk livsfase-event — fleksibelt lag oven på basismodellen.
 *
 * Påvirker beregningen KUN når `enabled === true` og året ligger inden for [startAge, endAge].
 * Tomme/utilkoblede arrays giver præcis samme projektion som tidligere.
 *
 * V1 understøtter beregningsmæssigt:
 *  - privateIncome   (recurring, monthly/annual): netto-indkomstændring i cashflow
 *  - privateSpending (recurring, monthly/annual): forbrugsændring i cashflow
 *  - freeCapital     (one_time):                  engangsændring af fri kapital i startAge
 *  - privateDebt     (one_time):                  engangsændring af privat gæld i startAge (persisterer)
 *
 * Øvrige effectTargets er gyldige i datamodellen, men har ingen beregningseffekt endnu
 * (forberedt til senere udvidelser).
 */
export type LifeEventCategory =
  | "income_change"
  | "expense_change"
  | "one_time_capital"
  | "debt_change"
  | "housing"
  | "children"
  | "work_pause"
  | "relocation"
  | "custom";

export type LifeEventFrequency = "monthly" | "annual" | "one_time";
export type LifeEventAmountMode = "net" | "gross" | "direct";
export type LifeEventEffectTarget =
  | "privateIncome"
  | "privateSpending"
  | "freeCapital"
  | "privateDebt"
  | "holdingCapital"
  | "holdingCashflow"
  | "pensionCapital"
  | "netWorthOnly";
export type LifeEventEffectDirection = "increase" | "decrease";

export interface LifeEvent {
  id: string;
  name: string;
  enabled: boolean;
  category: LifeEventCategory;
  startAge: number;
  endAge?: number;
  /** Altid positivt — fortegn styres af effectDirection. */
  amount: number;
  frequency: LifeEventFrequency;
  amountMode: LifeEventAmountMode;
  effectTarget: LifeEventEffectTarget;
  effectDirection: LifeEventEffectDirection;
  /** Real årlig vækstrate (default 0). Beløb forbliver i nutidskroner. */
  growthRate?: number;
  confidenceKey?: ConfidenceKey | null;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export type ConfidenceLevel = "very_high" | "high" | "low" | "speculative";
export type ConfidenceKey =
  | "salary"
  | "partTime"
  | "familyFund"
  | "statePension"
  | "ratePension"
  | "lifeAnnuity"
  | "holdingExit"
  | "returns"
  | "spending";
export type ScenarioConfidence = Partial<Record<ConfidenceKey, ConfidenceLevel>>;

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
  /** Brugerens sikkerhedsvurderinger pr. central antagelse. */
  confidence?: ScenarioConfidence;
  /** Forberedt: generiske livsfaser/events. Påvirker IKKE beregningen endnu. */
  lifeEvents?: LifeEvent[];
}

export type StressModifierKey = "noBarma" | "noPartTime" | "lowReturn" | "higherSpending" | "noFolkepension";
export type ScenarioModifiers = Record<StressModifierKey, boolean>;

export interface TaxAssumptions {
  amBidrag: number;
  laborBottomRate: number;
  laborTopRate: number;
  laborTopBracket: number;
  personalAllowance: number;
  shareLowRate: number;
  shareHighRate: number;
  shareThreshold: number;
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
  /** Samlet pensionsindkomst netto (rate + livrente + ekstra pensionsudtræk). */
  pensionPayoutNet: number;
  /** Ratepension – planlagt årlig udbetaling (brutto/netto/skat). */
  ratePension: { gross: number; net: number; tax: number; active: boolean };
  /** Livsvarig pension/livrente – årlig udbetaling (brutto/netto/skat). */
  lifeAnnuity: { gross: number; net: number; tax: number; active: boolean };
  /** Ekstra pensionsudtræk fra ratepension-saldoen ud over planlagt udbetaling (shortfall). */
  pensionExtra: { gross: number; net: number; tax: number };
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
  /** Planlagt holdingudlodning (brutto/netto/skat) — den faste, frivillige udlodning. */
  holdingPlanned: { gross: number; net: number; tax: number };
  /** Ekstra holdingudtræk udløst af shortfall-strategi. */
  holdingExtra: { gross: number; net: number; tax: number };
  /** Saldo for hver gældspost ved årets udgang + diagnostiske felter. */
  debtsDetail: DebtYearDetail[];
  cashflowSurplus: number;
  /** Positivt overskud, der ikke er investeret automatisk under den valgte opsparingslogik. */
  unallocatedCashflow: number;
  /** Faktisk investeret beløb i fri kapital i året (samme som freeContribution, men eksponeret eksplicit til audit). */
  investedAmount: number;
  /** Planlagt fri opsparing for året (kan være 0 hvis stoppet pga. stopregel). */
  plannedFreeContribution: number;
  /** Er den planlagte fri opsparing aktiv i året iht. stopreglen? */
  plannedContributionsActive: boolean;
  /** Resolved alder hvor planlagt fri opsparing stopper (null hvis aldrig). */
  plannedContributionStopAge: number | null;
  growth: { free: number; pension: number; holding: number };
  /** Manglende dækning af holdinggæld der skulle betales af holdingkapital. */
  holdingFinancingShortfall: number;
  /** Effekt fra aktive livsfaser i året (kun udfyldt når der er aktive events). */
  lifeEventEffects?: LifeEventYearEffect;
}

/** Aggregeret effekt af aktive livsfaser i et givent år. */
export interface LifeEventYearEffect {
  incomeDelta: number;
  spendingDelta: number;
  freeCapitalDelta: number;
  debtDelta: number;
  /** Per-event detaljer til audit-visning. */
  items: LifeEventYearItem[];
}

export interface LifeEventYearItem {
  id: string;
  name: string;
  category: LifeEventCategory;
  effectTarget: LifeEventEffectTarget;
  effectDirection: LifeEventEffectDirection;
  /** Beløb pr. år (eller engangsbeløb) i nutidskroner, signed. */
  signedAmount: number;
  frequency: LifeEventFrequency;
  notes?: string;
}

export interface DebtYearDetail {
  id: string;
  name: string;
  kind: DebtKind;
  impact: DebtCashflowImpact;
  opening: number;
  interest: number;
  principal: number;
  closing: number;
  includeInNetWorth: boolean;
  linkedDebtId?: string;
  /** Kort note om finansieringskilde / status for året. */
  financingNote?: string;
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

/**
 * Scenarie-type:
 *  - "base": uafhængigt basisscenarie. Kan redigeres frit.
 *  - "linked_stress_test": linket til et base-scenarie. Beregnes dynamisk som
 *    aktuel basecase + aktive modifiers — felterne i `inputs` er kun en cache
 *    og ignoreres ved beregning. Manuelle ændringer eskalerer scenariet til "custom".
 *  - "custom": uafhængigt scenarie. Kan stamme fra et stress-test eller være oprettet manuelt.
 *    Følger ikke længere automatisk basecase.
 */
export type ScenarioType = "base" | "linked_stress_test" | "custom";

export interface Scenario {
  id: string;
  name: string;
  createdAt: number;
  /** Sat ved persistens — bruges til fremtidig migration mod Supabase. */
  updatedAt?: number;
  notes?: string;
  /** Unikke stress-test modifiers anvendt på scenariet. */
  modifiers?: Partial<ScenarioModifiers>;
  /** Oprindeligt scenarie for modifier-kombinationen, når det kan spores. */
  baseScenarioId?: string;
  baseScenarioName?: string;
  inputs: ScenarioInputs;
  assumptionsOverride?: Partial<Assumptions>;
  /** Frit metadata-felt forberedt til fremtidig brug (Supabase, tags m.v.). */
  metadata?: Record<string, unknown>;
  /** Scenarietype — styrer om scenariet beregnes dynamisk eller bruger egne inputs. */
  type?: ScenarioType;
  /** Sat når et linket stress-test er blevet manuelt redigeret og dermed eskaleret til custom. */
  manuallyEdited?: boolean;
  /** Valgfri sporing af felter ændret ift. basecase (bruges ikke af motoren endnu). */
  changedFields?: string[];
}

/** Aktuel modelversion for lokal/eksport persistens. Bumpes ved breaking changes i datamodellen. */
export const MODEL_VERSION = 1 as const;

/**
 * Stabilt release-label for den nuværende modelversion.
 *
 * personal-fire-v0.3-stable indeholder:
 *  - modelstatus valid/invalid
 *  - separat shortfall-logik (privat cashflow)
 *  - separat finansieringsproblem-logik (holding/gæld)
 *  - failure-driven robusthedsscore med hard cap ved invalid
 *  - antagelsessikkerheds-score uafhængig af beregning
 *  - audit-panel pr. år (cashflow-bro, faktisk investeret i fri kapital)
 *  - scenario comparison (Modelstatus + finansieringsproblem-rækker)
 *  - sparelogik (planned/cashflow/hybrid) med ikke-allokeret cashflow
 *  - holding-/gældsfinansiering (holding_capital / private_cashflow / external_company)
 *    uden falske warnings ved ekstern finansiering
 *
 * Bump label når en ny stabil baseline er klar.
 */
export const MODEL_RELEASE = "personal-fire-v0.3-stable" as const;

/**
 * Frosset point-in-time kopi af et beregnet scenarie. Bruges som dokumentation
 * og rapportgrundlag — ændres ALDRIG når basecase eller scenarier senere ændres.
 *
 * Linkede stress-tests materialiseres som resolved data ved snapshot-tidspunktet.
 */
export interface Snapshot {
  snapshotId: string;
  snapshotName: string;
  createdAt: number;
  updatedAt: number;
  modelVersion: number;
  modelRelease: string;

  // Scenario identitet ved snapshot-tidspunktet
  scenarioId: string;
  scenarioName: string;
  scenarioType: ScenarioType;
  baseScenarioId?: string;
  baseScenarioName?: string;
  modifiers?: Partial<ScenarioModifiers>;
  manuallyEdited?: boolean;

  // Resolved beregningsgrundlag
  resolvedInputs: ScenarioInputs;
  assumptionsOverride?: Partial<Assumptions>;
  assumptions: Assumptions;

  // Beregnet output (frosset)
  kpis: KPIs;
  sanityChecks: SanityCheck[];
  years: YearRow[];
  chartData: { age: number; Fri: number; Buffer: number; Pension: number; Holding: number; Nettoformue: number }[];

  notes?: string;
  metadata?: Record<string, unknown>;
  /**
   * Frosset kopi af landeprofiler på snapshot-tidspunktet. Bagudkompatibel
   * (kan mangle på ældre snapshots — Country-modulet håndterer det).
   */
  countryProfiles?: import("./country").CountryProfile[];
  /** Frosset analyseindstilling (analysealder/flyttetidspunkt) for landeanalysen. */
  countryAnalysisSettings?: import("./country").CountryAnalysisSettings;
}

/** Skema for eksport/import af hele modellen — forberedt til fremtidig serverlagring. */
export interface ModelExport {
  modelVersion: number;
  createdAt: number;
  updatedAt: number;
  activeScenarioId: string;
  scenarios: Scenario[];
  assumptions: Assumptions;
  /** Gemte snapshots — frosne point-in-time rapporter. Valgfri for bagudkompatibilitet. */
  snapshots?: Snapshot[];
  /** Brugerredigerbare landeprofiler på model-niveau (Country FIRE-modul). */
  countryProfiles?: import("./country").CountryProfile[];
  metadata?: Record<string, unknown>;
}

export type ModelStatus = "valid" | "target_missed" | "invalid";

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
  /** Mangler ved slutalder ift. minimumsmål (positivt tal hvis under mål). */
  endShortfallVsTarget: number;
  /** Antagelsessikkerhed = 100 − antagelsesrisiko. Højere er bedre. */
  assumptionConfidence: number;
  /** Samlet ufinansieret holdinggæld over hele perioden. */
  unfinancedHoldingDebt: number;
  /** Antal år hvor holdinggæld var ufinansieret. */
  unfinancedHoldingYears: number;
  /** Første alder hvor et finansieringsproblem opstår (fx ufinansieret holdinggæld). */
  firstFinancingIssueAge: number | null;
  /** Type/beskrivelse af første finansieringsproblem. */
  firstFinancingIssueKind: string | null;
  /** Beløb knyttet til første finansieringsproblem (årets ufinansierede beløb). */
  firstFinancingIssueAmount: number;
  /** Samlet modelstatus. */
  modelStatus: ModelStatus;
  modelStatusReason: string;
  /** Top-faktorer der trækker robustheden op/ned. */
  robustnessBreakdown: ScoreFactor[];
  robustnessSummary: string;
  /** Top-faktorer for antagelsessikkerhed. */
  confidenceBreakdown: ConfidenceFactor[];
  confidenceSummary: string;
}

export type FactorImpact = "positive" | "neutral" | "negative";
export interface ScoreFactor {
  label: string;
  detail: string;
  impact: FactorImpact;
  magnitude: "low" | "medium" | "high" | "critical";
}

export interface ConfidenceFactor {
  key: ConfidenceKey;
  label: string;
  level: ConfidenceLevel;
  effect: "low" | "medium" | "high";
  /** Vægtet bidrag til samlet score (negativt = trækker ned). */
  contribution: number;
  note?: string;
}

export type SanitySeverity = "info" | "warn" | "error";
export interface SanityCheck {
  id: string;
  severity: SanitySeverity;
  title: string;
  detail?: string;
}
