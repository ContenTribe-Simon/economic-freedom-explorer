/**
 * PR 1 (Phase 12 C/D): share links carry the payload in the URL FRAGMENT, which browsers never
 * send to the server — so the host (access logs, link previews, Referer) never sees the inputs.
 * Legacy `?d=` links already in circulation must keep working.
 */
import { describe, expect, it } from "vitest";
import { decodeShareInputs, encodeShareInputs, readSharePayload, shareUrlFor } from "@/lib/publicShare";
import { DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";

const SHARED = { ...DEFAULT_SIMPLE_INPUTS, currentAge: 41, monthlySavings: 7_500 };

describe("shareUrlFor: payload lives only in the fragment", () => {
  it("has no query string and puts d= after #", () => {
    const url = new URL(shareUrlFor(SHARED), "https://example.test");
    expect(url.pathname).toBe("/resultat");
    expect(url.search).toBe("");
    expect(url.hash.startsWith("#d=")).toBe(true);
  });

  it("round-trips through readSharePayload + decodeShareInputs", () => {
    const url = new URL(shareUrlFor(SHARED), "https://example.test");
    const payload = readSharePayload(url.search, url.hash);
    expect(payload).not.toBeNull();
    expect(decodeShareInputs(payload!)).toMatchObject({ currentAge: 41, monthlySavings: 7_500 });
  });
});

describe("readSharePayload: source precedence", () => {
  const frag = encodeShareInputs({ ...SHARED, currentAge: 30 });
  const legacy = encodeShareInputs({ ...SHARED, currentAge: 50 });

  it("reads the fragment", () => {
    expect(readSharePayload("", `#d=${frag}`)).toBe(frag);
  });

  it("falls back to the legacy query param", () => {
    expect(readSharePayload(`?d=${legacy}`, "")).toBe(legacy);
  });

  it("prefers the fragment when both are present", () => {
    expect(readSharePayload(`?d=${legacy}`, `#d=${frag}`)).toBe(frag);
  });

  it("returns null when neither carries d", () => {
    expect(readSharePayload("", "")).toBeNull();
    expect(readSharePayload("?x=1", "#top")).toBeNull();
  });

  it("returns the raw value for hostile payloads; decoding stays the trust boundary", () => {
    expect(readSharePayload("", "#d=%%%not-base64%%%")).toBe("%%%not-base64%%%");
    expect(decodeShareInputs(readSharePayload("", "#d=%%%not-base64%%%")!)).toBeNull();
  });
});
