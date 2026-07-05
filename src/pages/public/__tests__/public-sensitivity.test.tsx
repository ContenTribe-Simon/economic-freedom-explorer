/**
 * The 1-lever sensitivity helper (scope doc item 7): every sentence is backed by a REAL
 * perturbed pipeline run (computePublicResult with monthlySavings + 1.000), never an
 * approximation. Fixtures verified through the real pipeline; exact sentences pinned.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Resultat from "../Resultat";
import { usePublicStore } from "@/store/publicStore";
import { computePublicResult, DEFAULT_SIMPLE_INPUTS, type SimplePublicInputs } from "@/lib/finance/public";
import { sanitizeSimpleInputs } from "@/lib/publicInputs";
import { deriveSavingsSensitivity } from "@/lib/publicSensitivity";

function derive(raw: Record<string, unknown>) {
  const inputs = sanitizeSimpleInputs(raw as Partial<Record<keyof SimplePublicInputs, unknown>>);
  const baseline = computePublicResult(inputs);
  return { inputs, baseline, claim: deriveSavingsSensitivity(inputs, baseline) };
}

/** A plan with real cashflow room: the savings lever responds. */
const ROOM = { ...DEFAULT_SIMPLE_INPUTS, monthlySpending: 15_000, monthlySavings: 2_000, desiredStopAge: 67 };

describe("deriveSavingsSensitivity claims (real pipeline, exact sentences)", () => {
  it("off_track with room: money lasts longer, both exact ages claimed", () => {
    const { baseline, claim } = derive({ ...DEFAULT_SIMPLE_INPUTS, monthlySpending: 18_000, monthlySavings: 2_000 });
    expect(baseline.status.kind).toBe("off_track");
    expect(claim?.text).toBe("Hvis du sparer 1.000 kr mere op om måneden, rækker pengene til alder 75 i stedet for 71.");
  });

  it("off_track -> on_track flip: the flip is the claim", () => {
    const { baseline, claim } = derive({ ...DEFAULT_SIMPLE_INPUTS, monthlySpending: 17_500, monthlySavings: 2_000, desiredStopAge: 66 });
    expect(baseline.status.kind).toBe("off_track");
    expect(claim?.perturbed.status.kind).toBe("on_track");
    expect(claim?.text).toBe("Hvis du sparer 1.000 kr mere op om måneden, rækker pengene hele vejen til 90.");
  });

  it("on_track with room: earlier provable stop age, both exact ages claimed", () => {
    const { baseline, claim } = derive(ROOM);
    expect(baseline.status.kind).toBe("on_track");
    expect(baseline.earliestSustainableStopAge).toBe(67);
    expect(claim?.text).toBe("Hvis du sparer 1.000 kr mere op om måneden, kan du tidligst stoppe ved alder 64 i stedet for 67.");
  });

  it("tight with room: exact end-capital gain toward the goal", () => {
    const { baseline, claim } = derive({ ...ROOM, fiTargetMinNetWorth: 30_000_000 });
    expect(baseline.status.kind).toBe("tight");
    expect(claim?.text).toBe("Hvis du sparer 1.000 kr mere op om måneden, slutter du 2.005.822 kr tættere på dit mål.");
  });

  it("tight -> on_track flip: reaching the goal is the claim, with the user's exact goal", () => {
    const { baseline, claim } = derive({ ...ROOM, fiTargetMinNetWorth: 162_425 });
    expect(baseline.status.kind).toBe("tight");
    expect(claim?.perturbed.status.kind).toBe("on_track");
    expect(claim?.text).toBe("Hvis du sparer 1.000 kr mere op om måneden, når du dit mål på 162.425 kr.");
  });

  it("HIDDEN when the savings lever is inert (planned-over-cashflow warning owns that story)", () => {
    const { baseline, claim } = derive({ ...DEFAULT_SIMPLE_INPUTS });
    expect(baseline.warnings.some((w) => w.id === "planned-over-cashflow")).toBe(true);
    expect(claim).toBeNull();
  });

  it("HIDDEN when the +1.000 step does not fit inside the input range", () => {
    const { claim } = derive({ ...ROOM, monthlySavings: 499_500 });
    expect(claim).toBeNull();
  });

  it("REGRESSION: HIDDEN when the CURRENT savings fit but +1.000 crosses the cashflow ceiling", () => {
    // Codex: only the baseline was checked. Probed ceiling for this persona: 10.500 fits,
    // 11.000 is over — so baseline 10.500 is warning-free while the perturbed 11.500 carries
    // planned-over-cashflow, meaning the engine capped the applied step below 1.000 kr. Any
    // sentence claiming the full lever would describe a run the model never made.
    const raw = { ...ROOM, monthlySavings: 10_500 };
    const { baseline, claim } = derive(raw);
    expect(baseline.warnings.some((w) => w.id === "planned-over-cashflow")).toBe(false); // fits today
    const perturbed = computePublicResult(sanitizeSimpleInputs({ ...raw, monthlySavings: 11_500 }));
    expect(perturbed.warnings.some((w) => w.id === "planned-over-cashflow")).toBe(true); // +1.000 crosses
    expect(claim).toBeNull();
  });

  it("copy rules hold: no 'ca.', no em dashes, exact figures only", () => {
    for (const raw of [
      { ...DEFAULT_SIMPLE_INPUTS, monthlySpending: 18_000, monthlySavings: 2_000 },
      ROOM,
      { ...ROOM, fiTargetMinNetWorth: 30_000_000 },
    ]) {
      const { claim } = derive(raw);
      expect(claim).not.toBeNull();
      expect(claim!.text).not.toMatch(/\bca\.\s/i);
      expect(claim!.text).not.toContain("—");
    }
  });
});

describe("Result screen shows the helper (single-sourced from the derivation)", () => {
  function renderWith(raw: Record<string, unknown>) {
    const inputs = sanitizeSimpleInputs(raw as Partial<Record<keyof SimplePublicInputs, unknown>>);
    usePublicStore.setState({ inputs, saved: [] });
    return render(
      <TooltipProvider>
        <MemoryRouter initialEntries={["/resultat"]}>
          <Resultat />
        </MemoryRouter>
      </TooltipProvider>,
    );
  }

  it("renders the exact derived sentence when a claim exists", () => {
    const { claim } = derive(ROOM);
    expect(claim).not.toBeNull();
    const { unmount } = renderWith(ROOM);
    expect(screen.getByTestId("sensitivity-helper").textContent).toContain(claim!.text);
    unmount();
  });

  it("renders NO helper when the derivation returns null (saturated default persona)", () => {
    expect(derive({ ...DEFAULT_SIMPLE_INPUTS }).claim).toBeNull();
    const { unmount } = renderWith({ ...DEFAULT_SIMPLE_INPUTS });
    expect(screen.queryByTestId("sensitivity-helper")).toBeNull();
    unmount();
  });
});
