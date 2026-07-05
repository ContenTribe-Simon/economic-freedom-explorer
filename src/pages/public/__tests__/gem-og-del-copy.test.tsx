/**
 * Save/Share copy button — the "Kopieret" success state must reflect reality (Codex P2):
 * when the Clipboard API is unavailable or writeText rejects, no success state may appear;
 * the share field is selected instead so the user can copy manually.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import GemOgDel from "../GemOgDel";
import { usePublicStore } from "@/store/publicStore";
import { computePublicResult, DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";

function renderScreen() {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={["/gem-og-del"]}>
        <GemOgDel />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

function mockClipboard(writeText: (() => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

beforeEach(() => {
  usePublicStore.setState({ inputs: { ...DEFAULT_SIMPLE_INPUTS }, saved: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("share-link copy state", () => {
  it("shows the success state only when the clipboard write actually succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Kopiér link" }));
    await waitFor(() => expect(screen.getByText("Linket er kopieret")).toBeTruthy());
    expect(writeText).toHaveBeenCalledOnce();
  });

  it("REGRESSION: a rejected clipboard write shows NO success state and selects the field", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    mockClipboard(writeText);
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Kopiér link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    // No lie: neither the status line nor the button's "Kopieret" state appears.
    expect(screen.queryByText("Linket er kopieret")).toBeNull();
    expect(screen.queryByRole("button", { name: "Kopieret" })).toBeNull();
    expect(screen.getByRole("button", { name: "Kopiér link" })).toBeTruthy();
    // The manual fallback: the share field is focused (and thereby selected).
    const field = screen.getByLabelText("Link til beregningen", { selector: "input" });
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it("REGRESSION: a missing Clipboard API behaves like a failure, not a success", async () => {
    mockClipboard(undefined);
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Kopiér link" }));
    const field = screen.getByLabelText("Link til beregningen", { selector: "input" });
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(screen.queryByText("Linket er kopieret")).toBeNull();
  });
});

describe("summary preview freedom age", () => {
  it("REGRESSION: the preview uses the corrected display age, matching the Result headline", () => {
    // Search-floor artifact: a rich plan stopping at 38 holds, but the raw KPI earliest is 40.
    // The Result page displays 38 (headlineStopAge); the save/PDF summary must say the
    // same, never the raw 40.
    const rich38 = { ...DEFAULT_SIMPLE_INPUTS, currentInvestments: 10_000_000, desiredStopAge: 38 };
    usePublicStore.setState({ inputs: rich38 });
    renderScreen();
    const previews = screen.getAllByText(/Du kan stoppe ved/);
    expect(previews.length).toBeGreaterThan(0);
    for (const p of previews) {
      expect(p.textContent).toContain("alder 38");
      expect(p.textContent).not.toContain("alder 40");
    }
  });

  it("REGRESSION (CI counterexample): a tight plan with a goal-reaching age BELOW the plan previews the PLAN", () => {
    // fast-check seed -1890050878 (GitHub Actions run on main after PR #24): tight, plan 51,
    // goal-reaching earliest 40 (forced taxed pension payouts make end wealth path-dependent).
    // The Result headline says "Du kan stoppe ved alder 51, men det er stramt"; a status-blind
    // min() in the preview printed "alder 40" here — the exact cross-surface divergence the
    // shared status-aware helper now prevents.
    const ciTight = {
      ...DEFAULT_SIMPLE_INPUTS,
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
    };
    // Pin the premise through the real pipeline: tight, with the earliest BELOW the plan.
    const r = computePublicResult(ciTight);
    expect(r.status.kind).toBe("tight");
    expect(r.earliestSustainableStopAge).toBe(40);
    expect(r.desiredStopAge).toBe(51);
    usePublicStore.setState({ inputs: ciTight });
    renderScreen();
    const previews = screen.getAllByText(/Du kan stoppe ved/);
    expect(previews.length).toBeGreaterThan(0);
    for (const p of previews) {
      expect(p.textContent).toContain("alder 51");
      expect(p.textContent).not.toContain("alder 40");
    }
  });
});

describe("printed summary (Hent som PDF)", () => {
  it("REGRESSION: a print-only summary delivers the answer and the entered numbers, with chrome print-hidden", () => {
    const custom = { ...DEFAULT_SIMPLE_INPUTS, annualIncome: 777_000, fiTargetMinNetWorth: 2_000_000 };
    usePublicStore.setState({ inputs: custom });
    const { container } = renderScreen();
    // The interactive page is hidden in print…
    const chrome = container.querySelector(".print\\:hidden");
    expect(chrome).not.toBeNull();
    expect(chrome!.textContent).toContain("Gem beregning");
    // …and a print-only summary exists (hidden on screen, shown by the print stylesheet)…
    const summary = container.querySelector("section.hidden.print\\:block");
    expect(summary).not.toBeNull();
    const text = summary!.textContent ?? "";
    // …with the answer, the key figures and the user's OWN numbers, exactly as entered:
    expect(text).toContain("Dit svar");
    expect(text).toContain("Nøgletal");
    expect(text).toContain("Dine tal");
    expect(text).toContain("777.000 kr"); // annual income as entered
    expect(text).toContain("2.000.000 kr"); // the FI target as entered
    expect(text).toContain("Formue når du stopper");
    expect(text).toContain("Ønsket stop-alder");
    // The canonical disclaimer, verbatim.
    expect(text).toContain(
      "En forenklet beregning ud fra dine egne tal og antagelser. Tag tallene som et kvalificeret billede, ikke en garanti, og ikke som økonomisk rådgivning.",
    );
    // No hedging, no em dashes in the printed copy either.
    expect(text).not.toMatch(/\bca\.\s/i);
    expect(text).not.toContain("—");
  });
});

describe("rehydrated saved list", () => {
  it("REGRESSION: legacy junk like saved:[null] cannot crash the save/share screen", async () => {
    // Codex P2: a hand-edited or legacy localStorage value such as saved:[null] used to pass
    // rehydration as-is and crash /gem-og-del on s.id/s.name, locking the user out of the
    // screen until storage was cleared.
    localStorage.setItem(
      "frihedsmodel-public.v1",
      JSON.stringify({
        state: {
          inputs: { ...DEFAULT_SIMPLE_INPUTS },
          saved: [null, { id: "ok", name: "Min rigtige plan", savedAt: 1_750_000_000_000, inputs: { ...DEFAULT_SIMPLE_INPUTS } }],
        },
        version: 0,
      }),
    );
    await usePublicStore.persist.rehydrate();
    renderScreen();
    // The screen renders, the junk entry is gone and the real one is intact.
    expect(screen.getByText("Gem beregning")).toBeTruthy();
    expect(screen.getByText("Min rigtige plan")).toBeTruthy();
    expect(usePublicStore.getState().saved).toHaveLength(1);
    localStorage.removeItem("frihedsmodel-public.v1");
  });
});

describe("the low-emphasis 'Avanceret' entry (data contract: The Advanced door, link only)", () => {
  it("exists in the public flow and links to an advanced route (through the door, never past it)", () => {
    const { container } = renderScreen();
    const link = screen.getByRole("link", { name: "Avanceret" });
    // Links to an advanced URL: the route sits behind the AdvancedGate, so on a fresh device
    // this lands on the door page (covered end-to-end in e2e/smoke.spec.ts).
    expect(link.getAttribute("href")).toBe("/dashboard");
    // Low-emphasis: part of the on-screen chrome (print-hidden), not the printed summary.
    const chrome = container.querySelector(".print\\:hidden");
    expect(chrome?.contains(link)).toBe(true);
    const printSummary = container.querySelector("section.hidden.print\\:block");
    expect(printSummary?.textContent ?? "").not.toContain("Avanceret");
  });
});

describe("start a new calculation", () => {
  it("REGRESSION: 'Start en ny beregning' resets the active inputs to the defaults, keeping saved entries", () => {
    const custom = { ...DEFAULT_SIMPLE_INPUTS, annualIncome: 777_000, desiredStopAge: 55 };
    usePublicStore.setState({ inputs: custom });
    usePublicStore.getState().saveCalculation("Behold mig");
    renderScreen();
    fireEvent.click(screen.getByRole("link", { name: /Start en ny beregning/ }));
    const s = usePublicStore.getState();
    // A fresh plan, not the previous numbers…
    expect(s.inputs).toEqual(DEFAULT_SIMPLE_INPUTS);
    // …while the explicitly saved calculation survives with its own numbers.
    expect(s.saved).toHaveLength(1);
    expect(s.saved[0].inputs.annualIncome).toBe(777_000);
  });
});
