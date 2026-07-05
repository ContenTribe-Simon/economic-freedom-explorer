import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SIMPLE_INPUTS, type SimplePublicInputs } from "@/lib/finance/public";
import { sanitizeSimpleInputs } from "@/lib/publicInputs";

/**
 * State for the public Frihedsmodel flow (Simple Inputs → Result → Save/Share).
 *
 * Deliberately separate from the advanced `useFinanceStore`: the public flow only ever holds the
 * typed `SimplePublicInputs` surface and a list of locally saved calculations. All model work goes
 * through the public adapter (`computePublicResult`) — nothing here touches the raw engine, and
 * nothing here reads or writes the advanced store's scenarios.
 *
 * Persisted in localStorage only ("Gemmes kun på din egen enhed").
 */

export interface SavedCalculation {
  id: string;
  name: string;
  /** Epoch ms. */
  savedAt: number;
  inputs: SimplePublicInputs;
}

interface PublicState {
  inputs: SimplePublicInputs;
  /** Patch one or more simple-input fields. */
  setInputs: (patch: Partial<SimplePublicInputs>) => void;
  /** Replace the whole input set (used by share-link hydration and "Åbn"). */
  replaceInputs: (inputs: SimplePublicInputs) => void;
  saved: SavedCalculation[];
  /** Save the current inputs under a name; returns the new entry. */
  saveCalculation: (name: string) => SavedCalculation;
  removeCalculation: (id: string) => void;
  /** Load a saved calculation into the active inputs. Returns false if not found. */
  loadCalculation: (id: string) => boolean;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export const usePublicStore = create<PublicState>()(
  persist(
    (set, get) => ({
      inputs: { ...DEFAULT_SIMPLE_INPUTS },
      // Every write is sanitized (spec §4.1 ranges + cross-field rules): a patch that moves
      // currentAge past the stored horizon re-clamps lifeExpectancy/desiredStopAge too, and
      // out-of-range or non-finite values (negative paste, NaN) never reach the store.
      setInputs: (patch) => set((s) => ({ inputs: sanitizeSimpleInputs({ ...s.inputs, ...patch }) })),
      replaceInputs: (inputs) => set({ inputs: sanitizeSimpleInputs({ ...inputs }) }),
      saved: [],
      saveCalculation: (name) => {
        const clean = name.trim() || "Min plan";
        const entry: SavedCalculation = {
          id: newId(),
          name: clean,
          savedAt: Date.now(),
          inputs: { ...get().inputs },
        };
        set((s) => ({ saved: [entry, ...s.saved] }));
        return entry;
      },
      removeCalculation: (id) => set((s) => ({ saved: s.saved.filter((c) => c.id !== id) })),
      loadCalculation: (id) => {
        const entry = get().saved.find((c) => c.id === id);
        if (!entry) return false;
        set({ inputs: sanitizeSimpleInputs({ ...entry.inputs }) });
        return true;
      },
    }),
    {
      name: "frihedsmodel-public.v1",
      // Rehydration is a write path too: legacy/hand-edited localStorage must not smuggle an
      // invalid input set past the sanitizer.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PublicState>;
        return {
          ...current,
          ...p,
          inputs: sanitizeSimpleInputs({ ...(p.inputs ?? current.inputs) }),
          saved: Array.isArray(p.saved) ? p.saved : current.saved,
        };
      },
    },
  ),
);
