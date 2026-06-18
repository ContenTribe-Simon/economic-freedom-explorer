/**
 * Public-safe robustness-drivers adapter (data contract §4.5).
 *
 * `ScoreFactor` has no stable id and its labels embed dynamic numbers, so we classify each factor
 * by its known origin in kpis.ts via a DEFAULT-DENY family allowlist on the LABEL: only the
 * cashflow-coverage family survives the per-factor pass. Everything else is dropped — in particular
 * the holding-dependency factor (which deriveKPIs pushes unconditionally, even when holding = 0)
 * and the cash-buffer factor (the simple surface has no buffer input).
 *
 * The END-OF-HORIZON-MARGIN family is NOT translated from the engine factor. deriveKPIs computes
 * that factor from `yAt95` (a FIXED age 95), which is an interior point when lifeExpectancy > 95 —
 * so translating it would claim "margin ved planperiodens slutning" on a fixed-age-95 basis, the
 * exact fixed-age anchor the horizon-boundary rule (§4.0 R1) forbids for end-of-horizon outputs.
 * Instead we recompute the end-margin driver from the adapter's own LAST YearRow against the public
 * minimum-goal input (§4.5 option 1: "end-of-horizon capital vs. fiTargetMinNetWorth"), so it is
 * horizon-correct for every lifeExpectancy. We emit our own fresh Danish copy and never pass raw
 * engine label/detail through; the leak guard runs on the copy we EMIT.
 */
import type { ScoreFactor } from "../types";
import type { PublicDriver } from "./types";
import { containsForbiddenTerm } from "./safety";

export interface DriverContext {
  /** Whether the user set an FI target (so a "mål" mention is meaningful). */
  hasFiTarget: boolean;
  /** End-of-horizon net worth = the LAST projected YearRow's netWorth (never the age-95 value). */
  endOfHorizonNetWorth: number;
  /** Public FI minimum-goal input (0 when not set). */
  fiTargetMinNetWorth: number;
  /** Annual desired spending (monthlySpending * 12) — for the 5×-spending margin threshold. */
  annualSpending: number;
}

/** Classify a per-factor LABEL into a cashflow-coverage public driver, or `null` to drop it. */
function classifyCashflow(label: string): PublicDriver | null {
  if (/ingen cashflow-shortfall/i.test(label)) {
    return { direction: "helps", text: "Dit forbrug er dækket hele perioden." };
  }
  if (/cashflow-shortfall ved alder/i.test(label)) {
    const m = label.match(/alder\s+(\d+)/i);
    return {
      direction: "hurts",
      text: m ? `Pengene slipper op ved alder ${m[1]}.` : "Pengene slipper op før planperiodens slutning.",
    };
  }
  if (/månedligt hul efter stop/i.test(label)) {
    return { direction: "hurts", text: "Du mangler i gennemsnit penge hver måned efter at du stopper." };
  }
  // Default-deny: end-margin factors (handled separately), holding-dependency, cash buffer,
  // concentration, part-time, … are all dropped here.
  return null;
}

/**
 * Horizon-correct end-of-horizon-margin driver, recomputed from the LAST YearRow (never age 95).
 * Mirrors the kpis.ts comparison (target-missed → thin margin (< 5× annual spend) → comfortable),
 * but anchored to the real end of horizon.
 */
function endOfHorizonMarginDriver(ctx: DriverContext): PublicDriver | null {
  const goal = ctx.fiTargetMinNetWorth;
  const endValue = ctx.endOfHorizonNetWorth;
  const belowGoal = endValue + 0.5 < goal;
  const endMargin = (endValue - goal) / Math.max(1, ctx.annualSpending * 5);

  if (belowGoal && ctx.hasFiTarget) {
    return { direction: "hurts", text: "Du når ikke dit mål ved planperiodens slutning." };
  }
  if (belowGoal || endMargin < 1) {
    return {
      direction: "hurts",
      text: ctx.hasFiTarget
        ? "Der er kun lille margin til dit mål ved planperiodens slutning."
        : "Der er kun lille margin ved planperiodens slutning.",
    };
  }
  return { direction: "helps", text: "Du har god margin ved planperiodens slutning." };
}

/**
 * Filter + translate the raw `robustnessBreakdown` into public-safe Danish drivers.
 * Cashflow-coverage factors are allowlisted by label (default-deny for the rest); the
 * end-of-horizon-margin driver is recomputed horizon-correctly from the last YearRow.
 */
export function adaptRobustnessDrivers(breakdown: ScoreFactor[], ctx: DriverContext): PublicDriver[] {
  const out: PublicDriver[] = [];

  for (const f of breakdown) {
    const driver = classifyCashflow(f.label ?? "");
    if (driver && !containsForbiddenTerm(driver.text)) out.push(driver);
  }

  const margin = endOfHorizonMarginDriver(ctx);
  if (margin && !containsForbiddenTerm(margin.text)) out.push(margin);

  return out;
}
