/**
 * Builds the single typed `PublicResult` the public screens consume.
 *
 * Pure orchestration over the EXISTING engine: it maps the simple public inputs with the shared
 * `simpleInputs` layer, runs the real `project` + `deriveKPIs` pipeline, then turns the raw
 * outputs into horizon-correct, public-safe values. No projection logic is duplicated here.
 */
import type { Assumptions, KPIs, YearRow } from "../types";
import { project } from "../projection";
import { deriveKPIs } from "../kpis";
import { toAssumptions, toScenario, type SimplePublicInputs } from "../simpleInputs";
import type { PublicBottleneck, PublicResult } from "./types";
import { toPublicStatus } from "./status";
import { adaptRobustnessDrivers } from "./drivers";
import { toRobustnessScore, toAssumptionConfidenceScore } from "./scores";
import { capitalAtPlannedStopAge, firstShortfall, moneyLastsToAge, netWorthSeries } from "./selectors";

/**
 * Build a `PublicResult` from already-computed engine outputs. Kept separate from
 * `computePublicResult` so it can be unit-tested against hand-built `YearRow[]` / `KPIs`.
 */
export function buildPublicResult(inputs: SimplePublicInputs, years: YearRow[], kpis: KPIs): PublicResult {
  const currentAge = inputs.currentAge;
  const lifeExpectancy = Math.max(currentAge, inputs.lifeExpectancy);
  const hasFiTarget = (inputs.fiTargetMinNetWorth ?? 0) > 0;

  // Bottleneck: the FIRST-shortfall year (its own monthly gap), never the after-stop average.
  const short = firstShortfall(years);
  const firstShortfallAge = short ? short.age : null;
  const bottleneck: PublicBottleneck = short
    ? { kind: "shortfall", firstShortfallAge: short.age, monthlyGap: short.monthlyGap }
    : { kind: "none" };

  // Status: derived from the engine verdict only (no new thresholds), reason synthesised safely.
  const status = toPublicStatus(kpis, { firstShortfallAge, hasFiTarget });

  // Frihedspunkt: bounded to the horizon.
  const earliest =
    kpis.earliestSustainableStopAge == null
      ? null
      : Math.max(currentAge, Math.min(lifeExpectancy, kpis.earliestSustainableStopAge));

  return {
    status,
    earliestSustainableStopAge: earliest,
    capitalAtStopAge: capitalAtPlannedStopAge(years, inputs.desiredStopAge, currentAge, lifeExpectancy),
    // Same `short` row as the bottleneck → moneyLastsToAge and bottleneck can never diverge.
    moneyLastsToAge: moneyLastsToAge(years, short),
    bottleneck,
    netWorthByAge: netWorthSeries(years),
    desiredStopAge: Math.max(currentAge, Math.min(lifeExpectancy, inputs.desiredStopAge)),
    lifeExpectancy,
    drivers: adaptRobustnessDrivers(kpis.robustnessBreakdown, { hasFiTarget }),
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
  return buildPublicResult(inputs, years, kpis);
}
