import { DEFAULT_SIMPLE_INPUTS, type SimplePublicInputs } from "@/lib/finance/public";

/**
 * Share-link encoding for the public flow: the link CONTAINS the inputs ("Linket indeholder
 * dine tal"), so no backend, no accounts and no server-side state are involved — consistent
 * with the roadmap deferring share-infrastructure (Phase 11: "share link / accounts later").
 *
 * Format: base64url of the SimplePublicInputs JSON in a `d` query param on /resultat.
 * Decoding is defensive: unknown/garbage input returns null, every numeric field is clamped to
 * the spec §4.1 ranges, and cross-field rules (lifeExpectancy > currentAge, stop age within the
 * horizon) are enforced — a hostile link can only ever produce a valid input set.
 */

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Clamp arbitrary decoded data into a valid SimplePublicInputs (spec §4.1 ranges). */
function sanitize(raw: Record<string, unknown>): SimplePublicInputs {
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
    desiredStopAge: Math.round(num(raw.desiredStopAge, d.desiredStopAge, currentAge, lifeExpectancy)),
  };
  const goal = num(raw.fiTargetMinNetWorth, 0, 0, 50_000_000);
  if (goal > 0) out.fiTargetMinNetWorth = goal;
  return out;
}

/** Encode inputs for the share link's `d` param. */
export function encodeShareInputs(inputs: SimplePublicInputs): string {
  return b64urlEncode(JSON.stringify(inputs));
}

/** Decode + sanitize a share param. Returns null for anything unparsable. */
export function decodeShareInputs(param: string): SimplePublicInputs | null {
  try {
    const raw: unknown = JSON.parse(b64urlDecode(param));
    if (typeof raw !== "object" || raw === null) return null;
    return sanitize(raw as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** The absolute share URL for the current inputs. */
export function shareUrlFor(inputs: SimplePublicInputs): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/resultat?d=${encodeShareInputs(inputs)}`;
}
