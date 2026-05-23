/**
 * Lande-/Country FIRE-analyse — analyse-/beslutningslag oven på den
 * eksisterende projection + FIRE-fremskrivning.
 *
 * VIGTIGT:
 *  - Dette modul ÆNDRER IKKE projection, scenarier eller snapshots.
 *  - Alle beløb er i DKK / nutidskroner (real value), som resten af modellen.
 *    Felter som `currency` er kun reference-/visningsetiketter.
 *  - Landeprofiler er brugerredigerbare modelantagelser — ikke officielle data.
 *  - Modulet er økonomisk fokuseret. Ikke-økonomiske vurderinger som visum,
 *    personligt fit, sundhedssystem-vurderinger og samlet usikkerhedsscore
 *    indgår IKKE her. Legacy-felter af den slags ignoreres ved normalisering.
 */
import type { Scenario, YearRow } from "./types";
import { computeFireAnalysis, FIRE_DEFAULTS, type FireAssumptions, type FireAnalysis } from "./fire";
import type { Assumptions } from "./types";

export type CountryLifestyle = "lean" | "standard" | "comfortable";
export type CountryFireStatus = "achieved" | "near" | "not_achieved";

/**
 * Analyse-/flyttetidspunkt for landeanalyse. Bestemmer hvilket projection-år
 * der bruges som "Forventet kapital", "Brutto bæredygtigt udtræk",
 * "Landespecifikt rådighedsbeløb" og "Gap".
 *
 *  - "fireReference": Brug FIRE-modulets referencealder (= typisk stopAge).
 *    Default for bagudkompatibilitet.
 *  - "now":           Brug brugerens nuværende alder.
 *  - "plannedStopAge": Brug scenariets stopalder.
 *  - "inYears":       Brug currentAge + yearsFromNow.
 *  - "manualAge":     Brug manualReferenceAge.
 */
export type CountryAnalysisReferenceMode =
  | "fireReference"
  | "now"
  | "plannedStopAge"
  | "inYears"
  | "manualAge";

export interface CountryAnalysisSettings {
  withdrawalRate?: number;
  referenceMode: CountryAnalysisReferenceMode;
  yearsFromNow?: number;
  manualReferenceAge?: number;
}

export const DEFAULT_COUNTRY_ANALYSIS_SETTINGS: CountryAnalysisSettings = {
  referenceMode: "fireReference",
  yearsFromNow: 5,
};

export function normalizeCountryAnalysisSettings(raw: any): CountryAnalysisSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COUNTRY_ANALYSIS_SETTINGS };
  const allowed: CountryAnalysisReferenceMode[] = [
    "fireReference", "now", "plannedStopAge", "inYears", "manualAge",
  ];
  const mode = allowed.includes(raw.referenceMode) ? raw.referenceMode : "fireReference";
  const out: CountryAnalysisSettings = { referenceMode: mode };
  const wr = Number(raw.withdrawalRate);
  if (Number.isFinite(wr) && wr > 0) out.withdrawalRate = wr;
  const yfn = Number(raw.yearsFromNow);
  if (Number.isFinite(yfn) && yfn >= 0) out.yearsFromNow = yfn;
  const ma = Number(raw.manualReferenceAge);
  if (Number.isFinite(ma) && ma > 0) out.manualReferenceAge = ma;
  return out;
}

export interface CountryProfile {
  id: string;
  name: string;
  enabled: boolean;
  /** Reference-etiket — ALLE beløb i modellen er i DKK/nutidskroner. */
  currency?: string;
  monthlyCostLean: number;
  monthlyCostStandard: number;
  monthlyCostComfortable: number;
  annualHealthcareCost?: number;
  annualTravelHomeCost?: number;
  annualAdminCost?: number;
  /** Andel ekstra friktion/skat oven på årligt forbrug (decimal, fx 0.05 = 5 %). */
  effectiveTaxOrFrictionPct?: number;
  currencyRiskBufferPct?: number;
  generalSafetyBufferPct?: number;
  notes?: string;
}

