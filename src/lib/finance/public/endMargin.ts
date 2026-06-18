/**
 * The single end-of-horizon margin evaluation, shared by the public STATUS (the target-met
 * component) and the end-of-horizon-margin DRIVER, so the two can never disagree.
 *
 * It is horizon-correct: it compares the LAST projected YearRow's net worth against the public
 * minimum-goal input (data contract §4.5 option 1: "end-of-horizon capital vs. fiTargetMinNetWorth"),
 * with the same 5×-annual-spend banding the engine uses — but anchored to the real end of horizon,
 * never the fixed age-95 value (§4.0 R1).
 */
export type EndMarginVerdict = "comfortable" | "thin" | "missed";

export interface EndMarginInput {
  /** End-of-horizon net worth = the LAST projected YearRow's netWorth (never the age-95 value). */
  endOfHorizonNetWorth: number;
  /** Public FI minimum-goal input (0 when not set). */
  fiTargetMinNetWorth: number;
  /** Annual desired spending (monthlySpending * 12). */
  annualSpending: number;
}

/** Classify the end-of-horizon margin: target missed, thin (< 5× annual spend over goal), or comfortable. */
export function classifyEndMargin(x: EndMarginInput): EndMarginVerdict {
  const goal = x.fiTargetMinNetWorth;
  const endValue = x.endOfHorizonNetWorth;
  if (endValue + 0.5 < goal) return "missed";
  const margin = (endValue - goal) / Math.max(1, x.annualSpending * 5);
  return margin < 1 ? "thin" : "comfortable";
}
