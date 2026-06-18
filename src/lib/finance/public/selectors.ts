/**
 * Horizon-correct primitives derived from the engine's existing `YearRow[]`.
 *
 * These build ON TOP of the engine — the projection already spans exactly
 * [currentAge, lifeExpectancy] (projection.ts: `age = currentAge + i`). Where a primitive the
 * public surface needs is not a precomputed KPI (net worth at an arbitrary age, the first
 * shortfall, the end-of-horizon value), we compute it here from the YearRows rather than
 * trusting a fixed-age KPI. See data contract §4.0 (R1) and §4.2.
 */
import type { YearRow } from "../types";
import type { NetWorthPoint } from "./types";

/** Net worth at a given age, read from the YearRow. `null` if the age is outside the projection. */
export function netWorthAtAge(years: YearRow[], age: number): number | null {
  const row = years.find((y) => y.age === age);
  return row ? row.netWorth : null;
}

/**
 * Net worth at the user's planned stop age, read from the YearRow at that age.
 *
 * Horizon-bounded: the lookup age is clamped to [currentAge, lifeExpectancy] so we always read a
 * real projected row (fallback: the start row if `desiredStopAge < currentAge`, the last row if
 * `desiredStopAge > lifeExpectancy`). Never uses the fixed-age capitalAt65 / capitalAt95 KPIs.
 */
export function capitalAtPlannedStopAge(
  years: YearRow[],
  desiredStopAge: number,
  currentAge: number,
  lifeExpectancy: number,
): number {
  if (years.length === 0) return 0;
  const age = Math.max(currentAge, Math.min(lifeExpectancy, desiredStopAge));
  const nw = netWorthAtAge(years, age);
  return nw ?? years[years.length - 1].netWorth;
}

/** First YearRow flagged as a desired-spending shortfall, or `null` if the plan never falls short. */
export function firstShortfall(years: YearRow[]): YearRow | null {
  return years.find((y) => y.shortfall) ?? null;
}

/**
 * The age the money lasts to — the engine's failure signal, NOT `netWorth <= 0`.
 *
 * It is the FIRST shortfall age (`YearRow.shortfall`), passed in as the SAME first-shortfall row
 * the bottleneck uses so the two fields can never diverge. When the plan never falls short, the
 * money lasts the whole plan and this is the LAST projected YearRow's age (== lifeExpectancy) —
 * the end-of-horizon value always comes from the last YearRow, never from capitalAt95.
 *
 * Why not `netWorth <= 0`: net worth can stay positive in a bridge year whose desired spending is
 * unfunded (pension still locked), and can be <= 0 (e.g. early debt) in a year where income still
 * covers spending. `YearRow.shortfall` is the engine's real "can't fund spending" signal, so this
 * stays consistent with `bottleneck` and the engine verdict.
 */
export function moneyLastsToAge(years: YearRow[], firstShortfallRow: YearRow | null): number {
  if (firstShortfallRow) return firstShortfallRow.age;
  return years.length ? years[years.length - 1].age : 0;
}

/** Total-net-worth-per-age series for the horizon chart. Total line only — never per-bucket. */
export function netWorthSeries(years: YearRow[]): NetWorthPoint[] {
  return years.map((y) => ({ age: y.age, netWorth: y.netWorth }));
}
