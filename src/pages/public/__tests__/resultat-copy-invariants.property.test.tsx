/**
 * Property-based copy invariants for the public Result screen (fast-check).
 *
 * Why this suite exists: several review rounds caught the same bug shape — a Danish sentence
 * claiming a number (an age, a kroner figure) that was false for SOME input, because the same
 * adapter value was independently re-derived or re-formatted in more than one rendered location
 * (headline, stat card, chart marker, aria-label) and one of them drifted. Fixture tests written
 * from the same mental model as the code kept passing. This suite generates inputs across the
 * whole §4.1 space, runs each through the REAL pipeline (sanitizer → computePublicResult →
 * rendered <Resultat/>), and asserts INVARIANTS between the rendered claims and the adapter's
 * raw output instead of fixed expected values.
 *
 * The `examples` list forces every historical Codex finding from PR #23 through the properties
 * on every run (including the tight 64-vs-65 clamp bug), so the state-combination coverage
 * assertions below can never flake on generator randomness.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import fc from "fast-check";
import { TooltipProvider } from "@/components/ui/tooltip";
import Resultat from "../Resultat";
import { usePublicStore } from "@/store/publicStore";
import { computePublicResult, DEFAULT_SIMPLE_INPUTS, type PublicResult, type SimplePublicInputs } from "@/lib/finance/public";
import { sanitizeSimpleInputs } from "@/lib/publicInputs";
import { formatKr, headlineStopAge } from "@/lib/publicFormat";
import { deriveSavingsSensitivity, SAVINGS_SENSITIVITY_STEP } from "@/lib/publicSensitivity";

// ---------------------------------------------------------------------------
// Generator: the reachable input space. Raw values span the §4.1 ranges (and a
// margin beyond, to include boundary clamping); the app's single sanitizer then
// enforces the cross-field rules, exactly as every real write path does.
// ---------------------------------------------------------------------------
const arbInputs: fc.Arbitrary<SimplePublicInputs> = fc
  .record({
    currentAge: fc.integer({ min: 18, max: 75 }),
    lifeExpectancy: fc.integer({ min: 18, max: 110 }),
    desiredStopAge: fc.integer({ min: 18, max: 110 }),
    annualIncome: fc.integer({ min: 0, max: 5_000_000 }),
    monthlySpending: fc.integer({ min: 0, max: 200_000 }),
    currentInvestments: fc.integer({ min: 0, max: 50_000_000 }),
    monthlySavings: fc.integer({ min: 0, max: 500_000 }),
    pensionBalance: fc.integer({ min: 0, max: 50_000_000 }),
    pensionAccessAge: fc.integer({ min: 50, max: 80 }),
    expectedRealReturn: fc.integer({ min: 0, max: 100 }).map((n) => n / 1000),
    fiTargetMinNetWorth: fc.option(fc.integer({ min: 1, max: 50_000_000 }), { nil: undefined }),
  })
  .map((raw) => sanitizeSimpleInputs(raw));

/**
 * CI counterexample (GitHub Actions run 28743960066 on main, fast-check seed -1890050878,
 * shrunk): tight with the goal-reaching earliest age (40) BELOW the plan (51). Zero income,
 * spending and savings; a 27 kr pension against a 130 kr goal. Stopping earlier ends ABOVE the
 * goal while the plan misses it, because forced taxed pension payouts make end wealth
 * path-dependent — "stop later = richer at the end" is NOT an engine invariant. This broke the
 * original status-blind headline invariant and exposed a real Result-vs-summary divergence,
 * both fixed via the shared status-aware headlineStopAge.
 */
const CI_TIGHT_EARLIEST_BELOW_PLAN: SimplePublicInputs = sanitizeSimpleInputs({
  currentAge: 18,
  lifeExpectancy: 51,
  annualIncome: 0,
  monthlySpending: 0,
  currentInvestments: 0,
  monthlySavings: 0,
  pensionBalance: 27,
  pensionAccessAge: 50,
  expectedRealReturn: 0.05,
  desiredStopAge: 51,
  fiTargetMinNetWorth: 130,
});

