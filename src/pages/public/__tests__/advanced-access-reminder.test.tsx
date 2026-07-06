/**
 * The no-carry-over reminder must accompany EVERY advanced access point (Codex round 2):
 * the corner AdvancedAccessButton is on all four public screens, but the reminder only
 * existed next to Resultat's action-row button. For a returning user whose Advanced door is
 * already open, this note is the only thing telling them the public numbers do not carry
 * over, so it has to be present at every entry point — the shared header renders it right
 * under the corner button, and Resultat additionally keeps it by the row CTA.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import Start from "../Start";
import SimpleInputs from "../SimpleInputs";
import Resultat from "../Resultat";
import GemOgDel from "../GemOgDel";
import { usePublicStore } from "@/store/publicStore";
import { DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";

const NOTE = "Den avancerede model har sine egne tal. Tallene fra beregningen her følger ikke med.";

const SCREENS: ReadonlyArray<[path: string, element: ReactElement]> = [
  ["/start", <Start />],
  ["/simple-inputs", <SimpleInputs />],
  ["/resultat", <Resultat />],
  ["/gem-og-del", <GemOgDel />],
];

function renderAt(path: string, element: ReactElement) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  usePublicStore.setState({ inputs: { ...DEFAULT_SIMPLE_INPUTS }, saved: [] });
});

describe("no-carry-over reminder near every advanced access point", () => {
  it.each(SCREENS)("%s: the header corner button carries the reminder", (path, element) => {
    const { unmount } = renderAt(path, element);
    const header = screen.getByRole("banner");
    // The corner button and its reminder live in the SAME header, not just anywhere on the page.
    expect(within(header).getByRole("link", { name: "Avanceret" })).toBeTruthy();
    expect(within(header).getByTestId("advanced-no-carryover-note").textContent).toBe(NOTE);
    unmount();
  });

  it("Resultat: the action-row CTA keeps its own reminder in addition to the header's", () => {
    renderAt("/resultat", <Resultat />);
    expect(screen.getByRole("link", { name: "Avanceret model" })).toBeTruthy();
    const notes = screen.getAllByTestId("advanced-no-carryover-note");
    expect(notes).toHaveLength(2);
    for (const note of notes) expect(note.textContent).toBe(NOTE);
  });

  it("the reminder does not depend on the Advanced door state (returning user)", () => {
    localStorage.setItem("frihedsmodel-advanced-door.v1", "open");
    try {
      const { unmount } = renderAt("/start", <Start />);
      expect(screen.getByTestId("advanced-no-carryover-note").textContent).toBe(NOTE);
      unmount();
    } finally {
      localStorage.removeItem("frihedsmodel-advanced-door.v1");
    }
  });
});
