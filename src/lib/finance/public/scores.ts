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

/**
 * Public cap when the end-of-horizon target is MISSED. A publicly missed plan must not read as
 * "Middel robusthed" (the pre-decision cap of 69 allowed that): the engine itself treats a real
 * target miss as <= 40, so the public boundary mirrors that severity and the badge, the end-margin
 * driver and the robustness band tell one story. Decided with the result screen (2026-07-05); see
 * the result-screen PR for the reasoning. Thin margins keep the softer below-strong cap.
 */
const MISSED_ROBUSTNESS_CAP = 39;

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * `financialRobustness` (0–100) → public score + Danish band ("Lav/Middel/Høj robusthed").
 *
 * The public score is the engine score CAPPED by the shared end-of-horizon margin verdict (the
 * same one the status and the end-margin driver use), so the band can never contradict the
 * status story. Since the engine anchor fix, `deriveKPIs` measures the end margin at the LAST
 * projected YearRow too (no more fixed-age-95 over-read) — the caps remain as PUBLIC BAND
 * calibration, not as a horizon correction: the engine's own target-miss cap is <= 40, which
 * sits in the public "Middel" band, so `missed` still needs the 39 cap to read "Lav"; `thin`
 * stays below the top/"strong" band. No engine fork — a consistency cap at the public boundary.
 */
export function toRobustnessScore(financialRobustness: number, endMarginVerdict?: EndMarginVerdict): PublicScore {
  let score = clamp100(financialRobustness);
  if (endMarginVerdict === "missed") {
    score = Math.min(score, MISSED_ROBUSTNESS_CAP);
  } else if (endMarginVerdict === "thin") {
    score = Math.min(score, STRONG_ROBUSTNESS_MIN - 1);
  }
  const label = score >= STRONG_ROBUSTNESS_MIN ? "Høj robusthed" : score >= 40 ? "Middel robusthed" : "Lav robusthed";
  return { score, label };
}

/**
 * `assumptionConfidence` (0–100) → public score + Danish band. Higher = the plan leans less on
 * optimistic assumptions.
 *
 * Band copy is deliberately human, not system-worded: "Forsigtige/Rimelige/Optimistiske
 * antagelser" replaced the earlier "Høj/Rimelig/Lav antagelsessikkerhed" (a system-oriented
 * coinage the public voice rule avoids — decided with the result screen, 2026-07-05). Same
 * thresholds; only the label text changed. Polarity is unchanged and matches robustness:
 * higher score = better (more cautious assumptions).
 */
export function toAssumptionConfidenceScore(assumptionConfidence: number): PublicScore {
  const score = clamp100(assumptionConfidence);
  const label = score >= 80 ? "Forsigtige antagelser" : score >= 50 ? "Rimelige antagelser" : "Optimistiske antagelser";
  return { score, label };
}
