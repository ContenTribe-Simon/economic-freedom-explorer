/**
 * Public result types for Frihedsmodel.
 *
 * This is the ONLY shape the public UI consumes. Everything here is horizon-correct, Danish,
 * and public-safe (no advanced / DK-personal concepts). It is the data contract made into
 * types — see docs/public-mvp-spec-and-data-contract-v1.md §4.
 *
 * The public UI must import from `src/lib/finance/public` (this module's barrel), never from the
 * raw engine internals (projection / kpis / sanity).
 */

/** Public status enum — derived from the engine's `modelStatus`, never from new thresholds. */
export type PublicStatusKind = "on_track" | "tight" | "off_track";

/** Brand status colour token (maps to the design-system status hues). */
export type StatusColorToken = "sage" | "dawn" | "clay";

export interface PublicStatus {
  kind: PublicStatusKind;
  /** Danish badge label: "På sporet" | "Stramt" | "Ikke på sporet". */
  label: string;
  /** Status colour token: sage (ok) | dawn (tight) | clay (risk). */
  colorToken: StatusColorToken;
  /**
   * Public-safe Danish one-line reason. Synthesised from the verdict + already-public facts —
   * the raw `modelStatusReason` (which can name holding / folkepension / etc.) is never exposed.
   */
  reason: string;
}

/** A single point on the horizon net-worth chart (total net worth only — never per-bucket). */
export interface NetWorthPoint {
  age: number;
  netWorth: number;
}

/** The first real bottleneck. Sourced from the FIRST-shortfall YearRow, never the average gap. */
export type PublicBottleneck =
  | { kind: "none" }
  | {
      kind: "shortfall";
      /** First age the plan can't fund desired spending. */
      firstShortfallAge: number;
      /** Monthly gap in that year — the engine's `YearRow.monthlyGap` (= shortfallAmount / 12), not the after-stop average. */
      monthlyGap: number;
    };

/** A public-safe robustness driver (what helps / what hurts), already translated to Danish. */
export interface PublicDriver {
  direction: "helps" | "hurts";
  text: string;
}

/** A public-safe 0–100 score plus a short Danish band label (never a raw internal object). */
export interface PublicScore {
  /** 0–100, clamped and rounded to an integer. */
  score: number;
  /** Short Danish band label (e.g. "Lav robusthed", "Rimelige antagelser"). */
  label: string;
}

/** A public-safe caution, already filtered (allowlisted by id) and rewritten to plain Danish. */
export interface PublicWarning {
  /** Stable id of the source sanity check (allowlisted, public-safe). */
  id: string;
  /** Fresh public Danish caution copy. */
  text: string;
}

/** The single typed result the public screens consume. */
export interface PublicResult {
  status: PublicStatus;
  /**
   * Frihedspunkt: earliest sustainable stop age, bounded to [currentAge, lifeExpectancy].
   * `null` = not on track (no sustainable stop age in the horizon).
   */
  earliestSustainableStopAge: number | null;
  /**
   * Net worth at the user's planned stop age (`desiredStopAge`), read from the YearRow at that
   * age, horizon-bounded with a defined fallback. Never the fixed-age capitalAt65 / capitalAt95.
   */
  capitalAtStopAge: number;
  /**
   * Net worth at the pension access age (YearRow at `pensionAccessAge`). `null` when that age is
   * outside [currentAge, lifeExpectancy] (omit the card — §4.2). Never a precomputed fixed-age KPI.
   */
  capitalAtPensionAccessAge: number | null;
  /** Net worth at the end of horizon = the LAST projected YearRow (never capitalAt95). */
  capitalAtEndOfHorizon: number;
  /**
   * The age the money lasts to: the FIRST shortfall age (`YearRow.shortfall`, the engine's failure
   * signal — the same first-shortfall row the bottleneck uses). When the plan never falls short, the
   * money lasts the whole plan and this equals `lifeExpectancy` (the LAST YearRow, never capitalAt95).
   */
  moneyLastsToAge: number;
  /** "none" when the money lasts; otherwise the first-shortfall bottleneck. */
  bottleneck: PublicBottleneck;
  /** Total-net-worth-per-age series across [currentAge, lifeExpectancy] for the horizon chart. */
  netWorthByAge: NetWorthPoint[];
  /** Planned stop age (chart plan tick), bounded to [currentAge, lifeExpectancy]. */
  desiredStopAge: number;
  /** Planning-horizon end (chart axis), bounded (>= currentAge). */
  lifeExpectancy: number;
  /** Public-safe robustness drivers (filtered + translated). May be empty. */
  drivers: PublicDriver[];
  /** Public-safe cautions from `sanityChecks()` (allowlisted by id + translated). May be empty. */
  warnings: PublicWarning[];
  /** How solid the plan is: `financialRobustness` (0–100) + a short Danish band label. */
  robustness: PublicScore;
  /** How much the plan leans on optimistic assumptions: `assumptionConfidence` (0–100) + band. */
  assumptionConfidence: PublicScore;
}
