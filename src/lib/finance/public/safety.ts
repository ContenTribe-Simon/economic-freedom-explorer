/**
 * Public-safe vocabulary guard.
 *
 * The public surface must never expose advanced or DK-personal concepts. This list mirrors the
 * data contract §4.4 / §4.5 filter rule (the code here is canonical for the exact terms; keep
 * the doc in sync). It is used by the unit tests as a leak tripwire over every public string
 * the adapters produce, AND at runtime by the default-deny warning/driver adapters — so a
 * false positive silently drops legitimate public copy, and every term must be chosen with
 * ordinary Danish in mind.
 *
 * Term semantics (backlog items 4+5, 2026-07-08):
 * - Default: case-insensitive, word-start PREFIX match (`\bterm`) — inflections and compounds
 *   ("holdingselskab", "landeanalysen") are caught.
 * - `wholeWord`: also require a word boundary after the term. Used where a prefix would eat
 *   ordinary Danish: `lande` as a prefix would match "lander" (to arrive), which legitimate
 *   public copy uses — so the land family is listed as explicit whole-word inflections instead.
 * - `caseSensitive`: match this exact casing only. Exists for "FIRE", which as a
 *   case-insensitive term would ban Danish "fire" (the number four).
 */
export interface ForbiddenTerm {
  /** The banned word or phrase, matched from a word boundary. */
  term: string;
  /** Require a word boundary AFTER the term too (default: prefix match). */
  wholeWord?: boolean;
  /** Match only this exact casing (default: case-insensitive). */
  caseSensitive?: boolean;
}

export const FORBIDDEN_PUBLIC_TERMS: readonly ForbiddenTerm[] = [
  // Advanced / business capital
  { term: "holding" },
  { term: "barma" },
  { term: "koncentration" },
  { term: "concentration" },

  // DK account & tax types (and their EN siblings)
  { term: "ask" },
  { term: "aktiesparekonto" },
  { term: "depotskat" },
  { term: "depottax" },
  { term: "depot" },
  { term: "folkepension" },
  { term: "state pension" },
  { term: "ratepension" },
  { term: "livrente" },
  { term: "livsvarig" },
  { term: "annuity" },
  { term: "annuities" },

  // Advanced income modes
  { term: "deltid" },
  { term: "part-time" },
  { term: "parttime" },
  { term: "familiefond" },
  { term: "family fund" },

  // FIRE community jargon (case-sensitive: Danish "fire" is the number four)
  { term: "FIRE", caseSensitive: true, wholeWord: true },
  { term: "benchmark" }, // prefix on purpose: catches benchmarks/benchmarking too

  // Country analysis — the concept behind the advanced Lande page (CLAUDE.md §3 rule 7).
  // English, the DA feature name, DA compounds, and the whole-word inflection family of
  // "land". Whole-word (not a "land"/"lande" prefix) because a prefix would false-positive
  // on "lander"/"landing" in ordinary copy. "landet" (the country) also being the past
  // participle of "lande" (arrived) is an accepted trade-off — the copy voice does not use it.
  { term: "country" },
  { term: "landeanalyse" },
  { term: "landesammenligning" },
  { term: "landeoversigt" },
  { term: "udland" },
  { term: "land", wholeWord: true },
  { term: "lands", wholeWord: true },
  { term: "lande", wholeWord: true },
  { term: "landes", wholeWord: true },
  { term: "landet", wholeWord: true },
  { term: "landets", wholeWord: true },
  { term: "landene", wholeWord: true },
  { term: "landenes", wholeWord: true },
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(caseSensitive: boolean): RegExp | null {
  const parts = FORBIDDEN_PUBLIC_TERMS.filter((t) => Boolean(t.caseSensitive) === caseSensitive).map(
    (t) => `\\b${escapeRegExp(t.term)}${t.wholeWord ? "\\b" : ""}`,
  );
  return parts.length > 0 ? new RegExp(`(${parts.join("|")})`, caseSensitive ? "" : "i") : null;
}

const FORBIDDEN_RE_CI = compile(false);
const FORBIDDEN_RE_CS = compile(true);

/** True if `text` references any advanced / DK / internal concept. */
export function containsForbiddenTerm(text: string): boolean {
  return (FORBIDDEN_RE_CI?.test(text) ?? false) || (FORBIDDEN_RE_CS?.test(text) ?? false);
}
