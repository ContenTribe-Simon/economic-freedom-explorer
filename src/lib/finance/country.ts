/**
 * Lande-/Country FIRE-analyse — analyse-/beslutningslag oven på den
 * eksisterende projection + FIRE-fremskrivning.
 *
 * VIGTIGT:
 *  - Dette modul ÆNDRER IKKE projection, scenarier eller snapshots.
 *  - Alle beløb er i nutidskroner (real value), som resten af modellen.
 *  - Landeprofiler er brugerredigerbare modelantagelser — ikke officielle data.
 *
 * Arkitekturvalg: countryProfiles ligger på MODEL-niveau (ikke pr. scenario)
 * i denne første version. Det er enklest, mest stabilt og matcher den
 * eksisterende cloud-/JSON-eksportstruktur, hvor model_data_json bærer alle
 * scenarier, antagelser og snapshots samlet. Linkede stress-tests og custom
 * scenarier deler dermed automatisk samme landeprofiler — uden at skulle
 * eskalere til "custom" når brugeren ændrer en landeprofil.
 */
import type { Scenario, YearRow } from "./types";
import { computeFireAnalysis, FIRE_DEFAULTS, type FireAssumptions, type FireAnalysis } from "./fire";
import type { Assumptions } from "./types";

export type CountryLifestyle = "lean" | "standard" | "comfortable";
export type CountryUncertainty = "low" | "medium" | "high";
export type CountryFireStatus = "achieved" | "near" | "not_achieved";

export interface CountryProfile {
  id: string;
  name: string;
  enabled: boolean;
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
  visaUncertainty: CountryUncertainty;
  taxUncertainty: CountryUncertainty;
  healthcareUncertainty: CountryUncertainty;
  personalFit?: CountryUncertainty;
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
  gap: number;
  achievedAge: number | null;
  status: CountryFireStatus;
  sustainableMonthlyNetAtReferenceAge: number;
  sustainableMonthlyNetAtStopAge: number;
  uncertaintyScore: number;
  keyDrivers: string[];
}

export interface CountryAnalysisOptions {
  withdrawalRate?: number;
  fireAssumptions?: FireAssumptions;
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
  visaUncertainty: "low",
  taxUncertainty: "low",
  healthcareUncertainty: "low",
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
    visaUncertainty: "low",
    taxUncertainty: "low",
    healthcareUncertainty: "low",
    personalFit: "high",
    notes: "Hjemland — bruges som baseline.",
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
    visaUncertainty: "medium",
    taxUncertainty: "medium",
    healthcareUncertainty: "medium",
    personalFit: "medium",
    notes: "Modelantagelse — ikke officiel skat/visumvejledning.",
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
    visaUncertainty: "medium",
    taxUncertainty: "high",
    healthcareUncertainty: "medium",
    personalFit: "medium",
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
    visaUncertainty: "high",
    taxUncertainty: "high",
    healthcareUncertainty: "high",
    personalFit: "low",
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
    visaUncertainty: "high",
    taxUncertainty: "medium",
    healthcareUncertainty: "medium",
    personalFit: "medium",
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
    monthlyCostLean: 10000,
    monthlyCostStandard: 18000,
    monthlyCostComfortable: 28000,
    annualHealthcareCost: 0,
    annualTravelHomeCost: 0,
    annualAdminCost: 0,
    effectiveTaxOrFrictionPct: 0,
    currencyRiskBufferPct: 0,
    generalSafetyBufferPct: 0,
    visaUncertainty: "medium",
    taxUncertainty: "medium",
    healthcareUncertainty: "medium",
    personalFit: "medium",
  };
}