// Historical Codex findings from PR #23, forced through every property on every run.
const REGRESSION_EXAMPLES: SimplePublicInputs[] = [
  CI_TIGHT_EARLIEST_BELOW_PLAN,
  // tight, earliest 65 > plan 64: the clamp bug (card said 64, adapter said 65).
  sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 64, fiTargetMinNetWorth: 3_000_000 }),
  // tight, earliest null (search capped at 75): no "tidligst"/freedom-point claim allowed.
  sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 65, monthlySavings: 12_000, fiTargetMinNetWorth: 50_000_000 }),
  // on_track below the search floor: raw earliest 40 above the working plan 38.
  sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, currentInvestments: 10_000_000, desiredStopAge: 38 }),
  // on_track beyond the search ceiling: plan 82 holds, earliest null.
  sanitizeSimpleInputs({
    ...DEFAULT_SIMPLE_INPUTS,
    currentAge: 60,
    lifeExpectancy: 100,
    annualIncome: 800_000,
    monthlySpending: 25_000,
    currentInvestments: 100_000,
    monthlySavings: 0,
    pensionBalance: 8_000_000,
    pensionAccessAge: 80,
    desiredStopAge: 82,
  }),
  // off_track with a shortfall BEFORE the planned stop (current-budget copy).
  sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, monthlySpending: 40_000, desiredStopAge: 50, monthlySavings: 2_000 }),
  // off_track with NO sustainable stop age at all.
  sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, monthlySpending: 60_000, monthlySavings: 0, currentInvestments: 0, pensionBalance: 0 }),
  // off_track after the stop (the default persona) and plain on_track.
  sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS }),
  sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 65 }),
  // on_track where the earliest coincides exactly with the plan (verified: earliest 62).
  sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 62 }),
  // off_track failing AT the stop age with NO sustainable alternative (nothing is ever saved,
  // so every candidate stop age fails too — verified: shortfall 70, earliest null).
  sanitizeSimpleInputs({
    ...DEFAULT_SIMPLE_INPUTS,
    currentAge: 40,
    lifeExpectancy: 100,
    annualIncome: 1_200_000,
    monthlySpending: 50_000,
    monthlySavings: 0,
    currentInvestments: 0,
    pensionBalance: 0,
    desiredStopAge: 70,
  }),
];

