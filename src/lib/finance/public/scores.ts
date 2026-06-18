/**
 * Public-safe score banding (data contract §4.2: `financialRobustness` and `assumptionConfidence`
 * are 0–100 public outputs). Presentation only — these do NOT recompute the engine score; they
 * clamp the existing scalar to [0, 100] and attach a short Danish band label. Never expose a raw
 * internal breakdown object.
 */
import type { PublicScore } from "./types";
import type { EndMarginVerdict } from "./endMargin";

/** Lower bound of the top/"strong" robustness band. */
const STRONG_ROBUSTNESS_MIN = 70;

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * `financialRobustness` (0–100) → public score + Danish band ("Lav/Middel/Høj robusthed").
 *
 * The public score is the engine score CAPPED to the public horizon. `deriveKPIs` folds an
 * end-margin component computed from the FIXED age 95 (`yAt95`) into `financialRobustness`, which
 * can over-read for `lifeExpectancy > 95`. When the shared end-of-horizon margin verdict (from the
 * LAST YearRow — the same one the status and the end-margin driver use) is `thin` or `missed`, the
 * public score is capped below the top/"strong" band so it cannot contradict a tight status or the
 * end-margin driver. No engine fork — a consistency cap at the public boundary.
 */
export function toRobustnessScore(financialRobustness: number, endMarginVerdict?: EndMarginVerdict): PublicScore {
  let score = clamp100(financialRobustness);
  if (endMarginVerdict === "thin" || endMarginVerdict === "missed") {
    score = Math.min(score, STRONG_ROBUSTNESS_MIN - 1);
  }
  const label = score >= STRONG_ROBUSTNESS_MIN ? "Høj robusthed" : score >= 40 ? "Middel robusthed" : "Lav robusthed";
  return { score, label };
}

/**
 * `assumptionConfidence` (0–100) → public score + Danish band
 * ("Lav/Rimelig/Høj antagelsessikkerhed"). Higher = the plan leans less on optimistic assumptions.
 */
export function toAssumptionConfidenceScore(assumptionConfidence: number): PublicScore {
  const score = clamp100(assumptionConfidence);
  const label =
    score >= 80 ? "Høj antagelsessikkerhed" : score >= 50 ? "Rimelig antagelsessikkerhed" : "Lav antagelsessikkerhed";
  return { score, label };
}
