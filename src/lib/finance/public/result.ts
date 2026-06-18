/**
 * Builds the single typed `PublicResult` the public screens consume.
 *
 * Pure orchestration over the EXISTING engine: it maps the simple public inputs with the shared
 * `simpleInputs` layer, runs the real `project` + `deriveKPIs` pipeline, then turns the raw
 * outputs into horizon-correct, public-safe values. No projection logic is duplicated here.
 */
import type { Assumptions, KPIs, SanityCheck, YearRow } from "../types";
import { project } from "../projection";
import { deriveKPIs } from "../kpis";
import { sanityChecks } from "../sanity";
import { toAssumptions, toScenario, type SimplePublicInputs } from "../simpleInputs";
import type { PublicBottleneck, PublicResult } from "./types";
import { toPublicStatus } from "./status";
import { adaptRobustnessDrivers } from "./drivers";
import { adaptWarnings } from "./warnings";
import { classifyEndMargin } from "./endMargin";
import { toRobustnessScore, toAssumptionConfidenceScore } from "./scores";
import {
  capitalAtPensionAccessAge,
  capitalAtPlannedStopAge,
  firstShortfall,
  moneyLastsToAge,
  netWorthSeries,
} from "./selectors";

/**
 * Build a `PublicResult` from already-computed engine outputs. Kept separate from
 * `computePublicResult` so it can be unit-tested against hand-built `YearRow[]` / `KPIs`. `checks`
 * is the raw `sanityChecks()` output (defaults to none); it passes through the §4.4 warnings adapter.
 */
export function buildPublicResult(
  inputs: SimplePublicInputs,
  years: YearRow[],
  kpis: KPIs,
  checks: SanityCheck[] = [],
): PublicResult {
  const currentAge = inputs.currentAge;
  const lifeExpectancy = Math.max(currentAge, inputs.lifeExpectancy);
  const hasFiTarget = (inputs.fiTargetMinNetWorth ?? 0) > 0;

  // Bottleneck: the FIRST-shortfall year (its own monthly gap), never the after-stop average.
  const short = firstShortfall(years);
  const firstShortfallAge = short ? short.age : null;
  const bottleneck: PublicBottleneck = short
    ? { kind: "shortfall", firstShortfallAge: short.age, monthlyGap: short.monthlyGap }
    : { kind: "none" };

  // End of horizon = the LAST projected YearRow (never the fixed-age-95 KPI). One shared
  // end-of-horizon margin verdict feeds BOTH the status's target component and the end-margin
  // driver, so they can never disagree.
  const endOfHorizonNetWorth = years.length ? years[years.length - 1].netWorth : 0;
  const endMarginVerdict = classifyEndMargin({
    endOfHorizonNetWorth,
    fiTargetMinNetWorth: inputs.fiTargetMinNetWorth ?? 0,
    annualSpending: Math.max(1, inputs.monthlySpending * 12),
  });

  // Status: off_track from the public shortfall (firstShortfallAge); target component from the
  // shared end-margin verdict. Reason synthesised safely (never the raw modelStatusReason).
  const status = toPublicStatus({ firstShortfallAge, hasFiTarget, endMarginVerdict });

  // Frihedspunkt: bounded to the horizon.
  const earliest =
    kpis.earliestSustainableStopAge == null
      ? null
      : Math.max(currentAge, Math.min(lifeExpectancy, kpis.earliestSustainableStopAge));

  return {
    status,
    earliestSustainableStopAge: earliest,
    capitalAtStopAge: capitalAtPlannedStopAge(years, inputs.desiredStopAge, currentAge, lifeExpectancy),
    capitalAtPensionAccessAge: capitalAtPensionAccessAge(years, inputs.pensionAccessAge, currentAge, lifeExpectancy),
    capitalAtEndOfHorizon: endOfHorizonNetWorth,
    // Same `short` row as the bottleneck → moneyLastsToAge and bottleneck can never diverge.
    moneyLastsToAge: moneyLastsToAge(years, short),
    bottleneck,
    netWorthByAge: netWorthSeries(years),
    desiredStopAge: Math.max(currentAge, Math.min(lifeExpectancy, inputs.desiredStopAge)),
    lifeExpectancy,
    drivers: adaptRobustnessDrivers(kpis.robustnessBreakdown, { hasFiTarget, endMarginVerdict }),
    warnings: adaptWarnings(checks),
    robustness: toRobustnessScore(kpis.financialRobustness),
    assumptionConfidence: toAssumptionConfidenceScore(kpis.assumptionConfidence),
  };
}

/**
 * The public entry point: map simple inputs → run the existing engine → produce a `PublicResult`.
 * The public UI calls this (or `buildPublicResult` with its own pipeline run); it never touches
 * the raw engine modules directly.
 */
export function computePublicResult(inputs: SimplePublicInputs): PublicResult {
  const scenario = toScenario(inputs);
  const assumptions: Assumptions = toAssumptions(inputs);
  const years = project(scenario, assumptions);
  const kpis = deriveKPIs(scenario, years, assumptions);
  const checks = sanityChecks(scenario, years);
  return buildPublicResult(inputs, years, kpis, checks);
}
