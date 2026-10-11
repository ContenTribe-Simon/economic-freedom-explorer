/**
 * Shared public copy (Phase 12 C/D, PR 3). The single global disclaimer lives here once, so every
 * public screen and every test reads the same string. Canonical source:
 * docs/public-mvp-spec-and-data-contract-v1.md ("Disclaimer (single, global)"). Changing it is a
 * copy decision, never a refactor.
 */
export const PUBLIC_DISCLAIMER =
  "En forenklet beregning ud fra dine egne tal og antagelser. Tag tallene som et kvalificeret billede, ikke en garanti, og ikke som økonomisk rådgivning.";

/** The real-terms note that accompanies the disclaimer on the calculation screens. */
export const REAL_TERMS_NOTE = "Alle beløb er i nutidskroner.";
