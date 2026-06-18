/**
 * Public-safe robustness-drivers adapter (data contract §4.5).
 *
 * `ScoreFactor` has no stable id and its labels embed dynamic numbers, so we classify each factor
 * by its known origin in kpis.ts via a DEFAULT-DENY family allowlist: only the cashflow-coverage
 * and end-of-horizon-margin families surface. Everything else is dropped — in particular the
 * holding-dependency factor (which deriveKPIs pushes unconditionally, even when holding = 0) and
 * the cash-buffer factor (the simple surface has no buffer input, so it always reads "Lav kontant
 * buffer"). Survivors are rewritten to fresh Danish copy; engine label text is never passed through.
 */
import type { ScoreFactor } from "../types";
import type { PublicDriver } from "./types";

/** Hard-block: factors whose label/detail references advanced/DK/internal vocabulary. */
const BLOCK_RE = /holding|buffer|deltid|\bask\b|aktiesparekonto|koncentration|familiefond|folkepension/i;

export interface DriverContext {
  /** Whether the user set an FI target (so a "mål" mention is meaningful). */
  hasFiTarget: boolean;
}

/**
 * Filter + translate the raw `robustnessBreakdown` into public-safe Danish drivers.
 * Anything not matched by an allowlisted family is dropped (default-deny).
 */
export function adaptRobustnessDrivers(breakdown: ScoreFactor[], ctx: DriverContext): PublicDriver[] {
  const out: PublicDriver[] = [];

  for (const f of breakdown) {
    const label = f.label ?? "";
    const detail = f.detail ?? "";

    // Hard-block advanced/DK/internal families regardless of any allow-match.
    if (BLOCK_RE.test(label) || BLOCK_RE.test(detail)) continue;

    // --- Cashflow-coverage family ---
    if (/ingen cashflow-shortfall/i.test(label)) {
      out.push({ direction: "helps", text: "Dit forbrug er dækket hele perioden." });
      continue;
    }
    if (/cashflow-shortfall ved alder/i.test(label)) {
      const m = label.match(/alder\s+(\d+)/i);
      out.push({
        direction: "hurts",
        text: m ? `Pengene slipper op ved alder ${m[1]}.` : "Pengene slipper op før planperiodens slutning.",
      });
      continue;
    }
    if (/månedligt hul efter stop/i.test(label)) {
      out.push({ direction: "hurts", text: "Du mangler i gennemsnit penge hver måned efter at du stopper." });
      continue;
    }

    // --- End-of-horizon-margin family ---
    if (/komfortabel slutmargin/i.test(label)) {
      out.push({ direction: "helps", text: "Du har god margin ved planperiodens slutning." });
      continue;
    }
    if (/lav margin til minimumsmål/i.test(label)) {
      out.push({
        direction: "hurts",
        text: ctx.hasFiTarget
          ? "Der er kun lille margin til dit mål ved planperiodens slutning."
          : "Der er kun lille margin ved planperiodens slutning.",
      });
      continue;
    }
    if (/minimumsmål ikke opfyldt/i.test(label)) {
      // Only meaningful with an FI target; otherwise drop.
      if (ctx.hasFiTarget) out.push({ direction: "hurts", text: "Du når ikke dit mål ved planperiodens slutning." });
      continue;
    }

    // Default-deny: anything unrecognised is dropped.
  }

  return out;
}
