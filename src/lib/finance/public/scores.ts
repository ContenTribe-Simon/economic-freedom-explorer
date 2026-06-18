/**
 * Public-safe score banding (data contract §4.2: `financialRobustness` and `assumptionConfidence`
 * are 0–100 public outputs). Presentation only — these do NOT recompute the engine score; they
 * clamp the existing scalar to [0, 100] and attach a short Danish band label. Never expose a raw
 * internal breakdown object.
 */
import type { PublicScore } from "./types";

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** `financialRobustness` (0–100) → public score + Danish band ("Lav/Middel/Høj robusthed"). */
export function toRobustnessScore(financialRobustness: number): PublicScore {
  const score = clamp100(financialRobustness);
  const label = score >= 70 ? "Høj robusthed" : score >= 40 ? "Middel robusthed" : "Lav robusthed";
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
