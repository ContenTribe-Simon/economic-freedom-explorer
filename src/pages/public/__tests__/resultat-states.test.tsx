/**
 * Result screen — three states against REAL adapter output.
 *
 * Each fixture is a full SimplePublicInputs set run through the real `computePublicResult`
 * pipeline (engine → public adapter); the tests first pin that the fixture genuinely produces
 * the intended `status.kind`, then render the actual <Resultat/> screen from that state and
 * assert the state-specific layout and copy. No mocked PublicResult objects.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Resultat from "../Resultat";
import { usePublicStore } from "@/store/publicStore";
import { computePublicResult, DEFAULT_SIMPLE_INPUTS, type SimplePublicInputs } from "@/lib/finance/public";

/**
 * On track: the default persona with a later stop age. (Notable: the default persona ITSELF is
 * off_track through the real pipeline — money lasts to 86 of 90 — so stop age 65 makes the
 * on-track fixture: earliest sustainable stop 62, three years before the plan.)
 */
const ON_TRACK: SimplePublicInputs = { ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 65 };

/** Tight: the plan holds the whole horizon but ends under a high FI target. */
const TIGHT: SimplePublicInputs = {
  ...DEFAULT_SIMPLE_INPUTS,
  desiredStopAge: 65,
  monthlySavings: 12_000,
  fiTargetMinNetWorth: 50_000_000,
};

/**
 * Off track: the default persona as-is — through the real pipeline the money runs out at 86,
 * four years before the 90-year horizon (a realistic after-stop depletion, like the reference
 * screen's fixture, not a degenerate spending-exceeds-income case).
 */
const OFF_TRACK: SimplePublicInputs = { ...DEFAULT_SIMPLE_INPUTS };

function renderWith(inputs: SimplePublicInputs) {
  usePublicStore.setState({ inputs });
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={["/resultat"]}>
        <Resultat />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  usePublicStore.setState({ inputs: { ...DEFAULT_SIMPLE_INPUTS }, saved: [] });
});

describe("Result screen states (real PublicResult data)", () => {
  it("fixtures genuinely produce the three status kinds through the real pipeline", () => {
    expect(computePublicResult(ON_TRACK).status.kind).toBe("on_track");
    expect(computePublicResult(TIGHT).status.kind).toBe("tight");
    expect(computePublicResult(OFF_TRACK).status.kind).toBe("off_track");
  });

  it("on track: badge, freedom headline, no-bottleneck card, freedom card", () => {
    const r = computePublicResult(ON_TRACK);
    renderWith(ON_TRACK);
    expect(screen.getByText("På sporet")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      `alder ${r.earliestSustainableStopAge}`,
    );
    expect(screen.getByText("Ingen fundet")).toBeTruthy();
    expect(screen.getByText(`pengene rækker hele vejen til ${r.lifeExpectancy}`)).toBeTruthy();
    // Chart present with freedom marker label
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Frihedspunktet");
    // Disclaimer verbatim
    expect(
      screen.getByText(/En forenklet beregning ud fra dine egne tal og antagelser\. Tag tallene som et kvalificeret billede, ikke en garanti, og ikke som økonomisk rådgivning\./),
    ).toBeTruthy();
  });

  it("tight: badge, 'men det er stramt' headline, end-of-plan card vs the goal", () => {
    const r = computePublicResult(TIGHT);
    renderWith(TIGHT);
    expect(screen.getByText("Stramt")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("men det er stramt");
    expect(screen.getByText("Ved planens slutning")).toBeTruthy();
    expect(screen.getByText(/under dit mål på 50\.000\.000 kr/)).toBeTruthy();
    // D4: a publicly missed plan reads "Lav robusthed" (cap 39), never "Middel".
    expect(r.robustness.score).toBeLessThanOrEqual(39);
    expect(screen.getByText("Lav robusthed")).toBeTruthy();
  });

  it("off track: badge, money-lasts headline, bottleneck card with the exact monthly gap", () => {
    const r = computePublicResult(OFF_TRACK);
    renderWith(OFF_TRACK);
    expect(screen.getByText("Ikke på sporet")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(`alder ${r.moneyLastsToAge}`);
    if (r.bottleneck.kind !== "shortfall") throw new Error("fixture must have a shortfall bottleneck");
    const gap = `${Math.round(r.bottleneck.monthlyGap).toLocaleString("da-DK")} kr`;
    expect(screen.getByText(new RegExp(`mangler du ${gap.replace(/\./g, "\\.")} om måneden`))).toBeTruthy();
    // Depletion marker in the chart aria, no freedom marker claim
    const aria = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(aria).toContain(`Pengene slipper op ved alder ${r.bottleneck.firstShortfallAge}`);
    expect(aria).toContain("ikke et bæredygtigt tidligt frihedspunkt");
  });

  it("off track suppresses positive 'helps' drivers on screen (display decision D1)", () => {
    const r = computePublicResult(OFF_TRACK);
    renderWith(OFF_TRACK);
    // The adapter may legitimately emit helps-drivers; the screen must not show them off-track.
    for (const d of r.drivers) {
      if (d.direction === "helps") {
        expect(screen.queryByText(d.text)).toBeNull();
      } else {
        expect(screen.getByText(d.text)).toBeTruthy();
      }
    }
  });

  it("no hedging or em dashes in rendered copy (copy rule)", () => {
    for (const fixture of [ON_TRACK, TIGHT, OFF_TRACK]) {
      const { container, unmount } = renderWith(fixture);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\bca\.\s/i);
      expect(text).not.toContain("—");
      unmount();
    }
  });
});
