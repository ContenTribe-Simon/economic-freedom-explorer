/**
 * Danish formatting helpers for the public Frihedsmodel screens.
 * Copy rule: exact computed figures in whole kroner, Danish grouping (3.486.500 kr) —
 * never "ca." and never rounded into vagueness.
 */

/** Whole kroner with Danish thousands separators, e.g. 3486500 → "3.486.500 kr". */
export function formatKr(n: number): string {
  return `${Math.round(n).toLocaleString("da-DK")} kr`;
}

/** Long Danish date, e.g. "17. juni 2026". */
export function formatDaLongDate(ms: number): string {
  return new Date(ms).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The stop age for "Du kan stoppe ved alder X" claims on an on-track/tight plan — the earliest
 * age the result PROVES the user can stop at. The single value the Result headline and the
 * save/PDF summary share, so the two surfaces can never disagree.
 *
 * - On track: the plan holds, so the true earliest is <= plan; min() corrects the engine's
 *   search-floor artifact (a plan below 40 that holds can get a RAW earliest of 40).
 * - Tight: the plan holds too (only the end target is missed), so the provable stop age IS the
 *   plan; a non-null earliest is then the later target-satisfying age and min() yields the plan.
 * - Search ceiling (75): earliest comes back null; fall back to the plan (callers drop the
 *   "tidligst" claim for that case).
 *
 * This is a HEADLINE stop age, never a Frihedspunkt value: freedom-point cards/markers show the
 * raw earliestSustainableStopAge directly, which on tight and off-track results is legitimately
 * LATER than the plan and must not be clamped down to it.
 */
export function stopAgeForDisplay(earliestSustainableStopAge: number | null, desiredStopAge: number): number {
  return Math.min(earliestSustainableStopAge ?? desiredStopAge, desiredStopAge);
}
