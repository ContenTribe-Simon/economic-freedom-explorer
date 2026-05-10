/**
 * FIRE-analyselag — beregner FIRE-status oven på en eksisterende projection.
 *
 * Dette modul ÆNDRER IKKE projection-resultatet. Det læser fra year-rows og
 * scenario-inputs og producerer en analytisk vurdering af forskellige
 * FIRE-typer (Coast, Lean, Standard, Fat, Barista).
 *
 * Metode (forsimplet):
 *  - FI number = årligt forbrug × spendingFactor / withdrawalRate.
 *  - FIRE-kapitalgrundlag for et givent år = closing.free + closing.holding
 *    (+ closing.pension hvis includePensionInFire).
 *  - En FIRE-type er "opnået" i året hvor kapitalgrundlaget ≥ FI-mål
 *    OG der ikke er privat cashflow-shortfall i året eller senere år.
 *  - Coast FI: nuværende investerbar kapital (fri + valgfri pension/holding)
 *    kan ved realafkast vokse til Standard FI-mål inden stopalder uden
 *    yderligere indbetalinger.
 *  - Barista FI: året hvor portefølje + deltidsindkomst dækker forbruget,
 *    hvor portefølje-bidraget er kapital × withdrawalRate.
 */
import type { Assumptions, Scenario, YearRow } from "./types";
import { mergeAssumptions } from "./projection";
import { defaultAssumptions } from "./defaults";

export interface FireAssumptions {
  withdrawalRate: number;
  leanSpendingFactor: number;
  fatSpendingFactor: number;
  /** Tæller pension med i FIRE-kapitalgrundlaget? Default false (mest konservativ). */
  includePensionInFire: boolean;
  /** Tæller holding med i FIRE-kapitalgrundlaget? Default true. */
  includeHoldingInFire: boolean;
}

export const FIRE_DEFAULTS: FireAssumptions = {
  withdrawalRate: 0.035,
  leanSpendingFactor: 0.75,
  fatSpendingFactor: 1.30,
  includePensionInFire: false,
  includeHoldingInFire: true,
};

export type FireType = "coast" | "lean" | "standard" | "fat" | "barista";
export type FireStatus = "achieved" | "achieved_at_age" | "not_achieved" | "not_sustainable";

export interface FireResult {
  type: FireType;
  label: string;
  description: string;
  /** Nødvendig FIRE-kapital (FI number) i nutidskroner. */
  capitalRequired: number;
  /** Kapitalgrundlag på relevant alder (typisk opnået-alder eller stopalder). */
  capitalAvailable: number;
  /** Alder hvor typen opnås, hvis nogensinde. */
  achievedAtAge: number | null;
  /** Gap i kr (positivt = mangler). */
  gap: number;
  status: FireStatus;
}

export interface FireYearStatus {
  age: number;
  fireBaseCapital: number;
  standardFiTarget: number;
  gapToStandardFi: number;
  meets: { coast: boolean; lean: boolean; standard: boolean; fat: boolean; barista: boolean };
}

export interface FireAnalysis {
  assumptions: FireAssumptions;
  /** Årligt forbrug i nutidskroner brugt som FIRE-grundlag. */
  annualSpending: number;
  /** Standard FI number (= annualSpending / withdrawalRate). */
  standardFiNumber: number;
  results: Record<FireType, FireResult>;
  /** Nærmeste opnåede milepæl (eller null hvis intet opnås). */
  nearestMilestone: FireType | null;
  /** Tidligste alder hvor noget FIRE-niveau opnås. */
  earliestFireAge: number | null;
  /** År-for-år status til audit. */
  yearStatus: FireYearStatus[];
  /** Afhængighedsmål: andel af slutaktiverne i hver bucket (0-1). */
  dependence: { pensionShare: number; holdingShare: number; freeShare: number };
  /**
   * Kapitalgrundlag bag FIRE — bygger på samme reference-år som FIRE-kortenes
   * "Forventet kapital" (Standard FI's opnået-alder, ellers stopalder, ellers
   * sidste år). Værdier er i nutidskroner. Shares beregnes ift. totalen af
   * de buckets, der er medtaget i Standard FI (totalIncluded).
   */
  capitalBreakdown: {
    referenceAge: number;
    free: number;
    holding: number;
    pension: number;
    buffer: number;
    totalIncluded: number;
    totalAll: number;
    shares: { free: number; holding: number; pension: number; buffer: number };
    included: { free: boolean; holding: boolean; pension: boolean; buffer: boolean };
  };
  /** Månedligt underskud efter stopalder (gennemsnit), arvet fra projection. */
  monthlyGapAfterStop: number;
}

const TYPE_LABEL: Record<FireType, string> = {
  coast: "Coast FI",
  lean: "Lean FI",
  standard: "Standard FI",
  fat: "Fat FI",
  barista: "Barista FI",
};