// ---------------------------------------------------------------------------
// Rendering + claim extraction helpers
// ---------------------------------------------------------------------------
function renderResult(inputs: SimplePublicInputs) {
  usePublicStore.setState({ inputs, saved: [] });
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={["/resultat"]}>
        <Resultat />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

/** The Frihedspunkt stat card's value + sub texts (the card label is unique per screen). */
function freedomCard(container: HTMLElement): { value: string; sub: string } {
  const label = Array.from(container.querySelectorAll("div")).find((el) => el.textContent === "Frihedspunkt" && el.children.length === 0);
  if (!label || !label.parentElement) throw new Error("Frihedspunkt card not found");
  const [, value, sub] = Array.from(label.parentElement.children).map((c) => c.textContent ?? "");
  return { value, sub };
}

function chartAria(container: HTMLElement): string {
  return container.querySelector('svg[role="img"]')?.getAttribute("aria-label") ?? "";
}

/** The chart's own "Frihedspunkt {age}" marker text, or null when no marker is drawn. */
function chartMarkerAge(container: HTMLElement): number | null {
  const texts = Array.from(container.querySelectorAll("svg text")).map((t) => t.textContent ?? "");
  const marker = texts.find((t) => /^Frihedspunkt \d+$/.test(t));
  return marker ? Number(marker.replace("Frihedspunkt ", "")) : null;
}

/** State-combination key for coverage accounting. */
function comboKey(r: PublicResult): string {
  const e = r.earliestSustainableStopAge;
  const earliest = e == null ? "null" : e < r.desiredStopAge ? "beforePlan" : e === r.desiredStopAge ? "atPlan" : "afterPlan";
  const shortfall = r.bottleneck.kind !== "shortfall" ? "none" : r.bottleneck.firstShortfallAge < r.desiredStopAge ? "beforeStop" : "atOrAfterStop";
  return `${r.status.kind}|earliest:${earliest}|shortfall:${shortfall}`;
}

/**
 * Combinations the suite MUST exercise every run (guaranteed by REGRESSION_EXAMPLES, so this
 * assertion is deterministic; random cases explore further). A combination missing here fails
 * loudly instead of silently narrowing coverage.
 */
const REQUIRED_COMBOS = [
  "on_track|earliest:beforePlan|shortfall:none",
  "on_track|earliest:afterPlan|shortfall:none", // search-floor artifact (rich plan stopping at 38)
  "on_track|earliest:null|shortfall:none", // search-ceiling artifact (plan beyond 75)
  "tight|earliest:afterPlan|shortfall:none", // the 64-vs-65 clamp bug's combination
  "tight|earliest:beforePlan|shortfall:none", // the CI counterexample's combination (path-dependent payouts)
  "tight|earliest:null|shortfall:none",
  "on_track|earliest:atPlan|shortfall:none",
  "off_track|earliest:afterPlan|shortfall:atOrAfterStop",
  "off_track|earliest:null|shortfall:beforeStop",
  "off_track|earliest:null|shortfall:atOrAfterStop",
];
// NOT required although it sounds plausible: off_track|earliest:afterPlan|shortfall:beforeStop.
// The pre-stop trajectory is independent of the stop age (income runs until stop), so a
// shortfall BEFORE the stop age fails identically for every candidate stop age — the FI search
// then finds nothing and earliest is null. The coverage assertion surfaced this; documented
// here instead of silently dropped.

// ---------------------------------------------------------------------------
// The invariants
// ---------------------------------------------------------------------------
// Property runs render the full screen dozens of times; under a fully parallel suite one
// property can exceed Vitest's 5s default, so each gets an explicit generous timeout.
const PROPERTY_TIMEOUT = 90_000;

describe("Result screen copy invariants (property-based, real pipeline)", () => {
  it("adapter output is well-formed across the whole input space (no render)", () => {
    fc.assert(
      fc.property(arbInputs, (inputs) => {
        const r = computePublicResult(inputs);
        expect(["on_track", "tight", "off_track"]).toContain(r.status.kind);
        // Documented adapter semantic: off track ⟺ a shortfall exists.
        expect(r.status.kind === "off_track").toBe(r.bottleneck.kind === "shortfall");
        expect(r.moneyLastsToAge).toBeGreaterThanOrEqual(inputs.currentAge);
        expect(r.moneyLastsToAge).toBeLessThanOrEqual(inputs.lifeExpectancy);
        expect(r.netWorthByAge.length).toBeGreaterThan(0);
        // On-or-tight means the plan HOLDS: money lasts the whole horizon.
        if (r.status.kind !== "off_track") expect(r.moneyLastsToAge).toBe(inputs.lifeExpectancy);
      }),
      { numRuns: 250, examples: REGRESSION_EXAMPLES.map((e) => [e] as [SimplePublicInputs]) },
    );
  }, PROPERTY_TIMEOUT);

  it("every rendered age/kroner claim matches the adapter's raw output", () => {
    const seenCombos = new Set<string>();
    fc.assert(
      fc.property(arbInputs, (inputs) => {
        const r = computePublicResult(inputs);
        seenCombos.add(comboKey(r));
        const { container } = renderResult(inputs);
        try {
          const text = container.textContent ?? "";
          const aria = chartAria(container);
          const card = freedomCard(container);
          const marker = chartMarkerAge(container);
          const raw = r.earliestSustainableStopAge;
          const plan = r.desiredStopAge;

          // ---- Frihedspunkt card: the shown age is the RAW adapter age, or a documented
          // null/floor case — never any other derived age. ----
          const cardAge = /alder (\d+)/.exec(card.value) ? Number(/alder (\d+)/.exec(card.value)![1]) : null;
          if (cardAge != null) {
            const isRaw = cardAge === raw;
            // Search-floor correction: on track, plan < raw earliest, card shows the plan.
            const isFloorCase = r.status.kind === "on_track" && raw != null && plan < raw && cardAge === plan;
            // Null fallback: earliest unknowable, card names the user's own plan, claim-free sub.
            const isNullFallback =
              raw == null && cardAge === plan && (card.sub === "din valgte stop-alder" || card.sub === "din plan holder hele vejen");
            expect(isRaw || isFloorCase || isNullFallback).toBe(true);
          } else {
            // No age on the card: only the documented off-track "Ikke fundet" case.
            expect(card.value).toBe("Ikke fundet");
            expect(raw).toBeNull();
          }

          // ---- Chart marker and card must agree (the divergence class). The marker may be
          // legitimately absent (null earliest off track, or out of chart bounds). ----
          if (marker != null && cardAge != null) expect(marker).toBe(cardAge);

          // ---- "tidligst"/"ikke tidligere" claims require a known earliest that backs them. ----
          if (text.includes("tidligst") || aria.includes("tidligst")) {
            expect(raw).not.toBeNull();
          }
          if (text.includes("ikke tidligere")) {
            expect(raw).not.toBeNull();
            expect(cardAge).not.toBeNull();
            // The claim "not earlier than X with your numbers" must not contradict the raw age.
            expect(cardAge!).toBeLessThanOrEqual(raw!);
          }

          // ---- Aria freedom-point sentences carry the same age as the card. ----
          const ariaFreedom = /[Ff]rihedspunktet[^.]*ved alder (\d+)/.exec(aria);
          if (ariaFreedom && cardAge != null) expect(Number(ariaFreedom[1])).toBe(cardAge);

          // ---- Headline stop-age claims ("Du kan (tidligst) stoppe …") are the shared,
          // STATUS-AWARE stop age — identical to what the save/PDF summary derives. (The
          // original status-blind invariant expected min(earliest, plan) on tight results too;
          // the CI counterexample — tight with earliest 40 BELOW plan 51, reachable because
          // forced taxed pension payouts make end wealth path-dependent — showed the tight
          // headline must claim the plan, which is what the screen deliberately does.) ----
          const h1 = container.querySelector("h1")?.textContent ?? "";
          if (r.status.kind !== "off_track") {
            const claimed = /alder (\d+)/.exec(h1);
            expect(claimed).not.toBeNull();
            expect(Number(claimed![1])).toBe(headlineStopAge(r.status.kind, raw, plan));
          } else {
            // Off track: the headline age is where the money runs out.
            expect(h1).toContain(`alder ${r.moneyLastsToAge}`);
          }

          // ---- Kroner figures: exact adapter values, formatted once, present on screen. ----
          expect(text).toContain(formatKr(r.capitalAtStopAge));
          expect(text).toContain(`ved din planlagte stop-alder (${plan})`);
          expect(text).toContain(formatKr(r.capitalAtEndOfHorizon));
          // "under dit mål på X kr" must carry the user's own goal, exactly as entered.
          if (r.status.kind === "tight" && (inputs.fiTargetMinNetWorth ?? 0) > 0) {
            expect(text).toContain(`under dit mål på ${formatKr(inputs.fiTargetMinNetWorth!)}`);
          }
          if (r.capitalAtPensionAccessAge != null) {
            expect(text).toContain(formatKr(r.capitalAtPensionAccessAge));
          }
          if (r.bottleneck.kind === "shortfall") {
            expect(text).toContain(formatKr(r.bottleneck.monthlyGap));
            expect(text).toContain(`Alder ${r.bottleneck.firstShortfallAge}`);
          }

          // ---- Sensitivity helper: single-sourced from the derivation — the page shows
          // exactly the derived sentence, or nothing when the derivation declines. ----
          const sens = deriveSavingsSensitivity(inputs, r);
          if (sens != null) {
            expect(text).toContain(sens.text);
          } else {
            expect(text).not.toContain("Hvis du sparer 1.000 kr mere op om måneden");
          }

          // ---- Copy rules hold for EVERY generated input, not just fixtures. ----
          expect(text).not.toMatch(/\bca\.\s/i);
          expect(text).not.toContain("—");
          expect(text).toContain(
            "En forenklet beregning ud fra dine egne tal og antagelser. Tag tallene som et kvalificeret billede, ikke en garanti, og ikke som økonomisk rådgivning.",
          );
        } finally {
          cleanup();
        }
      }),
      { numRuns: 60, examples: REGRESSION_EXAMPLES.map((e) => [e] as [SimplePublicInputs]) },
    );

    // Coverage accounting: every known-reachable state combination must have been exercised.
    // (Deterministic: the REGRESSION_EXAMPLES alone cover the required set.)
    const missing = REQUIRED_COMBOS.filter((c) => !seenCombos.has(c));
    expect(missing, `state combinations not exercised: ${missing.join(", ")}`).toHaveLength(0);
    // Loud signal for NEW combinations the generator reached that nobody has pinned yet: they
    // ran through all invariants above, but deserve a fixture. Surface them in the test output.
    const unpinned = [...seenCombos].filter((c) => !REQUIRED_COMBOS.includes(c));
    if (unpinned.length > 0) {
       
      console.warn(`[copy-invariants] combinations exercised beyond the pinned set: ${unpinned.join(", ")}`);
    }
  }, PROPERTY_TIMEOUT);

  it("REGRESSION as property: tight results never clamp or invent the freedom-point age", () => {
    // Today's bug class, stated as a universal property instead of one fixture. A random input
    // is almost never tight, so tight inputs are CONSTRUCTED through the real pipeline: take a
    // plan without a goal that holds, and set the goal just above its actual end capital — the
    // result is then tight by definition (no shortfall, ends under the goal).
    const arbTightInputs = arbInputs
      .map((inputs) => {
        const base: SimplePublicInputs = { ...inputs };
        delete base.fiTargetMinNetWorth;
        const r0 = computePublicResult(base);
        if (r0.status.kind === "off_track") return null; // a shortfall stays off track, goal or not
        const goal = Math.round(r0.capitalAtEndOfHorizon) + 1;
        if (goal < 1 || goal > 50_000_000) return null; // outside the sanitizer's goal range
        return sanitizeSimpleInputs({ ...base, fiTargetMinNetWorth: goal });
      })
      .filter((x): x is SimplePublicInputs => x != null);

    fc.assert(
      fc.property(arbTightInputs, (inputs) => {
        const r = computePublicResult(inputs);
        fc.pre(r.status.kind === "tight");
        const { container } = renderResult(inputs);
        try {
          const card = freedomCard(container);
          if (r.earliestSustainableStopAge != null) {
            // The known (later) target-satisfying age is carried RAW by card and aria — the
            // clamp bug showed the plan age here (card said 64, adapter said 65).
            expect(card.value).toBe(`alder ${r.earliestSustainableStopAge}`);
            expect(chartAria(container)).toContain(`ved alder ${r.earliestSustainableStopAge}`);
          } else {
            // Unknowable earliest: the card names the user's own plan, claim-free.
            expect(card.value).toBe(`alder ${r.desiredStopAge}`);
            expect(card.sub).toBe("din valgte stop-alder");
            expect(container.textContent ?? "").not.toContain("tidligere");
          }
        } finally {
          cleanup();
        }
      }),
      {
        numRuns: 30,
        examples: [
          [sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 64, fiTargetMinNetWorth: 3_000_000 })],
          [sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 65, monthlySavings: 12_000, fiTargetMinNetWorth: 50_000_000 })],
          [CI_TIGHT_EARLIEST_BELOW_PLAN],
        ],
      },
    );
  }, PROPERTY_TIMEOUT);

  it("the sensitivity helper's claim is TRUE against an independent perturbed pipeline run", () => {
    // The scope doc's medium-risk flag: sensitivity must reuse the engine, not approximate it.
    // For every input, whatever sentence the helper produces is re-verified here against a
    // FRESH computePublicResult of the perturbed inputs — the claim can never drift from what
    // the engine actually says. When the helper declines (null), that must be for one of the
    // documented reasons, never because a squarely claimable improvement was dropped.
    const roomBase = { ...DEFAULT_SIMPLE_INPUTS, monthlySpending: 15_000, monthlySavings: 2_000, desiredStopAge: 67 };
    fc.assert(
      fc.property(arbInputs, (inputs) => {
        const b = computePublicResult(inputs);
        const s = deriveSavingsSensitivity(inputs, b);
        const saturated = b.warnings.some((w) => w.id === "planned-over-cashflow");
        const stepFits = inputs.monthlySavings + SAVINGS_SENSITIVITY_STEP <= 500_000;
        if (s == null) {
          if (!saturated && stepFits) {
            // Only an unclaimable movement may be hidden: the PERTURBED run crossing the
            // cashflow ceiling (the engine then applies less than the stated step — Codex
            // finding), a downgrade, a worsening, or an earlier-stop that would rest on an
            // unknowable earliest.
            const fresh = computePublicResult(
              sanitizeSimpleInputs({ ...inputs, monthlySavings: inputs.monthlySavings + SAVINGS_SENSITIVITY_STEP }),
            );
            if (fresh.warnings.some((w) => w.id === "planned-over-cashflow")) return;
            const bAge = headlineStopAge(b.status.kind, b.earliestSustainableStopAge, b.desiredStopAge);
            const fAge = headlineStopAge(fresh.status.kind, fresh.earliestSustainableStopAge, fresh.desiredStopAge);
            const coveredFlip =
              (b.status.kind === "off_track" && fresh.status.kind !== "off_track") ||
              (b.status.kind === "tight" && fresh.status.kind === "on_track");
            const weird =
              (fresh.status.kind !== b.status.kind && !coveredFlip) ||
              (b.status.kind === "off_track" && fresh.moneyLastsToAge < b.moneyLastsToAge) ||
              (b.status.kind === "on_track" &&
                fAge !== bAge &&
                !(b.earliestSustainableStopAge != null && fresh.earliestSustainableStopAge != null && fAge < bAge)) ||
              (b.status.kind === "on_track" &&
                fAge < bAge &&
                (b.earliestSustainableStopAge == null || fresh.earliestSustainableStopAge == null)) ||
              (b.status.kind === "tight" &&
                (Math.round(fresh.capitalAtEndOfHorizon - b.capitalAtEndOfHorizon) < 0 ||
                  (Math.round(fresh.capitalAtEndOfHorizon - b.capitalAtEndOfHorizon) === 0 && fAge !== bAge)));
            expect(weird, "helper hidden without a documented reason").toBe(true);
          }
          return;
        }

        const fresh = computePublicResult(
          sanitizeSimpleInputs({ ...inputs, monthlySavings: inputs.monthlySavings + SAVINGS_SENSITIVITY_STEP }),
        );
        const t = s.text;
        expect(t.startsWith("Hvis du sparer 1.000 kr mere op om måneden, ")).toBe(true);
        expect(t).not.toMatch(/\bca\.\s/i);
        expect(t).not.toContain("—");

        const instead = /alder (\d+) i stedet for (\d+)/.exec(t);
        if (t.includes("rækker pengene til alder")) {
          expect(Number(instead![1])).toBe(fresh.moneyLastsToAge);
          expect(Number(instead![2])).toBe(b.moneyLastsToAge);
          expect(fresh.moneyLastsToAge).toBeGreaterThan(b.moneyLastsToAge);
        } else if (t.includes("tidligst stoppe ved alder")) {
          expect(Number(instead![1])).toBe(headlineStopAge(fresh.status.kind, fresh.earliestSustainableStopAge, fresh.desiredStopAge));
          expect(Number(instead![2])).toBe(headlineStopAge(b.status.kind, b.earliestSustainableStopAge, b.desiredStopAge));
          expect(Number(instead![1])).toBeLessThan(Number(instead![2]));
        } else if (t.includes("hele vejen til")) {
          expect(b.status.kind).toBe("off_track");
          expect(fresh.moneyLastsToAge).toBe(fresh.lifeExpectancy);
          expect(fresh.status.kind).toBe(t.includes("under dit mål") ? "tight" : "on_track");
        } else if (t.includes("når du dit mål")) {
          expect(b.status.kind).toBe("tight");
          expect(fresh.status.kind).toBe("on_track");
          expect(t).toContain(formatKr(inputs.fiTargetMinNetWorth ?? 0));
        } else if (t.includes("tættere på dit mål")) {
          expect(b.status.kind).toBe("tight");
          expect(fresh.status.kind).toBe("tight");
          expect(t).toContain(formatKr(Math.round(fresh.capitalAtEndOfHorizon - b.capitalAtEndOfHorizon)));
        } else {
          expect(t).toContain("ændrer det ikke svaret her.");
          expect(fresh.status.kind).toBe(b.status.kind);
          if (b.status.kind === "off_track") {
            expect(fresh.moneyLastsToAge).toBe(b.moneyLastsToAge);
          } else {
            expect(headlineStopAge(fresh.status.kind, fresh.earliestSustainableStopAge, fresh.desiredStopAge)).toBe(
              headlineStopAge(b.status.kind, b.earliestSustainableStopAge, b.desiredStopAge),
            );
          }
        }
      }),
      {
        numRuns: 80,
        examples: [
          // Every claim branch exercised deterministically (fixtures verified in
          // public-sensitivity.test.tsx): off improvement, off->on flip, on earlier stop,
          // tight gain, tight->on flip, saturated default (hidden), step-does-not-fit (hidden).
          [sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, monthlySpending: 18_000, monthlySavings: 2_000 })],
          [sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, monthlySpending: 17_500, monthlySavings: 2_000, desiredStopAge: 66 })],
          [sanitizeSimpleInputs(roomBase)],
          [sanitizeSimpleInputs({ ...roomBase, fiTargetMinNetWorth: 30_000_000 })],
          [sanitizeSimpleInputs({ ...roomBase, fiTargetMinNetWorth: 162_425 })],
          [sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS })],
          [sanitizeSimpleInputs({ ...roomBase, monthlySavings: 499_500 })],
          // Baseline fits, +1.000 crosses the cashflow ceiling (hidden — Codex regression).
          [sanitizeSimpleInputs({ ...roomBase, monthlySavings: 10_500 })],
        ],
      },
    );
  }, PROPERTY_TIMEOUT);
});
