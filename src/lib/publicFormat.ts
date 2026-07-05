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
 * The stop age for "Du kan stoppe ved alder X" claims — THE single derivation shared by the
 * Result headline and the save/PDF summary, so the two surfaces can never disagree.
 *
 * - Tight: ALWAYS the user's plan. The plan holds (only the end target is missed), and the
 *   goal-satisfying earliest age is a separate, goal-conditional figure that can lie on EITHER
 *   side of the plan: forced, taxed pension payouts make end wealth path-dependent, so an
 *   EARLIER stop can genuinely end above the goal while the plan misses it (found by the
 *   property suite in CI, fast-check seed -1890050878: earliest 40, plan 51). A min() here
 *   would headline "alder 40" for a plan the user set at 51 — and briefly did, on the save
 *   summary only, which is exactly the cross-surface divergence this helper exists to prevent.
 * - On track: min(earliest ?? plan, plan), the earliest PROVABLE stop age. Corrects the
 *   engine's search-floor artifact (a plan below 40 that holds can get a RAW earliest of 40)
 *   and falls back to the plan when the search (capped at 75) returns null (callers drop the
 *   "tidligst" claim for that case).
 * - Off track: not used — those surfaces derive their own ages (money-lasts-to, raw freedom
 *   point); passing off_track falls through to the on-track arithmetic for API totality.
 *
 * This is a HEADLINE stop age, never a Frihedspunkt value: freedom-point cards/markers show the
 * raw earliestSustainableStopAge directly, wherever it lies relative to the plan.
 */
export function headlineStopAge(
  statusKind: "on_track" | "tight" | "off_track",
  earliestSustainableStopAge: number | null,
  desiredStopAge: number,
): number {
  if (statusKind === "tight") return desiredStopAge;
  return Math.min(earliestSustainableStopAge ?? desiredStopAge, desiredStopAge);
}
