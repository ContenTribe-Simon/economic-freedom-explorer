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
 * First age within the horizon where total net worth reaches <= 0. If it never does, the money
 * lasts the whole plan and this is the LAST projected YearRow's age (== lifeExpectancy) — the
 * end-of-horizon value always comes from the last YearRow, never from capitalAt95.
 */
export function moneyLastsToAge(years: YearRow[], lifeExpectancy: number): number {
  const depleted = years.find((y) => y.netWorth <= 0);
  if (depleted) return depleted.age;
  return years.length ? years[years.length - 1].age : lifeExpectancy;
}

/** Total-net-worth-per-age series for the horizon chart. Total line only — never per-bucket. */
export function netWorthSeries(years: YearRow[]): NetWorthPoint[] {
  return years.map((y) => ({ age: y.age, netWorth: y.netWorth }));
}
