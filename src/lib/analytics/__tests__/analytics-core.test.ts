/**
 * PR 4 (Phase 12 C/D): consent record and the PostHog before_send filter. The filter test tries
 * hard to leak a fully populated public input set and asserts that nothing of it survives.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { CONSENT_KEY, CONSENT_VERSION, readConsent, writeConsent } from "../consent";
import { CUSTOM_EVENTS } from "../events";
import { maskDigits, scrubEvent, stripUrl } from "../scrub";
import { encodeShareInputs } from "@/lib/publicShare";
import type { SimplePublicInputs } from "@/lib/finance/public";

const INPUTS: SimplePublicInputs = {
  currentAge: 47, lifeExpectancy: 93, annualIncome: 612_345, monthlySpending: 23_456,
  currentInvestments: 345_678, monthlySavings: 9_876, pensionBalance: 456_789,
  pensionAccessAge: 68, expectedRealReturn: 0.043, desiredStopAge: 61, fiTargetMinNetWorth: 7_654_321,
};
const payload = encodeShareInputs(INPUTS);
const FIELD_NAMES = Object.keys(INPUTS);
const VALUES = [612345, 23456, 345678, 9876, 456789, 7654321].flatMap((n) => [
  String(n), n.toLocaleString("da-DK"), `${n.toLocaleString("da-DK")} kr`,
]);

function assertNoLeak(out: unknown) {
  const s = JSON.stringify(out);
  expect(s).not.toContain(payload);
  for (const f of FIELD_NAMES) expect(s).not.toContain(f);
  for (const v of VALUES) expect(s).not.toContain(v);
}

describe("consent record", () => {
  beforeEach(() => localStorage.clear());

  it("is undecided until a choice is written, then remembers it", () => {
    expect(readConsent()).toBe("undecided");
    writeConsent("granted", localStorage, new Date("2026-10-11T08:00:00Z"));
    expect(readConsent()).toBe("granted");
    expect(JSON.parse(localStorage.getItem(CONSENT_KEY)!)).toEqual({
      status: "granted", at: "2026-10-11T08:00:00.000Z", version: CONSENT_VERSION,
    });
    writeConsent("denied");
    expect(readConsent()).toBe("denied");
  });

  it("asks again after a policy version bump or a corrupt record", () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ status: "granted", at: "x", version: CONSENT_VERSION - 1 }));
    expect(readConsent()).toBe("undecided");
    localStorage.setItem(CONSENT_KEY, "{not json");
    expect(readConsent()).toBe("undecided");
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ status: "maybe", version: CONSENT_VERSION }));
    expect(readConsent()).toBe("undecided");
  });

  it("never throws when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(readConsent(blocked)).toBe("undecided");
    expect(() => writeConsent("denied", blocked)).not.toThrow();
  });
});

describe("scrubEvent", () => {
  it("drops every event that is not on the allowlist", () => {
    for (const e of ["$autocapture", "$rageclick", "$pageleave", "$snapshot", "survey shown", "$identify", "custom_leak"]) {
      expect(scrubEvent({ event: e, properties: { a: 1 } })).toBeNull();
    }
    expect(scrubEvent(null)).toBeNull();
  });

  it("strips query and fragment from every URL-like property of a page view", () => {
    const out = scrubEvent({
      event: "$pageview",
      properties: {
        $current_url: `https://frihedsmodel.dk/resultat#d=${payload}`,
        $referrer: `https://frihedsmodel.dk/resultat?d=${payload}`,
        $initial_referrer: `https://mail.example/?q=${INPUTS.annualIncome}`,
        $pathname: "/resultat",
        $browser: "Chrome",
      },
    });
    expect(out!.properties!.$current_url).toBe("https://frihedsmodel.dk/resultat");
    expect(out!.properties!.$referrer).toBe("https://frihedsmodel.dk/resultat");
    expect(out!.properties!.$browser).toBe("Chrome");
    assertNoLeak(out);
  });

  it.each(CUSTOM_EVENTS)("%s keeps only PostHog's own properties", (name) => {
    const out = scrubEvent({
      event: name,
      properties: { ...INPUTS, formatted: "612.345 kr", $current_url: `https://x.dk/gem-og-del#d=${payload}`, $lib: "web" },
      $set: { ...INPUTS },
      $set_once: { first: INPUTS.monthlySavings },
    });
    expect(Object.keys(out!.properties!).sort()).toEqual(["$current_url", "$lib"]);
    expect(out).not.toHaveProperty("$set");
    expect(out).not.toHaveProperty("$set_once");
    assertNoLeak(out);
  });

  it("masks numbers in exception messages", () => {
    const out = scrubEvent({
      event: "$exception",
      properties: {
        $exception_message: `Bad value 612345 for monthlySavings`,
        $exception_list: [{ type: "RangeError", value: "spending 23456 exceeds 9876" }],
      },
    });
    expect(out!.properties!.$exception_message).toBe("Bad value # for monthlySavings");
    expect((out!.properties!.$exception_list as Array<{ value: string; type: string }>)[0]).toEqual({ type: "RangeError", value: "spending # exceeds #" });
  });

  it("helpers", () => {
    expect(stripUrl("https://a.dk/x?y=1#z")).toBe("https://a.dk/x");
    expect(stripUrl("https://a.dk/x#d=1")).toBe("https://a.dk/x");
    expect(stripUrl("/start")).toBe("/start");
    expect(maskDigits("1.234.567 kr og 89")).toBe("#.#.# kr og #");
  });
});
