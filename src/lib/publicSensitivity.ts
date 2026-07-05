import { computePublicResult, type PublicResult, type SimplePublicInputs } from "@/lib/finance/public";
import { sanitizeSimpleInputs } from "@/lib/publicInputs";
import { formatKr, headlineStopAge } from "@/lib/publicFormat";

/**
 * The 1-lever sensitivity helper (scope doc item 7): "what would 1.000 kr more monthly saving
 * do?" — answered by running the REAL pipeline twice (baseline + perturbed), never by
 * approximating (the scope doc's own medium-risk flag). The lever and step are the scope
 * doc's own example: monthlySavings + 1.000 kr/month.
 *
 * Every sentence is a claim backed by the perturbed computePublicResult run:
 *  - a status flip (off_track -> on_track/tight, tight -> on_track) is claimed as the flip;
 *  - otherwise a same-kind numeric improvement is claimed with BOTH exact figures
 *    ("alder X i stedet for Y"), thresholded at whole years (ages are integers) and, for
 *    tight, at whole kroner of end-capital gain;
 *  - if the headline answer is provably unchanged, the honest fallback says exactly that;
 *  - anything the rules cannot claim truthfully returns null and the helper is not shown.
 *
 * Hidden (null) rather than worded around:
 *  - when the baseline carries the "planned-over-cashflow" warning: the savings lever is
 *    inert (the model already cannot fit the PLANNED savings), and that warning owns the
 *    story — "1.000 kr more changes nothing" next to it would invite the misreading that
 *    saving is pointless;
 *  - when the +1.000 step does not fit inside the input range (monthlySavings near the
 *    500.000 cap): the sanitized perturbation would test a smaller step than the sentence
 *    claims;
 *  - on any unexpected status transition (e.g. a downgrade): no invented copy.
 */
export const SAVINGS_SENSITIVITY_STEP = 1_000;

/** Matches the §4.1 input range cap for monthlySavings in publicInputs.ts. */
const MONTHLY_SAVINGS_MAX = 500_000;

export interface SensitivityClaim {
  /** The full Danish sentence shown on the Result screen. */
  text: string;
  /** The perturbed pipeline result backing the claim (exposed for tests). */
  perturbed: PublicResult;
}

export function deriveSavingsSensitivity(inputs: SimplePublicInputs, baseline: PublicResult): SensitivityClaim | null {
  if (baseline.warnings.some((w) => w.id === "planned-over-cashflow")) return null;
  if (inputs.monthlySavings + SAVINGS_SENSITIVITY_STEP > MONTHLY_SAVINGS_MAX) return null;

  const perturbed = computePublicResult(
    sanitizeSimpleInputs({ ...inputs, monthlySavings: inputs.monthlySavings + SAVINGS_SENSITIVITY_STEP }),
  );
  const prefix = "Hvis du sparer 1.000 kr mere op om måneden, ";
  const b = baseline;
  const p = perturbed;
  const claim = (text: string): SensitivityClaim => ({ text: prefix + text, perturbed });

  // Status flips first: the strongest, always-meaningful outcome.
  if (b.status.kind === "off_track" && p.status.kind === "on_track") {
    return claim(`rækker pengene hele vejen til ${p.lifeExpectancy}.`);
  }
  if (b.status.kind === "off_track" && p.status.kind === "tight") {
    return claim(`rækker pengene hele vejen til ${p.lifeExpectancy}, men du slutter stadig under dit mål.`);
  }
  if (b.status.kind === "tight" && p.status.kind === "on_track") {
    return claim(`når du dit mål på ${formatKr(inputs.fiTargetMinNetWorth ?? 0)}.`);
  }
  // Any other cross-kind transition is unexpected for a savings increase: claim nothing.
  if (p.status.kind !== b.status.kind) return null;

  if (b.status.kind === "off_track") {
    if (p.moneyLastsToAge > b.moneyLastsToAge) {
      return claim(`rækker pengene til alder ${p.moneyLastsToAge} i stedet for ${b.moneyLastsToAge}.`);
    }
    if (p.moneyLastsToAge === b.moneyLastsToAge) return claim("ændrer det ikke svaret her.");
    return null;
  }

  const bAge = headlineStopAge(b.status.kind, b.earliestSustainableStopAge, b.desiredStopAge);
  const pAge = headlineStopAge(p.status.kind, p.earliestSustainableStopAge, p.desiredStopAge);

  if (b.status.kind === "on_track") {
    // The earlier-stop claim needs a KNOWN earliest on both sides — the search-ceiling null
    // case would compare an unknowable "earliest" against a known one.
    if (b.earliestSustainableStopAge != null && p.earliestSustainableStopAge != null && pAge < bAge) {
      return claim(`kan du tidligst stoppe ved alder ${pAge} i stedet for ${bAge}.`);
    }
    if (pAge === bAge) return claim("ændrer det ikke svaret her.");
    return null;
  }

  // tight (implies a goal is set): the meaningful margin is capital vs the goal at the end.
  const endGain = Math.round(p.capitalAtEndOfHorizon - b.capitalAtEndOfHorizon);
  if (endGain >= 1) {
    return claim(`slutter du ${formatKr(endGain)} tættere på dit mål.`);
  }
  if (endGain === 0 && pAge === bAge) return claim("ændrer det ikke svaret her.");
  return null;
}