export interface CountryFireResult {
  countryId: string;
  countryName: string;
  lifestyle: CountryLifestyle;
  monthlyNetCost: number;
  annualNetCost: number;
  annualExtras: number;
  /** Total årligt behov inkl. ekstras og buffere/friktion. */
  totalAnnualNeed: number;
  capitalNeed35: number;
  capitalNeed40: number;
  selectedWithdrawalRate: number;
  selectedCapitalNeed: number;
  expectedCapitalAtReferenceAge: number;
  expectedCapitalAtStopAge: number;
  gap: number;
  achievedAge: number | null;
  /**
   * Status afspejler situationen ved den valgte analysealder — IKKE om niveauet
   * opnås på et tidspunkt i projection. "achieved" kræver gap ≤ 0 ved analysealder.
   */
  status: CountryFireStatus;
  /** True hvis kapitalen ved analysealderen dækker hele kapitalbehovet. */
  achievedAtAnalysisAge: boolean;
  /** Kapitalmangel ved analysealderen (alias for `gap`, eksplicit navn). */
  capitalGapAtAnalysisAge: number;
  /** Manglende månedligt forbrug ved analysealder (alias for `monthlyShortfall`). */
  monthlyShortfallAtAnalysisAge: number;
  /** Overskydende månedligt forbrug ved analysealder (alias for `monthlySurplus`). */
  monthlySurplusAtAnalysisAge: number;
  /** Brutto bæredygtigt udtræk: kapitalgrundlag × valgt udtræksrate / 12. Uafhængigt af land. */
  grossSustainableMonthlyAtReferenceAge: number;
  grossSustainableMonthlyAtStopAge: number;
  /** Landespecifikt rådighedsbeløb pr. md. — efter ekstras og buffere. */
  sustainableMonthlyNetAtReferenceAge: number;
  sustainableMonthlyNetAtStopAge: number;
  /** Mangler (positivt) eller overskud (negativt) pr. md. ift. ønsket forbrug. */
  monthlyShortfall: number;
  monthlySurplus: number;
  /** Kun økonomiske drivere. */
  keyDrivers: string[];
  /** Alder hvor analysen er evalueret (afhænger af analyseindstillinger). */
  analysisAge: number;
  /** Tidligste alder i hele projection hvor niveauet kan opnås. Alias for `achievedAge`. */
  earliestAchievedAge: number | null;
}

export interface CountryAnalysisOptions {
  withdrawalRate?: number;
  fireAssumptions?: FireAssumptions;
  /** Bestemmer hvilken alder/projection-år "Forventet kapital" mv. evalueres ved. */
  analysisSettings?: CountryAnalysisSettings;
}

/* ------------------------------------------------------------------ */
/*  Demo-profiler (markeres tydeligt i UI som modelantagelser)         */
/* ------------------------------------------------------------------ */

const u = (id: string, p: Partial<CountryProfile>): CountryProfile => ({
  id,
  name: id,
  enabled: true,
  monthlyCostLean: 0,
  monthlyCostStandard: 0,
  monthlyCostComfortable: 0,
  ...p,
});

