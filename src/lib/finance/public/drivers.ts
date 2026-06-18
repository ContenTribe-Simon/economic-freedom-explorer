/**
 * Public-safe robustness-drivers adapter (data contract §4.5).
 *
 * `ScoreFactor` has no stable id and its labels embed dynamic numbers, so we classify each factor
 * by its known origin in kpis.ts via a DEFAULT-DENY family allowlist on the LABEL: only the
 * cashflow-coverage and end-of-horizon-margin families survive. Everything else is dropped — in
 * particular the holding-dependency factor (which deriveKPIs pushes unconditionally, even when
 * holding = 0) and the cash-buffer factor (the simple surface has no buffer input).
 *
 * A factor's fate is decided by its LABEL/family, never by scanning its `detail`. We emit our own
 * fresh Danish copy and never pass the raw engine `detail` through, so an allowlisted factor whose
 * detail happens to contain a blocked word (e.g. the end-of-horizon-margin factor's detail reads
 * "...5× årsforbrug i buffer") must NOT be dropped. The genuine cash-buffer factor is still dropped
 * — by its own label/family, not by the substring "buffer" appearing anywhere. As defence in depth
 * the leak guard runs on the copy we EMIT (not the raw upstream detail).
 */
import type { ScoreFactor } from "../types";
import type { PublicDriver } from "./types";
import { containsForbiddenTerm } from "./safety";

export interface DriverContext {
  /** Whether the user set an FI target (so a "mål" mention is meaningful). */
  hasFiTarget: boolean;
}

/** Classify a single factor into a public driver by its label/family, or `null` to drop it. */
function classify(label: string, ctx: DriverContext): PublicDriver | null {
  // --- Cashflow-coverage family ---
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

  // --- End-of-horizon-margin family ---
  if (/komfortabel slutmargin/i.test(label)) {
    return { direction: "helps", text: "Du har god margin ved planperiodens slutning." };
  }
  if (/lav margin til minimumsmål/i.test(label)) {
    return {
      direction: "hurts",
      text: ctx.hasFiTarget
        ? "Der er kun lille margin til dit mål ved planperiodens slutning."
        : "Der er kun lille margin ved planperiodens slutning.",
    };
  }
  if (/minimumsmål ikke opfyldt/i.test(label)) {
    // Only meaningful with an FI target; otherwise drop.
    return ctx.hasFiTarget ? { direction: "hurts", text: "Du når ikke dit mål ved planperiodens slutning." } : null;
  }

  // Default-deny: holding-dependency, cash buffer, concentration, part-time, … are all dropped.
  return null;
}

/**
 * Filter + translate the raw `robustnessBreakdown` into public-safe Danish drivers.
 * Allowlist by label/family; emit fresh copy; drop anything unrecognised (default-deny).
 */
export function adaptRobustnessDrivers(breakdown: ScoreFactor[], ctx: DriverContext): PublicDriver[] {
  const out: PublicDriver[] = [];
  for (const f of breakdown) {
    const driver = classify(f.label ?? "", ctx);
    if (!driver) continue; // default-deny
    // Output-side leak guard: we author every public string, but never emit a forbidden term.
    if (containsForbiddenTerm(driver.text)) continue;
    out.push(driver);
  }
  return out;
}
