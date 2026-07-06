/**
 * Public-safe vocabulary guard.
 *
 * The public surface must never expose advanced or DK-personal concepts. This list mirrors the
 * data contract §4.4 / §4.5 filter rule. It is used by the unit tests as a leak tripwire over
 * every public string the adapters produce; the adapters themselves are default-deny, so no raw
 * engine text is ever passed through.
 */
export const FORBIDDEN_PUBLIC_TERMS = [
  "holding",
  "ask",
  "aktiesparekonto",
  "depotskat",
  "depottax",
  "depot",
  "folkepension",
  "ratepension",
  "livrente",
  "livsvarig",
  "deltid",
  "familiefond",
  "barma",
  "koncentration",
  "country",
  // Danish sibling of "country": the advanced app's own name for the feature ("Landeanalyse"
  // slipped past the guard as a door TITLE in Codex round 2 because only the English term was
  // listed). Deliberately the full compound, NOT a "land"/"lande" prefix: the guard regex
  // anchors only the start of a word, so a prefix entry would also match ordinary Danish
  // words that merely begin with those letters — e.g. "lander" (to land/arrive), which
  // legitimate public copy uses ("så du lander direkte derinde"). The trade-off: other
  // country compounds ("landesammenligning") are NOT caught; see the door-copy test's
  // stricter whole-word regex and docs/backlog-public-polish-v1.md for the follow-up.
  "landeanalyse",
] as const;

const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN_PUBLIC_TERMS.join("|")})`, "i");

/** True if `text` references any advanced / DK / internal concept. */
export function containsForbiddenTerm(text: string): boolean {
  return FORBIDDEN_RE.test(text);
}