export const DEFAULT_COUNTRY_PROFILES: CountryProfile[] = [
  u("dk", {
    name: "Danmark",
    currency: "DKK",
    monthlyCostLean: 18000,
    monthlyCostStandard: 28000,
    monthlyCostComfortable: 42000,
    annualHealthcareCost: 0,
    annualTravelHomeCost: 0,
    annualAdminCost: 0,
    effectiveTaxOrFrictionPct: 0,
    currencyRiskBufferPct: 0,
    generalSafetyBufferPct: 0.05,
    notes: "Demo-tal — skal erstattes med egne antagelser. Hjemland — bruges som baseline.",
  }),
  u("pt", {
    name: "Portugal",
    currency: "EUR",
    monthlyCostLean: 12000,
    monthlyCostStandard: 20000,
    monthlyCostComfortable: 32000,
    annualHealthcareCost: 15000,
    annualTravelHomeCost: 20000,
    annualAdminCost: 8000,
    effectiveTaxOrFrictionPct: 0.10,
    currencyRiskBufferPct: 0.02,
    generalSafetyBufferPct: 0.05,
    notes: "Demo-tal — skal erstattes med egne antagelser.",
  }),
  u("es", {
    name: "Spanien",
    currency: "EUR",
    monthlyCostLean: 13000,
    monthlyCostStandard: 22000,
    monthlyCostComfortable: 35000,
    annualHealthcareCost: 18000,
    annualTravelHomeCost: 18000,
    annualAdminCost: 8000,
    effectiveTaxOrFrictionPct: 0.12,
    currencyRiskBufferPct: 0.02,
    generalSafetyBufferPct: 0.05,
    notes: "Demo-tal — skal erstattes med egne antagelser.",
  }),
  u("vn", {
    name: "Vietnam",
    currency: "VND",
    monthlyCostLean: 7000,
    monthlyCostStandard: 14000,
    monthlyCostComfortable: 24000,
    annualHealthcareCost: 25000,
    annualTravelHomeCost: 35000,
    annualAdminCost: 10000,
    effectiveTaxOrFrictionPct: 0.05,
    currencyRiskBufferPct: 0.08,
    generalSafetyBufferPct: 0.10,
    notes: "Demo-tal — skal erstattes med egne antagelser.",
  }),
  u("th", {
    name: "Thailand",
    currency: "THB",
    monthlyCostLean: 9000,
    monthlyCostStandard: 16000,
    monthlyCostComfortable: 28000,
    annualHealthcareCost: 25000,
    annualTravelHomeCost: 30000,
    annualAdminCost: 10000,
    effectiveTaxOrFrictionPct: 0.05,
    currencyRiskBufferPct: 0.06,
    generalSafetyBufferPct: 0.08,
    notes: "Demo-tal — skal erstattes med egne antagelser.",
  }),
];

/* ------------------------------------------------------------------ */
/*  Validering / normalisering                                         */
/* ------------------------------------------------------------------ */

export function makeBlankCountryProfile(name = "Nyt land"): CountryProfile {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return {
    id,
    name,
    enabled: true,
    currency: "DKK",
    monthlyCostLean: 10000,
    monthlyCostStandard: 18000,
    monthlyCostComfortable: 28000,
    annualHealthcareCost: 0,
    annualTravelHomeCost: 0,
    annualAdminCost: 0,
    effectiveTaxOrFrictionPct: 0,
    currencyRiskBufferPct: 0,
    generalSafetyBufferPct: 0,
  };
}

/**
 * Normalisér rå profildata. Legacy-felter (visaUncertainty, taxUncertainty,
 * healthcareUncertainty, personalFit, uncertaintyScore) ignoreres så
 * gamle gemte modeller / JSON-import / cloud-load ikke crasher.
 */
