/**
 * The no-carry-over reminder must accompany EVERY advanced access point (Codex round 2):
 * the corner AdvancedAccessButton is on all four public screens, but the reminder only
 * existed next to Resultat's action-row button. For a returning user whose Advanced door is
 * already open, this note is the only thing telling them the public numbers do not carry
 * over, so every SCREEN shows it exactly once: the shared header renders it right under the
 * corner button on Start, Simple Inputs and GemOgDel; on Resultat it sits by the action-row
 * CTA instead (the header copy is suppressed there, so the same sentence never appears twice
 * on one screen — self-review round 3).
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

const HEADER_NOTE_SCREENS = SCREENS.filter(([path]) => path !== "/resultat");

describe("no-carry-over reminder near every advanced access point", () => {
  it.each(HEADER_NOTE_SCREENS)("%s: the header corner button carries the reminder", (path, element) => {
    const { unmount } = renderAt(path, element);
    const header = screen.getByRole("banner");
    // The corner button and its reminder live in the SAME header, not just anywhere on the page.
    expect(within(header).getByRole("link", { name: "Avanceret" })).toBeTruthy();
    expect(within(header).getByTestId("advanced-no-carryover-note").textContent).toBe(NOTE);
    unmount();
  });

  it.each(SCREENS)("%s: the reminder appears exactly once on the screen", (path, element) => {
    const { unmount } = renderAt(path, element);
    const notes = screen.getAllByTestId("advanced-no-carryover-note");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe(NOTE);
    unmount();
  });

  it("Resultat: the single reminder sits by the action-row CTA, not in the header", () => {
    renderAt("/resultat", <Resultat />);
    expect(screen.getByRole("link", { name: "Avanceret model" })).toBeTruthy();
    const note = screen.getByTestId("advanced-no-carryover-note");
    expect(note.textContent).toBe(NOTE);
    // The header still has the corner button, but its note copy is suppressed on this screen.
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Avanceret" })).toBeTruthy();
    expect(within(header).queryByTestId("advanced-no-carryover-note")).toBeNull();
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
