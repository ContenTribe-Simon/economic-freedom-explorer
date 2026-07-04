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
