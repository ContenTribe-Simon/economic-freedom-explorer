import { DEFAULT_SIMPLE_INPUTS, type SimplePublicInputs } from "@/lib/finance/public";

/**
 * The single sanitizer for the public SimplePublicInputs surface.
 *
 * Every write path into the public input state goes through this — the form's onChange (via
 * usePublicStore.setInputs), share-link decoding, loading a saved calculation, and localStorage
 * rehydration — so no path can produce a value outside the spec §4.1 ranges or an inconsistent
 * cross-field state. Two invariants matter beyond simple min/max:
 *
 *  - lifeExpectancy > currentAge (>= currentAge + 1). Violating it yields ZERO projected
 *    YearRows and crashes deriveKPIs on the Result screen (Codex P1). Enforced both when the
 *    horizon itself changes and when currentAge moves out from under a previously valid value.
 *  - currentAge <= desiredStopAge <= lifeExpectancy (the spec's own range for the stop age).
 *    Not a crash, but keeps the stored plan coherent with the horizon.
 *
 * Money fields clamp to [0, spec max] — native `min={0}` on a number input is cosmetic only and
 * never blocks negative values (Codex P2); negatives would violate the engine's
 * no-negative-asset-buckets invariant at the input boundary.
 */

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Clamp arbitrary input data into a valid SimplePublicInputs (spec §4.1 ranges + cross-field rules). */
export function sanitizeSimpleInputs(raw: Partial<Record<keyof SimplePublicInputs, unknown>>): SimplePublicInputs {
  const d = DEFAULT_SIMPLE_INPUTS;
  const currentAge = Math.round(num(raw.currentAge, d.currentAge, 18, 75));
  const lifeExpectancy = Math.round(num(raw.lifeExpectancy, d.lifeExpectancy, currentAge + 1, 110));
  const out: SimplePublicInputs = {
    currentAge,
    lifeExpectancy,
    annualIncome: num(raw.annualIncome, d.annualIncome, 0, 5_000_000),
    monthlySpending: num(raw.monthlySpending, d.monthlySpending, 0, 200_000),
    currentInvestments: num(raw.currentInvestments, d.currentInvestments, 0, 50_000_000),
    monthlySavings: num(raw.monthlySavings, d.monthlySavings, 0, 500_000),
    pensionBalance: num(raw.pensionBalance, d.pensionBalance, 0, 50_000_000),
    pensionAccessAge: Math.round(num(raw.pensionAccessAge, d.pensionAccessAge, 50, 80)),
    expectedRealReturn: num(raw.expectedRealReturn, d.expectedRealReturn, 0, 0.1),
    // The stop-age ceiling is the ENGINE's FI-search ceiling, not the raw horizon: the
    // earliest-sustainable-stop-age KPI only searches candidate stop ages up to
    // min(lifeExpectancy, 75) (findEarliestSustainableStopAge), so accepting a later desired
    // stop age would make the Frihedspunkt headline understate for stop ages 76+. Keep the
    // public range aligned with what the engine can actually answer; if Phase 7 extends the
    // engine's search window, lift this cap with it.
    desiredStopAge: Math.round(num(raw.desiredStopAge, d.desiredStopAge, currentAge, Math.min(lifeExpectancy, 75))),
  };
  const goal = num(raw.fiTargetMinNetWorth, 0, 0, 50_000_000);
  if (goal > 0) out.fiTargetMinNetWorth = goal;
  return out;
}
