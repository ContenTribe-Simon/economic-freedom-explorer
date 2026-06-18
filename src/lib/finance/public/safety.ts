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
] as const;

const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN_PUBLIC_TERMS.join("|")})`, "i");

/** True if `text` references any advanced / DK / internal concept. */
export function containsForbiddenTerm(text: string): boolean {
  return FORBIDDEN_RE.test(text);
}
