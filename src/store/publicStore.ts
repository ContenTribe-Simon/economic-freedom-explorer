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

/**
 * Rehydration guard for the saved list: legacy or hand-edited localStorage must not smuggle
 * malformed entries past the type (`saved: [null]` would crash /gem-og-del on `s.id`/`s.name`
 * and lock the user out of the screen until storage is cleared). Entries without a usable
 * `inputs` object are dropped (there is nothing to load); everything else is normalized field
 * by field — id (regenerated when missing or duplicated, so React keys and removeCalculation
 * stay per-entry), name, savedAt, and the inputs through the same sanitizer as every other
 * write path.
 */
function sanitizeSavedCalculations(raw: unknown): SavedCalculation[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const clean: SavedCalculation[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (e.inputs == null || typeof e.inputs !== "object") continue;
    let id = typeof e.id === "string" && e.id.length > 0 ? e.id : newId();
    if (seenIds.has(id)) id = newId();
    seenIds.add(id);
    clean.push({
      id,
      name: typeof e.name === "string" && e.name.trim().length > 0 ? e.name.trim() : "Min plan",
      savedAt: typeof e.savedAt === "number" && Number.isFinite(e.savedAt) ? e.savedAt : 0,
      inputs: sanitizeSimpleInputs({ ...(e.inputs as Record<string, unknown>) }),
    });
  }
  return clean;
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
      // Only data is ever persisted — never the action functions.
      partialize: (s) => ({ inputs: s.inputs, saved: s.saved }),
      // Rehydration is a write path too: legacy/hand-edited localStorage must not smuggle an
      // invalid input set past the sanitizer. Copy ONLY the known persisted fields — never
      // spread the raw blob over the live store, or a corrupted key shaped like an action
      // (e.g. `"setInputs": null`) would overwrite the real function and crash the next
      // form interaction.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { inputs?: unknown; saved?: unknown };
        const rawInputs = p.inputs && typeof p.inputs === "object" ? (p.inputs as Record<string, unknown>) : current.inputs;
        return {
          ...current,
          inputs: sanitizeSimpleInputs({ ...rawInputs }),
          saved: Array.isArray(p.saved) ? sanitizeSavedCalculations(p.saved) : current.saved,
        };
      },
    },
  ),
);
