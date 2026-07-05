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
 * The freedom age to DISPLAY for an on-track/tight plan — the single corrected value every
 * public surface (Result headline, save/PDF summary) must share.
 *
 * Two engine-search artifacts are corrected here, never in the engine:
 * - Search floor (age 40): a plan below 40 that holds can get a RAW earliest ABOVE the working
 *   plan; on track means the plan holds, so the true earliest is <= plan — min() keeps it honest.
 * - Search ceiling (75): a plan beyond it gets earliest null; fall back to the plan (callers
 *   drop the "tidligst" claim for that case).
 * Off-track surfaces use the raw earliest directly (there it is legitimately later than the plan).
 */
export function freedomAgeForDisplay(earliestSustainableStopAge: number | null, desiredStopAge: number): number {
  return Math.min(earliestSustainableStopAge ?? desiredStopAge, desiredStopAge);
}