const TYPE_DESC: Record<FireType, string> = {
  coast: "Den nuværende investerbare kapital kan vokse til Standard FI-målet inden stopalder uden yderligere indbetalinger.",
  lean: "FI baseret på et reduceret forbrugsniveau (Lean-faktor × ønsket forbrug).",
  standard: "FI baseret på det nuværende ønskede årlige forbrug og en sikker udtræksrate.",
  fat: "FI med komfortabel buffer baseret på et hævet forbrugsniveau (Fat-faktor × ønsket forbrug).",
  barista: "Portefølje + fortsat deltidsindkomst dækker tilsammen det ønskede forbrug.",
};

function fireBaseCapitalAtYear(y: YearRow, fa: FireAssumptions): number {
  let cap = y.closing.free;
  if (fa.includeHoldingInFire) cap += y.closing.holding;
  if (fa.includePensionInFire) cap += y.closing.pension;
  return Math.max(0, cap);
}

function noShortfallFromAge(years: YearRow[], age: number): boolean {
  return !years.some((y) => y.age >= age && y.shortfall);
}

export function computeFireAnalysis(
  scenario: Scenario,
  years: YearRow[],
  globalAssumptions: Assumptions = defaultAssumptions,
  fireAssumptions: FireAssumptions = FIRE_DEFAULTS,
): FireAnalysis {
  const a = mergeAssumptions(globalAssumptions, scenario.assumptionsOverride);
  const inp = scenario.inputs;
  const annualSpending = Math.max(0, inp.spending.desiredMonthlyNet * 12);
  const standardTarget = annualSpending / fireAssumptions.withdrawalRate;
  const leanTarget = (annualSpending * fireAssumptions.leanSpendingFactor) / fireAssumptions.withdrawalRate;
  const fatTarget = (annualSpending * fireAssumptions.fatSpendingFactor) / fireAssumptions.withdrawalRate;

  // Per-year capital + meets
  const yearStatus: FireYearStatus[] = years.map((y) => {
    const cap = fireBaseCapitalAtYear(y, fireAssumptions);
    return {
      age: y.age,
      fireBaseCapital: cap,
      standardFiTarget: standardTarget,
      gapToStandardFi: Math.max(0, standardTarget - cap),
      meets: {
        coast: false, // beregnes nedenfor (et tidspunkt-niveau)
        lean: cap >= leanTarget,
        standard: cap >= standardTarget,
        fat: cap >= fatTarget,
        barista: cap * fireAssumptions.withdrawalRate + y.flows.partTimeNet >= annualSpending && y.flows.partTimeNet > 0,
      },
    };
  });

  function findFirstAchievedAge(predicate: (s: FireYearStatus) => boolean): number | null {
    for (const s of yearStatus) {
      if (predicate(s) && noShortfallFromAge(years, s.age)) return s.age;
    }
    return null;
  }

  const standardAge = findFirstAchievedAge((s) => s.meets.standard);
  const leanAge = findFirstAchievedAge((s) => s.meets.lean);
  const fatAge = findFirstAchievedAge((s) => s.meets.fat);
  const baristaAge = findFirstAchievedAge((s) => s.meets.barista);

  // Coast FI — kan nuværende kapital vokse til standardTarget før stopAge?
  const currentCapital =
    inp.free.balance +
    (fireAssumptions.includeHoldingInFire ? inp.holding.balance : 0) +
    (fireAssumptions.includePensionInFire ? inp.pension.balance : 0);
  const yearsToStop = Math.max(0, inp.stopAge - inp.person.currentAge);
  // Brug fri-realafkast som proxy for coast-vækst (mest brugt FIRE-kapital)
  const r = a.realReturn.free;
  const projectedAtStop = currentCapital * Math.pow(1 + r, yearsToStop);
  const coastAchievedNow = projectedAtStop >= standardTarget;
  // Hvis ikke i dag — find første alder hvor remaining-years giver vækst nok
  let coastAge: number | null = coastAchievedNow ? inp.person.currentAge : null;
  if (!coastAchievedNow) {
    for (const s of yearStatus) {
      const remaining = Math.max(0, inp.stopAge - s.age);
      if (remaining <= 0) break;
      const projected = s.fireBaseCapital * Math.pow(1 + r, remaining);
      if (projected >= standardTarget && noShortfallFromAge(years, s.age)) {
        coastAge = s.age;
        break;
      }
    }
  }
  // Marker meets.coast pr. år
  for (const s of yearStatus) {
    const remaining = Math.max(0, inp.stopAge - s.age);
    if (remaining <= 0) {
      s.meets.coast = s.fireBaseCapital >= standardTarget;
    } else {
      s.meets.coast = s.fireBaseCapital * Math.pow(1 + r, remaining) >= standardTarget;
    }
  }

  function buildResult(
    type: FireType,
    target: number,
    age: number | null,
  ): FireResult {
    const yAtAge = age !== null ? years.find((y) => y.age === age) : null;
    const yAtStop = years.find((y) => y.age === inp.stopAge);
    const refY = yAtAge ?? yAtStop ?? years[years.length - 1];
    const cap = refY ? fireBaseCapitalAtYear(refY, fireAssumptions) : 0;
    const sustainable = age !== null;
    const status: FireStatus = age !== null
      ? (age <= inp.person.currentAge ? "achieved" : "achieved_at_age")
      : (cap >= target ? "not_sustainable" : "not_achieved");
    return {
      type,
      label: TYPE_LABEL[type],
      description: TYPE_DESC[type],
      capitalRequired: target,
      capitalAvailable: cap,
      achievedAtAge: age,
      gap: Math.max(0, target - cap),
      status,
    };
  }

  const results: Record<FireType, FireResult> = {
    coast: buildResult("coast", standardTarget, coastAge),
    lean: buildResult("lean", leanTarget, leanAge),
    standard: buildResult("standard", standardTarget, standardAge),
    fat: buildResult("fat", fatTarget, fatAge),
    barista: buildResult("barista", standardTarget, baristaAge),
  };

  // Nærmeste milepæl: vælg den med lavest opnået-alder (eller den med mindst gap hvis ingen opnås)
  const achievedAges: { type: FireType; age: number }[] = [];
  (Object.keys(results) as FireType[]).forEach((k) => {
    const a = results[k].achievedAtAge;
    if (a !== null) achievedAges.push({ type: k, age: a });
  });
  achievedAges.sort((x, y) => x.age - y.age);
  const nearestMilestone = achievedAges.length > 0 ? achievedAges[0].type : null;
  const earliestFireAge = achievedAges.length > 0 ? achievedAges[0].age : null;

  // Dependence — andel ved 95 (slutaktiver, primært til legacy/visning)
  const yEnd = years[years.length - 1];
  const totalEnd = Math.max(1, yEnd.closing.free + yEnd.closing.pension + yEnd.closing.holding);
  const dependence = {
    freeShare: yEnd.closing.free / totalEnd,
    pensionShare: yEnd.closing.pension / totalEnd,
    holdingShare: yEnd.closing.holding / totalEnd,
  };

  // Kapitalgrundlag bag FIRE — match cards' "Forventet kapital" reference år.
  // Brug Standard FI's reference: opnået-alder hvis muligt, ellers stopalder,
  // ellers sidste år (samme logik som buildResult).
  const refY =
    (standardAge !== null ? years.find((y) => y.age === standardAge) : undefined) ??
    years.find((y) => y.age === inp.stopAge) ??
    years[years.length - 1];
  const cb_free = refY ? Math.max(0, refY.closing.free) : 0;
  const cb_holding = refY ? Math.max(0, refY.closing.holding) : 0;
  const cb_pension = refY ? Math.max(0, refY.closing.pension) : 0;
  const cb_buffer = refY ? Math.max(0, refY.closing.buffer ?? 0) : 0;
  const incl = {
    free: true,
    holding: fireAssumptions.includeHoldingInFire,
    pension: fireAssumptions.includePensionInFire,
    // Buffer er informationsmæssigt — kan bruges ved shortfall hvis modelvalget tillader det.
    buffer: !!inp.free.bufferUsableForShortfall,
  };
  const totalIncluded =
    (incl.free ? cb_free : 0) +
    (incl.holding ? cb_holding : 0) +
    (incl.pension ? cb_pension : 0);
  const totalAll = cb_free + cb_holding + cb_pension + cb_buffer;
  const shareDen = totalIncluded > 0 ? totalIncluded : 0;
  const shares = {
    free: shareDen > 0 ? (incl.free ? cb_free : 0) / shareDen : 0,
    holding: shareDen > 0 ? (incl.holding ? cb_holding : 0) / shareDen : 0,
    pension: shareDen > 0 ? (incl.pension ? cb_pension : 0) / shareDen : 0,
    buffer: 0, // buffer indgår ikke i FIRE-grundlaget
  };
  const capitalBreakdown = {
    referenceAge: refY?.age ?? inp.person.currentAge,
    free: cb_free,
    holding: cb_holding,
    pension: cb_pension,
    buffer: cb_buffer,
    totalIncluded,
    totalAll,
    shares,
    included: incl,
  };

  const afterStop = years.filter((y) => y.age >= inp.stopAge);
  const monthlyGapAfterStop = afterStop.length > 0
    ? afterStop.reduce((s, y) => s + y.monthlyGap, 0) / afterStop.length
    : 0;

  return {
    assumptions: fireAssumptions,
    annualSpending,
    standardFiNumber: standardTarget,
    results,
    nearestMilestone,
    earliestFireAge,
    yearStatus,
    dependence,
    capitalBreakdown,
    monthlyGapAfterStop,
  };
}

export function statusLabel(status: FireStatus, age: number | null): string {
  if (status === "achieved") return "Opnået";
  if (status === "achieved_at_age") return age !== null ? `Opnås ved alder ${age}` : "Opnås";
  if (status === "not_sustainable") return "Ikke bæredygtig";
  return "Ikke opnået";
}