export function normalizeCountryProfile(raw: any): CountryProfile {
  const blank = makeBlankCountryProfile();
  if (!raw || typeof raw !== "object") return blank;
  return {
    ...blank,
    ...raw,
    id: typeof raw.id === "string" && raw.id ? raw.id : blank.id,
    name: typeof raw.name === "string" ? raw.name : blank.name,
    enabled: raw.enabled !== false,
    monthlyCostLean: Number(raw.monthlyCostLean) || 0,
    monthlyCostStandard: Number(raw.monthlyCostStandard) || 0,
    monthlyCostComfortable: Number(raw.monthlyCostComfortable) || 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Beregning                                                          */
/* ------------------------------------------------------------------ */

const UNC_VALUE: Record<CountryUncertainty, number> = { low: 0, medium: 1, high: 2 };

function uncertaintyScore(p: CountryProfile): number {
  // 0..100, højere = mere usikker. Vægtning: visa/skat/sundhed tæller mest,
  // currency/safety-buffere giver et lille tillæg, personalFit kan trække ned.
  const base =
    UNC_VALUE[p.visaUncertainty] * 1.5 +
    UNC_VALUE[p.taxUncertainty] * 1.5 +
    UNC_VALUE[p.healthcareUncertainty] * 1.0;
  const bufferAdd =
    Math.min(0.20, p.currencyRiskBufferPct ?? 0) * 25 +
    Math.min(0.20, p.generalSafetyBufferPct ?? 0) * 15;
  const fitAdj = p.personalFit ? (UNC_VALUE[p.personalFit] - 1) * -3 : 0; // high fit reducerer
  const raw = base * 10 + bufferAdd - fitAdj;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

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
      // bekræft ingen shortfall fra dette år og frem
      const noShortfall = !years.some((x) => x.age >= y.age && x.shortfall);
      if (noShortfall) return y.age;
    }
  }
  return null;
}

function pickKeyDrivers(p: CountryProfile, totalAnnualNeed: number, monthlyAnnualPart: number): string[] {
  const drivers: string[] = [];
  drivers.push("Forbrug");
  const extras = annualExtras(p);
  if (extras > 0) drivers.push("Sundhed/rejser/admin");
  const friction = (p.effectiveTaxOrFrictionPct ?? 0) + (p.generalSafetyBufferPct ?? 0);
  if (friction >= 0.05) drivers.push("Friktion/skat/buffer");
  if ((p.currencyRiskBufferPct ?? 0) >= 0.02) drivers.push("Valutarisiko");
  // Hvis ekstras + friktion udgør >25 % af behovet, fremhæv det
  const baseAnnual = monthlyAnnualPart;
  if (totalAnnualNeed > 0 && (totalAnnualNeed - baseAnnual) / totalAnnualNeed > 0.25) {
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

  // Brug FIRE-analysen til at finde reference-alder (samme som FIRE-side)
  const fire: FireAnalysis = computeFireAnalysis(scenario, years, globalAssumptions, fa);
  const refAge = fire.capitalBreakdown.referenceAge;
  const refYear = years.find((y) => y.age === refAge);
  const stopYear = years.find((y) => y.age === scenario.inputs.stopAge);
  const refCapital = fireBaseCapitalAt(refYear, fa);
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

      let status: CountryFireStatus = "not_achieved";
      if (achievedAge !== null) status = "achieved";
      else if (selectedCapitalNeed > 0 && refCapital / selectedCapitalNeed >= 0.85) status = "near";

      // Bæredygtigt månedligt netto: kapital * rate / 12, derefter trækkes
      // ekstras/12 fra og divideres med friktionsfaktor (omvendt vej).
      function sustainableMonthly(capital: number): number {
        const grossAnnual = capital * wr;
        const afterExtras = grossAnnual - extras;
        if (afterExtras <= 0) return 0;
        const netAnnual = afterExtras / friction;
        return Math.max(0, netAnnual / 12);
      }

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
        gap,
        achievedAge,
        status,
        sustainableMonthlyNetAtReferenceAge: sustainableMonthly(refCapital),
        sustainableMonthlyNetAtStopAge: sustainableMonthly(stopCapital),
        uncertaintyScore: uncertaintyScore(p),
        keyDrivers: pickKeyDrivers(p, totalAnnualNeed, annual),
      });
    }
  }
  return out;
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
    // Foretræk standard > lean > comfortable
    const lvl = (l: CountryLifestyle) => (l === "standard" ? 0 : l === "lean" ? 1 : 2);
    return lvl(a.lifestyle) - lvl(b.lifestyle);
  });
  return sorted[0];
}

export function uncertaintyLabel(score: number): "Lav" | "Middel" | "Høj" {
  if (score < 25) return "Lav";
  if (score < 55) return "Middel";
  return "Høj";
}

export function lifestyleLabel(l: CountryLifestyle): string {
  return l === "lean" ? "Lean" : l === "standard" ? "Standard" : "Comfortable";
}

export function statusLabel(s: CountryFireStatus): string {
  return s === "achieved" ? "Opnået" : s === "near" ? "Tæt på" : "Ikke opnået";
}
