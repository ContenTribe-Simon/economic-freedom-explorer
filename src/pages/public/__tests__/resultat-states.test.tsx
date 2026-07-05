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
    // Depletion marker in the chart aria — and since this plan HAS a real freedom point
    // (the card shows it), the chart and aria must agree with it, not deny it.
    const aria = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(aria).toContain(`Pengene slipper op ved alder ${r.bottleneck.firstShortfallAge}`);
    expect(r.earliestSustainableStopAge).not.toBeNull();
    expect(aria).toContain(`Frihedspunktet, hvor pengene rækker hele vejen, er ved alder ${r.earliestSustainableStopAge}`);
    expect(aria).not.toContain("ikke et bæredygtigt");
    // The sunrise marker itself renders on the chart at the freedom age.
    expect(screen.getByText(`Frihedspunkt ${r.earliestSustainableStopAge}`)).toBeTruthy();
  });

  it("on track below the engine's search floor: the headline never claims 'tidligst' above a working plan", () => {
    // The engine's FI search has a floor of age 40, so a rich plan stopping at 38 is on track
    // while the KPI reports earliest 40 — the headline must show the working plan age, not a
    // later "earliest" (verified against the real pipeline).
    const rich38: SimplePublicInputs = { ...DEFAULT_SIMPLE_INPUTS, currentInvestments: 10_000_000, desiredStopAge: 38 };
    const r = computePublicResult(rich38);
    expect(r.status.kind).toBe("on_track");
    expect(r.earliestSustainableStopAge).toBe(40); // the search-floor artifact this guards against
    renderWith(rich38);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("alder 38");
  });

  it("on track with a plan beyond the FI search window: no 'tidligst' claim, plan reported honestly", () => {
    // The engine's earliest-FI search stops at min(lifeExpectancy, 75). A plan at 82 that holds
    // (verified through the real pipeline: on_track, earliest null) must NOT be rewritten to 75
    // (the plan is the user's) and must NOT claim "tidligst" — the earliest is unknowable.
    const late82: SimplePublicInputs = {
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
    };
    const r = computePublicResult(late82);
    expect(r.status.kind).toBe("on_track");
    expect(r.earliestSustainableStopAge).toBeNull();
    expect(r.desiredStopAge).toBe(82); // the plan survives sanitization untouched
    renderWith(late82);
    const h1 = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    expect(h1).toContain("alder 82");
    expect(h1).not.toContain("tidligst");
    expect(screen.getByText("din plan holder hele vejen")).toBeTruthy();
    const aria = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(aria).toContain("Din plan holder ved alder 82");
    expect(aria).not.toContain("tidligst");
  });

  it("off track with NO sustainable stop age: marker omitted and aria says so", () => {
    const noFreedom: SimplePublicInputs = {
      ...DEFAULT_SIMPLE_INPUTS,
      monthlySpending: 60_000,
      monthlySavings: 0,
      currentInvestments: 0,
      pensionBalance: 0,
    };
    const r = computePublicResult(noFreedom);
    expect(r.status.kind).toBe("off_track");
    expect(r.earliestSustainableStopAge).toBeNull();
    renderWith(noFreedom);
    const aria = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(aria).toContain("Der er ikke et bæredygtigt tidligt frihedspunkt");
    expect(screen.queryByText(/^Frihedspunkt \d+$/)).toBeNull();
    expect(screen.getByText("Ikke fundet")).toBeTruthy();
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

  it("renders the required §4.2 horizon anchors: pension-access and end-of-horizon capital", () => {
    // On track: both anchors present with the adapter's exact figures.
    const on = computePublicResult(ON_TRACK);
    const { unmount: u1 } = renderWith(ON_TRACK);
    expect(on.capitalAtPensionAccessAge).not.toBeNull();
    const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr`;
    expect(screen.getByText("Når pensionen bliver tilgængelig")).toBeTruthy();
    expect(screen.getByText(kr(on.capitalAtPensionAccessAge!))).toBeTruthy();
    expect(screen.getByText("Ved planens slutning")).toBeTruthy();
    expect(screen.getByText(`formue ved alder ${on.lifeExpectancy}`)).toBeTruthy();
    u1();

    // Off track: both anchors present too.
    const { unmount: u2 } = renderWith(OFF_TRACK);
    expect(screen.getByText("Når pensionen bliver tilgængelig")).toBeTruthy();
    expect(screen.getByText("Ved planens slutning")).toBeTruthy();
    u2();

    // Tight: the goal card IS the end-of-horizon anchor — exactly one, no duplicate.
    const { unmount: u3 } = renderWith(TIGHT);
    expect(screen.getAllByText("Ved planens slutning")).toHaveLength(1);
    expect(screen.getByText("Når pensionen bliver tilgængelig")).toBeTruthy();
    u3();

    // Out of horizon: pensionAccessAge beyond the plan end -> adapter yields null -> card omitted.
    const outOfHorizon = { ...DEFAULT_SIMPLE_INPUTS, lifeExpectancy: 75, pensionAccessAge: 80 };
    expect(computePublicResult(outOfHorizon).capitalAtPensionAccessAge).toBeNull();
    const { unmount: u4 } = renderWith(outOfHorizon);
    expect(screen.queryByText("Når pensionen bliver tilgængelig")).toBeNull();
    u4();
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
