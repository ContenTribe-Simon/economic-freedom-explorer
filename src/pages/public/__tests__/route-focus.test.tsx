/**
 * Phase 7 screening, finding 4 (live keyboard-navigation test): no route-level focus
 * management existed. After every client-side navigation, focus stayed on <body>, so
 * keyboard and screen-reader users got no signal the page changed. RouteFocusManager
 * moves focus to the new screen's marked h1 ([data-route-focus]) on every pathname
 * change, but leaves the browser's default focus alone on initial load.
 *
 * Tests drive the REAL <App/> through real link clicks (BrowserRouter + jsdom history).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "@/App";
import { usePublicStore } from "@/store/publicStore";
import { DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";

beforeEach(() => {
  usePublicStore.setState({ inputs: { ...DEFAULT_SIMPLE_INPUTS }, saved: [] });
  localStorage.removeItem("frihedsmodel-advanced-door.v1");
});

function renderAppAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("route-change focus management", () => {
  it("initial load does NOT steal focus (browser default kept)", () => {
    renderAppAt("/start");
    expect(document.activeElement).toBe(document.body);
  });

  it("/start -> /simple-inputs: focus moves to the new screen's h1", async () => {
    renderAppAt("/start");
    fireEvent.click(screen.getByRole("link", { name: /Kom i gang/ }));
    await waitFor(() => {
      const active = document.activeElement as HTMLElement;
      expect(active.tagName).toBe("H1");
      expect(active.hasAttribute("data-route-focus")).toBe(true);
    });
  });

  it("/simple-inputs -> /resultat: focus moves to the result headline", async () => {
    renderAppAt("/simple-inputs");
    fireEvent.click(screen.getByRole("link", { name: "Spring til svar" }));
    await waitFor(() => {
      expect((document.activeElement as HTMLElement).tagName).toBe("H1");
    });
  });

  it("/resultat -> /gem-og-del: focus lands on the SCREEN h1, not the print-summary h1", async () => {
    renderAppAt("/resultat");
    fireEvent.click(screen.getByRole("link", { name: "Gem eller del" }));
    await waitFor(() => {
      const active = document.activeElement as HTMLElement;
      expect(active.tagName).toBe("H1");
      // GemOgDel renders a print-only h1 EARLIER in the DOM (the printed summary headline);
      // the focus target must be the visible screen heading.
      expect(active.textContent).toBe("Behold dit svar.");
    });
  });

  it("corner button -> Advanced door: the door's h1 receives focus", async () => {
    renderAppAt("/gem-og-del");
    fireEvent.click(screen.getByRole("link", { name: "Avanceret" }));
    await waitFor(() => {
      const active = document.activeElement as HTMLElement;
      expect(active.tagName).toBe("H1");
      expect(active.textContent).toBe("Du er på vej ind i den avancerede model.");
    });
  });
});
