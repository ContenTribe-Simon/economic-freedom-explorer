/**
 * PR 3 (Phase 12 C/D): the privacy page states the real data controller and data handling in
 * plain public Danish, the local wipe removes the app's browser data, and every public screen
 * carries the shared footer with the disclaimer exactly once.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import Privatliv from "../Privatliv";
import Start from "../Start";
import SimpleInputs from "../SimpleInputs";
import Resultat from "../Resultat";
import GemOgDel from "../GemOgDel";
import { usePublicStore } from "@/store/publicStore";
import { DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";
import { containsForbiddenTerm } from "@/lib/finance/public/safety";
import { PUBLIC_DISCLAIMER } from "@/lib/publicCopy";
import { FEEDBACK_MAILTO, LEGAL_ENTITY } from "@/lib/legalEntity";

function renderAt(path: string, el: ReactElement) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>
    </TooltipProvider>,
  );
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  usePublicStore.setState({ inputs: { ...DEFAULT_SIMPLE_INPUTS }, saved: [] });
});

describe("Privatliv page", () => {
  it("names the data controller, where data lives and how to complain", () => {
    renderAt("/privatliv", <Privatliv />);
    const text = document.body.textContent ?? "";
    expect(screen.getByRole("heading", { level: 1, name: "Sådan behandler vi dine oplysninger" })).toBeTruthy();
    expect(text).toContain(LEGAL_ENTITY.name);
    expect(text).toContain(`CVR ${LEGAL_ENTITY.cvr}`);
    expect(text).toContain(LEGAL_ENTITY.email);
    expect(text).toContain("Stockholm");
    expect(text).toContain("Datatilsynet");
    // Truthful about the host's cookies (found live on 2026-10-11): no "no cookies" claim.
    expect(text).not.toContain("ingen cookies");
    expect(text).toContain("__dpl");
    expect(text).toContain("session-id");
    expect(text).toContain("PostHog med servere i EU");
    expect(text).toContain("Dine tal og de beløb, du ser, bliver aldrig sendt.");
  });

  it("promises account deletion on the cloud page only because that page really offers it", async () => {
    renderAt("/privatliv", <Privatliv />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("På cloud-siden kan du slette enkelte modeller eller hele kontoen.");
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const cloud = readFileSync(path.resolve(__dirname, "../../Cloud.tsx"), "utf8");
    expect(cloud).toContain("<DeleteAccountSection");
  });

  it("follows the public copy rules", () => {
    renderAt("/privatliv", <Privatliv />);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/\bca\.\s/i);
    expect(containsForbiddenTerm(text)).toBe(false);
    // Not a calculation screen: the calculation disclaimer does not belong here.
    expect(text).not.toContain(PUBLIC_DISCLAIMER);
  });

  describe("wipe", () => {
    const assign = vi.fn();
    const original = window.location;
    beforeEach(() => {
      assign.mockReset();
      Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } });
    });
    afterEach(() => {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    });

    it("asks first, then removes the app's browser data and any session, and reloads the page", async () => {
      localStorage.setItem("frihedsmodel-public.v1", "{\"state\":{}}");
      localStorage.setItem("finance-tool.v1", "{}");
      localStorage.setItem("sb-x-auth-token", "session");
      renderAt("/privatliv", <Privatliv />);

      fireEvent.click(screen.getByRole("button", { name: "Slet alle mine data i denne browser" }));
      expect(localStorage.getItem("frihedsmodel-public.v1")).not.toBeNull(); // nothing yet
      fireEvent.click(screen.getByRole("button", { name: "Slet" }));

      await waitFor(() => expect(assign).toHaveBeenCalledWith("/privatliv"));
      expect(localStorage.getItem("frihedsmodel-public.v1")).toBeNull();
      expect(localStorage.getItem("finance-tool.v1")).toBeNull();
      expect(localStorage.getItem("sb-x-auth-token")).toBeNull();
    });

    it("cancelling keeps everything", () => {
      localStorage.setItem("frihedsmodel-public.v1", "{}");
      renderAt("/privatliv", <Privatliv />);
      fireEvent.click(screen.getByRole("button", { name: "Slet alle mine data i denne browser" }));
      fireEvent.click(screen.getByRole("button", { name: "Behold dem" }));
      expect(localStorage.getItem("frihedsmodel-public.v1")).toBe("{}");
      expect(assign).not.toHaveBeenCalled();
    });

    it("confirms after the reload, once", () => {
      sessionStorage.setItem("frihedsmodel-wiped", "1");
      const { unmount } = renderAt("/privatliv", <Privatliv />);
      expect(screen.getByRole("status").textContent).toBe("Dine data i denne browser er slettet.");
      unmount();
      renderAt("/privatliv", <Privatliv />);
      expect(screen.queryByRole("status")).toBeNull();
    });
  });
});

describe("public footer on every public screen", () => {
  it.each([
    ["/start", <Start />],
    ["/simple-inputs", <SimpleInputs />],
    ["/resultat", <Resultat />],
    ["/gem-og-del", <GemOgDel />],
    ["/privatliv", <Privatliv />],
  ] as const)("%s links to the privacy page and the feedback mail", (path, el) => {
    renderAt(path, el);
    const nav = screen.getByRole("navigation", { name: "Om siden" });
    expect(nav.querySelector('a[href="/privatliv"]')?.textContent).toBe("Privatliv");
    const feedback = [...nav.querySelectorAll("a")].find((a) => a.textContent === "Giv feedback");
    expect(feedback?.getAttribute("href")).toBe(FEEDBACK_MAILTO);
    expect(nav.textContent).toContain(LEGAL_ENTITY.email);
  });

  it.each([
    ["/start", <Start />],
    ["/simple-inputs", <SimpleInputs />],
    ["/resultat", <Resultat />],
  ] as const)("%s shows the disclaimer exactly once", (path, el) => {
    renderAt(path, el);
    expect(count(document.body.textContent ?? "", PUBLIC_DISCLAIMER)).toBe(1);
  });

  it("/gem-og-del shows it once on screen and once in the print summary", () => {
    renderAt("/gem-og-del", <GemOgDel />);
    expect(count(document.body.textContent ?? "", PUBLIC_DISCLAIMER)).toBe(2);
  });
});
