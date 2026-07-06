/**
 * Phase 7 security/robustness screening, finding 2: no error containment anywhere. Resultat
 * and GemOgDel call computePublicResult() synchronously during render; any unexpected
 * engine/adapter/chart error unmounted the whole React tree — blank screen, no recovery.
 * The AppErrorBoundary wraps the entire app and shows a calm Danish fallback instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

// React logs caught render errors via console.error; keep test output pristine without
// hiding OTHER errors: capture calls, restore after.
let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleSpy.mockRestore();
  vi.doUnmock("@/pages/public/Resultat");
  vi.resetModules();
});

function Bomb(): never {
  throw new Error("deliberate mid-render explosion");
}

describe("AppErrorBoundary", () => {
  it("a component throwing mid-render shows the calm Danish fallback, not a blank page", () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Noget gik galt." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Genindlæs siden" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Til forsiden" })).toBeTruthy();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <AppErrorBoundary>
        <p>alt er fint</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText("alt er fint")).toBeTruthy();
    expect(screen.queryByText("Noget gik galt.")).toBeNull();
  });

  it("fallback copy follows the public voice: no em dashes, no 'ca.' hedging", () => {
    const { container } = render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/\bca\.\s/i);
  });
});

describe("App-level containment (the boundary is actually wired around the routes)", () => {
  it("a public screen throwing mid-render is contained by the real <App/>", async () => {
    // Make the real Resultat module throw during render, then mount the REAL App at
    // /resultat. Before this fix the whole tree unmounted (blank page, rethrown error);
    // now the fallback must appear.
    vi.doMock("@/pages/public/Resultat", () => ({
      default: () => {
        throw new Error("deliberate route explosion");
      },
    }));
    const { default: App } = await import("@/App");
    window.history.pushState({}, "", "/resultat");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Noget gik galt." })).toBeTruthy();
  });
});
