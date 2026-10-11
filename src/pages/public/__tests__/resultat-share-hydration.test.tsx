/**
 * PR 1 (Phase 12 C/D): opening a share link hydrates the recipient's inputs from the URL
 * fragment (legacy ?d= still accepted), then cleans the address bar. Hostile payloads leave the
 * recipient's own inputs untouched.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Resultat from "../Resultat";
import { usePublicStore } from "@/store/publicStore";
import { DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";
import { encodeShareInputs } from "@/lib/publicShare";

let current = "";
function LocationProbe() {
  const loc = useLocation();
  current = `${loc.pathname}${loc.search}${loc.hash}`;
  return null;
}

function open(entry: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        <Routes>
          <Route path="/resultat" element={<Resultat />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

const OWN = { ...DEFAULT_SIMPLE_INPUTS, currentAge: 33 };

beforeEach(() => {
  current = "";
  usePublicStore.setState({ inputs: { ...OWN }, saved: [] });
});

describe("Resultat share-link hydration", () => {
  it("hydrates from the fragment and cleans the URL", async () => {
    open(`/resultat#d=${encodeShareInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 44 })}`);
    await waitFor(() => expect(usePublicStore.getState().inputs.currentAge).toBe(44));
    await waitFor(() => expect(current).toBe("/resultat"));
  });

  it("still hydrates from a legacy ?d= link and cleans the URL", async () => {
    open(`/resultat?d=${encodeShareInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 55 })}`);
    await waitFor(() => expect(usePublicStore.getState().inputs.currentAge).toBe(55));
    await waitFor(() => expect(current).toBe("/resultat"));
  });

  it("prefers the fragment when both are present", async () => {
    const legacy = encodeShareInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 50 });
    const frag = encodeShareInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 30 });
    open(`/resultat?d=${legacy}#d=${frag}`);
    await waitFor(() => expect(usePublicStore.getState().inputs.currentAge).toBe(30));
  });

  it("ignores a hostile fragment: recipient's inputs untouched, URL cleaned", async () => {
    open("/resultat#d=%%%not-base64%%%");
    await waitFor(() => expect(current).toBe("/resultat"));
    expect(usePublicStore.getState().inputs.currentAge).toBe(33);
  });

  it("does nothing without a payload", async () => {
    open("/resultat");
    await waitFor(() => expect(current).toBe("/resultat"));
    expect(usePublicStore.getState().inputs.currentAge).toBe(33);
  });
});

describe("share-guard stash (public/share-guard.js moved the payload out of the URL)", () => {
  it("hydrates from the stash once, then forgets it", async () => {
    sessionStorage.setItem("frihedsmodel-share-payload", encodeShareInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 61 }));
    const { unmount } = open("/resultat");
    await waitFor(() => expect(usePublicStore.getState().inputs.currentAge).toBe(61));
    expect(sessionStorage.getItem("frihedsmodel-share-payload")).toBeNull();
    unmount();
    usePublicStore.setState({ inputs: { ...OWN }, saved: [] });
    open("/resultat");
    await new Promise((r) => setTimeout(r, 0));
    expect(usePublicStore.getState().inputs.currentAge).toBe(33);
  });

  it("a hostile stash is ignored like a hostile link", async () => {
    sessionStorage.setItem("frihedsmodel-share-payload", "%%%not-base64%%%");
    open("/resultat");
    await waitFor(() => expect(sessionStorage.getItem("frihedsmodel-share-payload")).toBeNull());
    expect(usePublicStore.getState().inputs.currentAge).toBe(33);
  });
});