export function normalizeCountryProfile(raw: any): CountryProfile {
  const blank = makeBlankCountryProfile();
  if (!raw || typeof raw !== "object") return blank;
  const num = (v: any, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : blank.id,
    name: typeof raw.name === "string" ? raw.name : blank.name,
    enabled: raw.enabled !== false,
    currency: typeof raw.currency === "string" ? raw.currency : blank.currency,
    monthlyCostLean: Math.max(0, num(raw.monthlyCostLean)),
    monthlyCostStandard: Math.max(0, num(raw.monthlyCostStandard)),
    monthlyCostComfortable: Math.max(0, num(raw.monthlyCostComfortable)),
    annualHealthcareCost: Math.max(0, num(raw.annualHealthcareCost)),
    annualTravelHomeCost: Math.max(0, num(raw.annualTravelHomeCost)),
    annualAdminCost: Math.max(0, num(raw.annualAdminCost)),
    effectiveTaxOrFrictionPct: Math.max(0, num(raw.effectiveTaxOrFrictionPct)),
    currencyRiskBufferPct: Math.max(0, num(raw.currencyRiskBufferPct)),
    generalSafetyBufferPct: Math.max(0, num(raw.generalSafetyBufferPct)),
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Beregning                                                          */
/* ------------------------------------------------------------------ */

function frictionFactor(p: CountryProfile): number {
  return (
    1 +
    Math.max(0, p.effectiveTaxOrFrictionPct ?? 0) +
    Math.max(0, p.currencyRiskBufferPct ?? 0) +
    Math.max(0, p.generalSafetyBufferPct ?? 0)
  );
}

function annualExtras(p: CountryProfile): number {
  return (
    Math.max(0, p.annualHealthcareCost ?? 0) +
    Math.max(0, p.annualTravelHomeCost ?? 0) +
    Math.max(0, p.annualAdminCost ?? 0)
  );
}

function pickMonthly(p: CountryProfile, level: CountryLifestyle): number {
  switch (level) {
    case "lean":
      return Math.max(0, p.monthlyCostLean);
    case "standard":
      return Math.max(0, p.monthlyCostStandard);
    case "comfortable":
      return Math.max(0, p.monthlyCostComfortable);
  }
}

function fireBaseCapitalAt(year: YearRow | undefined, fa: FireAssumptions): number {
  if (!year) return 0;
  let cap = year.closing.free;
  if (fa.includeHoldingInFire) cap += year.closing.holding;
  if (fa.includePensionInFire) cap += year.closing.pension;
  return Math.max(0, cap);
}

function findAchievedAge(
  years: YearRow[],
  fa: FireAssumptions,
  capitalNeed: number,
): number | null {
  for (const y of years) {
    const cap = fireBaseCapitalAt(y, fa);
    if (cap >= capitalNeed) {
      const noShortfall = !years.some((x) => x.age >= y.age && x.shortfall);
      if (noShortfall) return y.age;
    }
  }
  return null;
}

function pickKeyDrivers(p: CountryProfile, totalAnnualNeed: number, monthlyAnnualPart: number): string[] {
  const drivers: string[] = ["Forbrug"];
  const extras = annualExtras(p);
  if (extras > 0) drivers.push("Årlige ekstraomkostninger");
  if ((p.effectiveTaxOrFrictionPct ?? 0) > 0) drivers.push("Økonomisk friktion/skat");
  if ((p.currencyRiskBufferPct ?? 0) > 0) drivers.push("Valutabuffer");
  if ((p.generalSafetyBufferPct ?? 0) > 0) drivers.push("Ekstra buffer");
  drivers.push("Kapitalgrundlag");
  drivers.push("Udtræksrate");
  if (totalAnnualNeed > 0 && (totalAnnualNeed - monthlyAnnualPart) / totalAnnualNeed > 0.25) {
    drivers.push("Tillæg dominerer behovet");
  }
  return drivers;
}

/**
 * Beregn FIRE-resultater pr. land og livsstilsniveau ovenpå en eksisterende
 * projection. Muterer ikke scenario, projection eller andre input.
 */
export function computeCountryFireResults(
  scenario: Scenario,
  years: YearRow[],
  globalAssumptions: Assumptions,
  countries: CountryProfile[],
  options: CountryAnalysisOptions = {},
): CountryFireResult[] {
  const fa: FireAssumptions = options.fireAssumptions ?? FIRE_DEFAULTS;
  const wr = options.withdrawalRate ?? fa.withdrawalRate ?? 0.035;

  const fire: FireAnalysis = computeFireAnalysis(scenario, years, globalAssumptions, fa);
  const fireRefAge = fire.capitalBreakdown.referenceAge;

  const settings: CountryAnalysisSettings = options.analysisSettings ?? {
    referenceMode: "fireReference",
  };
  const analysisAge = resolveAnalysisAge(scenario, years, settings, fireRefAge);

  const analysisYear = years.find((y) => y.age === analysisAge);
  const stopYear = years.find((y) => y.age === scenario.inputs.stopAge);
  const refCapital = fireBaseCapitalAt(analysisYear, fa);
  const stopCapital = fireBaseCapitalAt(stopYear, fa);

  const out: CountryFireResult[] = [];
  const enabled = countries.filter((c) => c.enabled);

  for (const p of enabled) {
    for (const lifestyle of ["lean", "standard", "comfortable"] as CountryLifestyle[]) {
      const monthly = pickMonthly(p, lifestyle);
      const annual = monthly * 12;
      const extras = annualExtras(p);
      const friction = frictionFactor(p);
      const totalAnnualNeed = (annual + extras) * friction;

      const capitalNeed35 = totalAnnualNeed / 0.035;
      const capitalNeed40 = totalAnnualNeed / 0.04;
      const selectedCapitalNeed = wr > 0 ? totalAnnualNeed / wr : Infinity;

      const achievedAge = findAchievedAge(years, fa, selectedCapitalNeed);
      const gap = Math.max(0, selectedCapitalNeed - refCapital);
      const achievedAtAnalysisAge = selectedCapitalNeed > 0 && refCapital >= selectedCapitalNeed;

      // Status afspejler ANALYSEALDER — ikke om niveauet opnås på et tidspunkt.
      let status: CountryFireStatus = "not_achieved";
      if (achievedAtAnalysisAge) status = "achieved";
      else if (selectedCapitalNeed > 0 && refCapital / selectedCapitalNeed >= 0.85) status = "near";

      function grossSustainableMonthly(capital: number): number {
        return Math.max(0, (capital * wr) / 12);
      }
      function sustainableMonthly(capital: number): number {
        const grossAnnual = capital * wr;
        const afterExtras = grossAnnual - extras;
        if (afterExtras <= 0) return 0;
        const netAnnual = afterExtras / friction;
        return Math.max(0, netAnnual / 12);
      }

      const sustainRef = sustainableMonthly(refCapital);
      const diff = sustainRef - monthly;
      const monthlyShortfall = diff < 0 ? -diff : 0;
      const monthlySurplus = diff > 0 ? diff : 0;

      out.push({
        countryId: p.id,
        countryName: p.name,
        lifestyle,
        monthlyNetCost: monthly,
        annualNetCost: annual,
        annualExtras: extras,
        totalAnnualNeed,
        capitalNeed35,
        capitalNeed40,
        selectedWithdrawalRate: wr,
        selectedCapitalNeed,
        expectedCapitalAtReferenceAge: refCapital,
        expectedCapitalAtStopAge: stopCapital,
        gap,
        achievedAge,
        earliestAchievedAge: achievedAge,
        status,
        achievedAtAnalysisAge,
        capitalGapAtAnalysisAge: gap,
        monthlyShortfallAtAnalysisAge: monthlyShortfall,
        monthlySurplusAtAnalysisAge: monthlySurplus,
        grossSustainableMonthlyAtReferenceAge: grossSustainableMonthly(refCapital),
        grossSustainableMonthlyAtStopAge: grossSustainableMonthly(stopCapital),
        sustainableMonthlyNetAtReferenceAge: sustainRef,
        sustainableMonthlyNetAtStopAge: sustainableMonthly(stopCapital),
        monthlyShortfall,
        monthlySurplus,
        keyDrivers: pickKeyDrivers(p, totalAnnualNeed, annual),
        analysisAge,
      });
    }
  }
  return out;
}

/**
 * Beregn den projection-alder der bruges som "analysealder". Clamper til
 * projection-rækken så vi altid rammer et eksisterende år.
 */
export function resolveAnalysisAge(
  scenario: Scenario,
  years: YearRow[],
  settings: CountryAnalysisSettings,
  fireReferenceAge: number,
): number {
  if (years.length === 0) return scenario.inputs.person.currentAge;
  const minAge = years[0].age;
  const maxAge = years[years.length - 1].age;
  const clamp = (n: number) => Math.max(minAge, Math.min(maxAge, Math.round(n)));
  switch (settings.referenceMode) {
    case "now":
      return clamp(scenario.inputs.person.currentAge);
    case "plannedStopAge":
      return clamp(scenario.inputs.stopAge);
    case "inYears":
      return clamp(scenario.inputs.person.currentAge + (settings.yearsFromNow ?? 0));
    case "manualAge":
      return clamp(settings.manualReferenceAge ?? scenario.inputs.person.currentAge);
    case "fireReference":
    default:
      return clamp(fireReferenceAge);
  }
}

export function describeAnalysisMode(
  settings: CountryAnalysisSettings,
  resolvedAge: number,
  scenario: Scenario,
): string {
  switch (settings.referenceMode) {
    case "now":
      return `Nu — alder ${resolvedAge}`;
    case "plannedStopAge":
      return `Planlagt stopalder — ${resolvedAge}`;
    case "inYears":
      return `Om ${settings.yearsFromNow ?? 0} år — alder ${resolvedAge}`;
    case "manualAge":
      return `Valgt alder ${resolvedAge}`;
    case "fireReference":
    default:
      return `FIRE-referencealder — ${resolvedAge}`;
  }
}

/** Vælg det "bedste" resultat for et land — første af achieved/near/not_achieved
 *  med Standard som foretrukket niveau, ellers det nærmeste niveau. */
export function nearestForCountry(
  results: CountryFireResult[],
  countryId: string,
): CountryFireResult | null {
  const own = results.filter((r) => r.countryId === countryId);
  if (own.length === 0) return null;
  const order: CountryFireStatus[] = ["achieved", "near", "not_achieved"];
  const sorted = [...own].sort((a, b) => {
    const sa = order.indexOf(a.status);
    const sb = order.indexOf(b.status);
    if (sa !== sb) return sa - sb;
    const lvl = (l: CountryLifestyle) => (l === "standard" ? 0 : l === "lean" ? 1 : 2);
    return lvl(a.lifestyle) - lvl(b.lifestyle);
  });
  return sorted[0];
}

/**
 * Sammenfattende status for et land på tværs af alle livsstilsniveauer.
 * Sikrer at kortet ikke siger "Ikke opnået", hvis fx Lean faktisk er opnået.
 */
export interface CountryCardStatus {
  label: string;
  tone: "achieved" | "near" | "not_achieved";
  achievedLifestyle: CountryLifestyle | null;
  achievedAge: number | null;
  standardAchieved: boolean;
  standardNear: boolean;
}

const LIFESTYLE_PRIORITY: CountryLifestyle[] = ["standard", "lean", "comfortable"];

export function summarizeCountryStatus(
  results: CountryFireResult[],
  countryId: string,
): CountryCardStatus {
  const own = results.filter((r) => r.countryId === countryId);
  const standard = own.find((r) => r.lifestyle === "standard");
  const standardAchieved = !!standard?.achievedAtAnalysisAge;
  const standardNear = standard?.status === "near" && !standardAchieved;

  // 1. Standard opnået ved analysealder → grøn
  if (standardAchieved && standard) {
    return {
      label: `Standard opnået ved alder ${standard.analysisAge}`,
      tone: "achieved",
      achievedLifestyle: "standard",
      achievedAge: standard.analysisAge,
      standardAchieved: true,
      standardNear: false,
    };
  }

  // 2. Andet niveau opnået ved analysealder (men Standard ikke) → gul
  const achievedNow = own.filter((r) => r.achievedAtAnalysisAge);
  if (achievedNow.length > 0) {
    achievedNow.sort(
      (a, b) => LIFESTYLE_PRIORITY.indexOf(a.lifestyle) - LIFESTYLE_PRIORITY.indexOf(b.lifestyle),
    );
    const best = achievedNow[0];
    return {
      label: `${lifestyleLabel(best.lifestyle)} opnået ved alder ${best.analysisAge} · Standard ikke opnået`,
      tone: "near",
      achievedLifestyle: best.lifestyle,
      achievedAge: best.analysisAge,
      standardAchieved: false,
      standardNear,
    };
  }

  // 3. Ikke opnået ved analysealder, men Standard opnås senere i projection → gul
  if (standard?.earliestAchievedAge != null && standard.earliestAchievedAge > standard.analysisAge) {
    return {
      label: `Ikke opnået ved alder ${standard.analysisAge} · først ved ${standard.earliestAchievedAge}`,
      tone: "near",
      achievedLifestyle: null,
      achievedAge: standard.earliestAchievedAge,
      standardAchieved: false,
      standardNear: false,
    };
  }

  // 4. Edge: Standard var opnået tidligere, men ikke ved analysealder
  if (standard?.earliestAchievedAge != null && standard.earliestAchievedAge < standard.analysisAge) {
    return {
      label: `Var opnået ved alder ${standard.earliestAchievedAge} · ikke ved alder ${standard.analysisAge}`,
      tone: "near",
      achievedLifestyle: null,
      achievedAge: standard.earliestAchievedAge,
      standardAchieved: false,
      standardNear: false,
    };
  }

  if (standardNear && standard) {
    return {
      label: `Tæt på Standard (alder ${standard.analysisAge})`,
      tone: "near",
      achievedLifestyle: null,
      achievedAge: null,
      standardAchieved: false,
      standardNear: true,
    };
  }
  return {
    label: "Ingen niveauer opnået",
    tone: "not_achieved",
    achievedLifestyle: null,
    achievedAge: null,
    standardAchieved: false,
    standardNear: false,
  };
}

/**
 * Beskriv status for ét konkret resultat (land + livsstil) baseret på
 * analysealder. Adskiller eksplicit "opnået NU ved analysealder" fra
 * "først opnået senere i fremskrivningen".
 */
export function describeStatusAtAnalysisAge(
  r: CountryFireResult,
): { label: string; tone: "achieved" | "near" | "not_achieved" } {
  if (r.achievedAtAnalysisAge) {
    return { label: `Opnået ved alder ${r.analysisAge}`, tone: "achieved" };
  }
  if (r.earliestAchievedAge != null && r.earliestAchievedAge > r.analysisAge) {
    return {
      label: `Ikke opnået ved alder ${r.analysisAge} · først ved ${r.earliestAchievedAge}`,
      tone: "near",
    };
  }
  if (r.earliestAchievedAge != null && r.earliestAchievedAge < r.analysisAge) {
    return {
      label: `Var opnået ved alder ${r.earliestAchievedAge} · ikke ved alder ${r.analysisAge}`,
      tone: "near",
    };
  }
  return { label: "Ikke opnået i projectionen", tone: "not_achieved" };
}

export function lifestyleLabel(l: CountryLifestyle): string {
  return l === "lean" ? "Lean" : l === "standard" ? "Standard" : "Comfortable";
}

export function statusLabel(s: CountryFireStatus): string {
  return s === "achieved" ? "Opnået" : s === "near" ? "Tæt på" : "Ikke opnået";
}

/**
 * Format en udtræksrate (fx 0.035) som dansk procent uden støjende
 * decimaler. Returnerer fx "3,5" eller "4". Bruges KUN til visning;
 * intern beregning bruger fortsat den fulde decimalværdi.
 */
export function formatWithdrawalRatePct(rate: number): string {
  if (!Number.isFinite(rate)) return "";
  const pct = rate * 100;
  const rounded = Math.round(pct * 100) / 100;
  const s = (Math.abs(rounded - Math.round(rounded)) < 1e-9
    ? rounded.toFixed(0)
    : rounded.toFixed(1));
  return s.replace(".", ",");
}
