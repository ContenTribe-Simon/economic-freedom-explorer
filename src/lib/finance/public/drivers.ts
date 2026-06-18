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
 * Instead the end-margin driver maps the SHARED end-of-horizon verdict (`classifyEndMargin`, the
 * same one the public status consumes — last YearRow vs fiTargetMinNetWorth), so it is
 * horizon-correct for every lifeExpectancy AND can never disagree with the status. We emit our own
 * fresh Danish copy and never pass raw engine label/detail through; the leak guard runs on the
 * copy we EMIT.
 */
import type { ScoreFactor } from "../types";
import type { EndMarginVerdict } from "./endMargin";
import type { PublicDriver } from "./types";
import { containsForbiddenTerm } from "./safety";

export interface DriverContext {
  /** Whether the user set an FI target (so a "mål" mention is meaningful). */
  hasFiTarget: boolean;
  /** Shared end-of-horizon margin verdict — the SAME one the public status consumes. */
  endMarginVerdict: EndMarginVerdict;
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
 * Horizon-correct end-of-horizon-margin driver, from the SHARED end-margin verdict (last YearRow,
 * never age 95). Maps the verdict the public status also consumes to fresh Danish copy.
 */
function endOfHorizonMarginDriver(ctx: DriverContext): PublicDriver | null {
  switch (ctx.endMarginVerdict) {
    case "missed":
      return {
        direction: "hurts",
        text: ctx.hasFiTarget
          ? "Du når ikke dit mål ved planperiodens slutning."
          : "Der er kun lille margin ved planperiodens slutning.",
      };
    case "thin":
      return {
        direction: "hurts",
        text: ctx.hasFiTarget
          ? "Der er kun lille margin til dit mål ved planperiodens slutning."
          : "Der er kun lille margin ved planperiodens slutning.",
      };
    case "comfortable":
      return { direction: "helps", text: "Du har god margin ved planperiodens slutning." };
  }
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
