/**
 * Public-safe warnings adapter (data contract §4.4(b)).
 *
 * `sanityChecks()` is internal/advanced/DK-specific by design (holding, ASK, folkepension,
 * ratepension/livrente, part-time, family fund, the "No Barma" stress test, the audit panel, …).
 * This is a DEFAULT-DENY adapter: only checks whose stable `id` is on the allowlist may surface,
 * each rewritten to fresh public Danish; everything else is dropped. We match on the stable `id`,
 * not the title text. As an extra guard (mirroring §4.4's filter rule) any check whose id/title/
 * detail references advanced/DK/internal vocabulary is hard-blocked, and the leak guard runs on the
 * copy we author. For v1 the allowlist is exactly one entry: `planned-over-cashflow`.
 */
import type { SanityCheck } from "../types";
import type { PublicWarning } from "./types";
import { containsForbiddenTerm } from "./safety";

/** Advanced/DK/internal vocabulary that hard-blocks a source check regardless of allowlisting. */
const BLOCK_RE =
  /folkepension|holding|barma|\bask\b|aktiesparekonto|ratepension|livrente|livsvarig|deltid|familiefond|\bexit\b|audit|stress-?test/i;

/** Allowlist a check by stable `id` and rewrite it to fresh public Danish, or `null` to drop it. */
function classify(check: SanityCheck): PublicWarning | null {
  const blob = `${check.id} ${check.title} ${check.detail ?? ""}`;
  if (BLOCK_RE.test(blob)) return null; // hard-block advanced/DK/internal vocabulary

  if (check.id === "planned-over-cashflow") {
    const m = check.title.match(/(\d+)\s*år/i);
    const years = m ? m[1] : null;
    return {
      id: check.id,
      text: years
        ? `Du forsøger at spare mere op, end din økonomi tillader i ${years} år. Resultatet bruger det, der reelt er plads til.`
        : "Du forsøger at spare mere op, end din økonomi tillader. Resultatet bruger det, der reelt er plads til.",
    };
  }

  return null; // default-deny: every other check is dropped
}

/** Filter + translate raw `sanityChecks()` output into public-safe Danish cautions. */
export function adaptWarnings(checks: SanityCheck[]): PublicWarning[] {
  const out: PublicWarning[] = [];
  for (const c of checks) {
    const w = classify(c);
    if (w && !containsForbiddenTerm(w.text)) out.push(w);
  }
  return out;
}
