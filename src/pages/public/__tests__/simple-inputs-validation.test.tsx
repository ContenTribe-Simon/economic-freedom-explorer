/**
 * Simple Inputs validation — regression tests for two BUG CLASSES (Codex review, PR #23):
 *
 * Class 1 — cross-field range dependencies: fields whose valid range depends on another field's
 * CURRENT value. Audited pairs: currentAge↔lifeExpectancy (crash when violated: zero YearRows →
 * deriveKPIs dereference), currentAge/lifeExpectancy↔desiredStopAge (spec §4.1 range
 * currentAge–lifeExpectancy). pensionAccessAge is deliberately fixed-range (50–80): out-of-horizon
 * access ages are handled by the adapter (card omitted), no crash path.
 *
 * Class 2 — unclamped numeric writes: `min={0}` on a native number input is cosmetic (marks
 * :invalid, never blocks), so every write path must clamp in code. All writes go through the
 * store's sanitizer (setInputs / replaceInputs / loadCalculation / persist-rehydrate / share
 * decode), plus the form clamps negatives in its own onChange.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import SimpleInputs from "../SimpleInputs";
import { usePublicStore } from "@/store/publicStore";
import { computePublicResult, DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";
import { sanitizeSimpleInputs } from "@/lib/publicInputs";
import { decodeShareInputs, encodeShareInputs } from "@/lib/publicShare";

const store = () => usePublicStore.getState();

beforeEach(() => {
  usePublicStore.setState({ inputs: { ...DEFAULT_SIMPLE_INPUTS }, saved: [] });
});

describe("class 1: cross-field range dependencies", () => {
  it("REGRESSION (P1 crash): currentAge past lifeExpectancy can no longer reach the pipeline", () => {
    // The raw invalid combination genuinely crashes the pipeline — pin the hazard itself…
    expect(() => computePublicResult({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 75, lifeExpectancy: 70 })).toThrow();
    // …and the store now makes it unrepresentable, whichever side moves.
    store().replaceInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 75, lifeExpectancy: 70 });
    expect(store().inputs.lifeExpectancy).toBeGreaterThanOrEqual(store().inputs.currentAge + 1);
    const result = computePublicResult(store().inputs);
    expect(result.netWorthByAge.length).toBeGreaterThan(0);
  });

  it("lifeExpectancy clamps against currentAge when the horizon itself changes", () => {
    store().setInputs({ currentAge: 65 });
    store().setInputs({ lifeExpectancy: 60 });
    expect(store().inputs.lifeExpectancy).toBe(66);
  });

  it("lifeExpectancy re-clamps when currentAge moves out from under a previously valid value", () => {
    store().setInputs({ lifeExpectancy: 70 }); // valid while currentAge is 35
    expect(store().inputs.lifeExpectancy).toBe(70);
    store().setInputs({ currentAge: 75 }); // horizon must follow
    expect(store().inputs.currentAge).toBe(75);
    expect(store().inputs.lifeExpectancy).toBeGreaterThanOrEqual(76);
    expect(() => computePublicResult(store().inputs)).not.toThrow();
  });

  it("desiredStopAge stays within [currentAge, lifeExpectancy] from both directions", () => {
    store().setInputs({ desiredStopAge: 40 }); // valid while currentAge is 35
    store().setInputs({ currentAge: 70 }); // stop age must follow the current age up
    expect(store().inputs.desiredStopAge).toBeGreaterThanOrEqual(70);
    store().replaceInputs({ ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 100 }); // above the horizon
    expect(store().inputs.desiredStopAge).toBeLessThanOrEqual(store().inputs.lifeExpectancy);
  });

  it("the two age sliders expose the dependent minimum to assistive tech", () => {
    usePublicStore.setState({ inputs: sanitizeSimpleInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 75 }) });
    render(
      <TooltipProvider>
        <MemoryRouter>
          <SimpleInputs />
        </MemoryRouter>
      </TooltipProvider>,
    );
    const mins = screen.getAllByRole("slider").map((el) => el.getAttribute("aria-valuemin"));
    expect(mins).toContain("76"); // Planlæg til alder: min = currentAge + 1
    expect(mins).toContain("75"); // Ønsket stop-alder: min = currentAge
  });
});

describe("class 2: every numeric write is clamped in code (not just min= attributes)", () => {
  // Field-by-field audit table: [field, negative probe, expected min, over-max probe, expected max]
  const MONEY_FIELDS = [
    ["annualIncome", -5_000, 0, 99_000_000, 5_000_000],
    ["monthlySpending", -1, 0, 999_999, 200_000],
    ["currentInvestments", -200_000, 0, 90_000_000, 50_000_000],
    ["monthlySavings", -8_000, 0, 700_000, 500_000],
    ["pensionBalance", -300_000, 0, 90_000_000, 50_000_000],
  ] as const;

  it.each(MONEY_FIELDS)("%s clamps negatives and the spec §4.1 maximum", (field, neg, min, big, max) => {
    store().setInputs({ [field]: neg });
    expect(store().inputs[field]).toBe(min);
    store().setInputs({ [field]: big });
    expect(store().inputs[field]).toBe(max);
  });

  it("age and rate fields clamp to their spec ranges", () => {
    store().setInputs({ currentAge: -3 });
    expect(store().inputs.currentAge).toBe(18);
    store().setInputs({ currentAge: 120 });
    expect(store().inputs.currentAge).toBe(75);
    store().setInputs({ pensionAccessAge: 20 });
    expect(store().inputs.pensionAccessAge).toBe(50);
    store().setInputs({ pensionAccessAge: 95 });
    expect(store().inputs.pensionAccessAge).toBe(80);
    store().setInputs({ expectedRealReturn: -0.05 });
    expect(store().inputs.expectedRealReturn).toBe(0);
    store().setInputs({ expectedRealReturn: 0.5 });
    expect(store().inputs.expectedRealReturn).toBe(0.1);
  });

  it("a negative FI target is dropped, not stored", () => {
    store().setInputs({ fiTargetMinNetWorth: -1_000_000 });
    expect(store().inputs.fiTargetMinNetWorth).toBeUndefined();
    store().setInputs({ fiTargetMinNetWorth: 2_000_000 });
    expect(store().inputs.fiTargetMinNetWorth).toBe(2_000_000);
  });

  it("NaN never reaches the store (bad paste / cleared field)", () => {
    store().setInputs({ pensionBalance: Number.NaN });
    expect(Number.isFinite(store().inputs.pensionBalance)).toBe(true);
    store().setInputs({ currentAge: Number.POSITIVE_INFINITY });
    expect(store().inputs.currentAge).toBeLessThanOrEqual(75);
  });

  it("typing a negative amount into the form writes 0 to the store (onChange clamp)", () => {
    render(
      <TooltipProvider>
        <MemoryRouter>
          <SimpleInputs />
        </MemoryRouter>
      </TooltipProvider>,
    );
    fireEvent.change(screen.getByLabelText("Årlig indkomst før skat", { selector: "input" }), {
      target: { value: "-5000" },
    });
    expect(store().inputs.annualIncome).toBe(0);
    fireEvent.change(screen.getByLabelText("Pensionssaldo", { selector: "input" }), { target: { value: "-1" } });
    expect(store().inputs.pensionBalance).toBe(0);
  });

  it("loadCalculation sanitizes saved entries (legacy/hand-edited persistence)", () => {
    usePublicStore.setState({
      saved: [
        {
          id: "legacy",
          name: "Legacy",
          savedAt: 0,
          // deliberately invalid persisted data
          inputs: { ...DEFAULT_SIMPLE_INPUTS, currentAge: 75, lifeExpectancy: 70, pensionBalance: -5 },
        },
      ],
    });
    expect(store().loadCalculation("legacy")).toBe(true);
    expect(store().inputs.lifeExpectancy).toBeGreaterThanOrEqual(76);
    expect(store().inputs.pensionBalance).toBe(0);
    expect(() => computePublicResult(store().inputs)).not.toThrow();
  });

  it("REGRESSION: corrupted localStorage with action-shaped keys cannot overwrite store functions", async () => {
    localStorage.setItem(
      "frihedsmodel-public.v1",
      JSON.stringify({
        state: {
          // action-shaped junk that a naive spread-merge would copy over the live store
          setInputs: null,
          replaceInputs: "boom",
          saveCalculation: 42,
          junk: 123,
          inputs: { ...DEFAULT_SIMPLE_INPUTS, currentAge: 75, lifeExpectancy: 70, pensionBalance: -1 },
          saved: "not-an-array",
        },
        version: 0,
      }),
    );
    await usePublicStore.persist.rehydrate();
    const s = usePublicStore.getState();
    // The real functions survive…
    expect(typeof s.setInputs).toBe("function");
    expect(typeof s.replaceInputs).toBe("function");
    expect(typeof s.saveCalculation).toBe("function");
    expect(typeof s.removeCalculation).toBe("function");
    expect(typeof s.loadCalculation).toBe("function");
    // …unknown keys are not copied at all…
    expect("junk" in s).toBe(false);
    // …data fields are sanitized / defaulted…
    expect(s.inputs.lifeExpectancy).toBeGreaterThanOrEqual(s.inputs.currentAge + 1);
    expect(s.inputs.pensionBalance).toBe(0);
    expect(Array.isArray(s.saved)).toBe(true);
    // …and the next form interaction actually works.
    s.setInputs({ annualIncome: 123_456 });
    expect(usePublicStore.getState().inputs.annualIncome).toBe(123_456);
    localStorage.removeItem("frihedsmodel-public.v1");
  });

  it("REGRESSION: persisted saved entries are normalized per entry, never trusted as a whole array", async () => {
    localStorage.setItem(
      "frihedsmodel-public.v1",
      JSON.stringify({
        state: {
          inputs: { ...DEFAULT_SIMPLE_INPUTS },
          saved: [
            null, // legacy/hand-edited junk that crashed /gem-og-del on s.id/s.name
            "junk",
            42,
            { id: "no-inputs", name: "Uden tal", savedAt: 1 }, // nothing to load -> dropped
            { name: 7, savedAt: "yesterday", inputs: { ...DEFAULT_SIMPLE_INPUTS, pensionBalance: -5 } },
            { id: "dup", name: "Første", savedAt: 2, inputs: { ...DEFAULT_SIMPLE_INPUTS } },
            { id: "dup", name: "Anden", savedAt: 3, inputs: { ...DEFAULT_SIMPLE_INPUTS } },
          ],
        },
        version: 0,
      }),
    );
    await usePublicStore.persist.rehydrate();
    const saved = usePublicStore.getState().saved;
    // Junk and inputs-less entries are dropped; the three loadable ones survive.
    expect(saved).toHaveLength(3);
    for (const entry of saved) {
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.name).toBe("string");
      expect(Number.isFinite(entry.savedAt)).toBe(true);
      // Each entry's inputs went through the sanitizer and compute cleanly.
      expect(() => computePublicResult(entry.inputs)).not.toThrow();
    }
    // Field normalization: non-string name falls back, non-finite savedAt falls back,
    // invalid input values are clamped.
    expect(saved[0].name).toBe("Min plan");
    expect(saved[0].savedAt).toBe(0);
    expect(saved[0].inputs.pensionBalance).toBe(0);
    // Duplicate ids are made unique (React keys and removeCalculation stay per-entry).
    expect(new Set(saved.map((s) => s.id)).size).toBe(3);
    localStorage.removeItem("frihedsmodel-public.v1");
  });

  it("REGRESSION: stop-age bounds are the user's PLAN range, [currentAge, lifeExpectancy]", () => {
    // Low end: a valid early stop below the old hardcoded 40 floor is enterable and storable.
    store().setInputs({ currentAge: 35, desiredStopAge: 38 });
    expect(store().inputs.desiredStopAge).toBe(38);
    // High end: the stop age is the user's PLAN, which the projection engine accepts as-is —
    // it is NEVER silently rewritten. (A briefly-added cap at the engine's earliest-FI search
    // ceiling of 75 rewrote a stop-at-80 plan to 75 on every write path and was reverted; the
    // Result screen instead words its headline honestly when the earliest is unknowable.)
    store().replaceInputs({ ...DEFAULT_SIMPLE_INPUTS, lifeExpectancy: 90, desiredStopAge: 80 });
    expect(store().inputs.desiredStopAge).toBe(80);
    // The horizon itself is still the ceiling:
    store().replaceInputs({ ...DEFAULT_SIMPLE_INPUTS, lifeExpectancy: 70, desiredStopAge: 74 });
    expect(store().inputs.desiredStopAge).toBe(70);

    store().replaceInputs({ ...DEFAULT_SIMPLE_INPUTS, lifeExpectancy: 90, desiredStopAge: 80 });
    render(
      <TooltipProvider>
        <MemoryRouter>
          <SimpleInputs />
        </MemoryRouter>
      </TooltipProvider>,
    );
    const sliders = screen.getAllByRole("slider");
    const bounds = sliders.map((el) => [el.getAttribute("aria-valuemin"), el.getAttribute("aria-valuemax"), el.getAttribute("aria-valuenow")]);
    // Ønsket stop-alder: [currentAge, lifeExpectancy] with the loaded 80 rendered in-band.
    expect(bounds).toContainEqual(["35", "90", "80"]);
    // Planlæg til alder: [currentAge+1, 110] (spec max, not the old 105 cap).
    expect(bounds).toContainEqual(["36", "110", "90"]);
    // Pension tilgængelig fra alder: the spec band 50-80 (not the old 60-75).
    expect(bounds).toContainEqual(["50", "80", "67"]);
    // Forventet afkast: 0-10 % (spec max, not the old 8 % cap).
    expect(bounds).toContainEqual(["0", "10", "4"]);
  });

  it("share links cannot smuggle invalid values past the sanitizer", () => {
    expect(decodeShareInputs("%%%not-base64%%%")).toBeNull();
    const hostile = encodeShareInputs({
      ...DEFAULT_SIMPLE_INPUTS,
      currentAge: 75,
      lifeExpectancy: 20,
      currentInvestments: -1_000_000,
    });
    const decoded = decodeShareInputs(hostile);
    expect(decoded).not.toBeNull();
    expect(decoded!.lifeExpectancy).toBeGreaterThanOrEqual(76);
    expect(decoded!.currentInvestments).toBe(0);
    expect(() => computePublicResult(decoded!)).not.toThrow();
  });
});
