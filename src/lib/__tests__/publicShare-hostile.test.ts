/**
 * Phase 12 workstream B (security): hostile-condition tests for the public share-link decoder.
 *
 * The share link CONTAINS the inputs (base64url JSON in the `d` query param on /resultat) and
 * is opened by a RECIPIENT — so a crafted `d` is adversary-controlled input that lands directly
 * in another person's browser. `decodeShareInputs` is the whole trust boundary: it must never
 * throw, never pollute, and only ever yield a valid, sanitized SimplePublicInputs (or null).
 *
 * These cover the residue NOT already exercised by simple-inputs-validation.test.tsx (which pins
 * the sanitizer ranges and the malformed-base64 → null path): non-record payloads, prototype
 * pollution, pathological sizes, and the null-field coercion characterization.
 */
import { describe, expect, it } from "vitest";
import { decodeShareInputs, encodeShareInputs } from "@/lib/publicShare";
import { computePublicResult, DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";

/** Mirror of publicShare's private b64urlEncode, so tests can craft arbitrary raw JSON payloads. */
function b64url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("decodeShareInputs: non-record payloads are rejected (recipient inputs preserved)", () => {
  // A returned null means Resultat.tsx skips replaceInputs, so the recipient keeps their own
  // numbers — the correct outcome for anything that is not a real inputs object.
  it.each([
    ["empty array", "[]"],
    ["number array", "[1,2,3]"],
    ["bare number", "42"],
    ["bare string", '"haxx"'],
    ["bare boolean", "true"],
    ["JSON null", "null"],
  ])("rejects a %s payload with null", (_label, json) => {
    expect(decodeShareInputs(b64url(json))).toBeNull();
  });

  it("rejects malformed base64 and unparsable JSON with null, never throwing", () => {
    expect(decodeShareInputs("%%%not-base64%%%")).toBeNull();
    expect(decodeShareInputs(b64url("{unclosed"))).toBeNull();
    expect(decodeShareInputs("")).toBeNull();
    expect(decodeShareInputs(b64url("{"))).toBeNull();
  });
});

describe("decodeShareInputs: prototype pollution is impossible", () => {
  it("a __proto__/constructor payload does not pollute Object.prototype and yields clean defaults", () => {
    const before = ({} as Record<string, unknown>).polluted;
    const decoded = decodeShareInputs(
      b64url('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"currentAge":40}'),
    );
    // Object.prototype is untouched…
    expect(({} as Record<string, unknown>).polluted).toBe(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // …and the payload still decodes to a valid, whitelisted inputs object (only known keys copied).
    expect(decoded).not.toBeNull();
    expect(decoded!.currentAge).toBe(40);
    expect(Object.keys(decoded!)).not.toContain("__proto__");
    expect(Object.keys(decoded!)).not.toContain("constructor");
    expect(() => computePublicResult(decoded!)).not.toThrow();
  });
});

describe("decodeShareInputs: pathological sizes are handled, not hung or crashed", () => {
  it("a huge array payload is rejected as a non-record (no coercion to defaults)", () => {
    const huge = JSON.stringify(new Array(50_000).fill(0));
    expect(decodeShareInputs(b64url(huge))).toBeNull();
  });

  it("a record with tens of thousands of unknown keys drops them all and sanitizes to a valid set", () => {
    const obj: Record<string, unknown> = { currentAge: 50 };
    for (let i = 0; i < 20_000; i++) obj[`junk_${i}`] = i;
    const decoded = decodeShareInputs(b64url(JSON.stringify(obj)));
    expect(decoded).not.toBeNull();
    expect(decoded!.currentAge).toBe(50);
    // Only the known SimplePublicInputs keys survive — no unbounded key set reaches the engine.
    expect(Object.keys(decoded!).some((k) => k.startsWith("junk_"))).toBe(false);
    expect(() => computePublicResult(decoded!)).not.toThrow();
  });
});

describe("decodeShareInputs: characterization of edge coercions", () => {
  it("an empty object decodes to the full default input set", () => {
    const decoded = decodeShareInputs(b64url("{}"));
    expect(decoded).toEqual(DEFAULT_SIMPLE_INPUTS);
  });

  it("explicit null field values coerce to the field MINIMUM (Number(null)===0, then clamp), not the default", () => {
    // Documented, safe, bounded behavior: a hand-crafted null is treated as 0 and clamped into
    // range rather than falling back to the default — the result is always a valid input.
    const decoded = decodeShareInputs(b64url('{"currentAge":null,"annualIncome":null}'));
    expect(decoded).not.toBeNull();
    expect(decoded!.currentAge).toBe(18); // clamped to the age minimum, not the 35 default
    expect(decoded!.annualIncome).toBe(0); // clamped to the money minimum
    expect(() => computePublicResult(decoded!)).not.toThrow();
  });

  it("round-trips real inputs 1:1 through encode → decode", () => {
    const inputs = { ...DEFAULT_SIMPLE_INPUTS, currentAge: 42, annualIncome: 812_345, monthlySavings: 9_500 };
    expect(decodeShareInputs(encodeShareInputs(inputs))).toEqual(inputs);
  });
});
