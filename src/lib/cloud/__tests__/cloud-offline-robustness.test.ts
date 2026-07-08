/**
 * Phase 12 pre-launch gate — "offline-first works during backend downtime, error handling,
 * concurrent users" (docs/product-vision.md §6). These tests pin how the cloud layer behaves
 * when Supabase is unreachable or when another session changed the data underneath:
 *
 * 1. loadModel: the trailing last_opened_at METADATA write must be non-fatal. It runs after
 *    the model is already applied to the local store; a connection drop there previously
 *    bubbled up as "Kunne ikke indlæse" although the load had succeeded.
 * 2. loadModel: a failed DATA fetch must reject without touching the local store.
 * 3. overwriteModel/renameModel: writing to a row that no longer matches (deleted in another
 *    session, or changed when a concurrency token is passed) must throw a clear Danish error
 *    instead of reporting success for a write that PostgREST silently matched to 0 rows.
 * 4. cloudErrorMessage: network-level failures get a calm Danish offline message that says
 *    local data is safe; other errors keep their message; unknown shapes get the fallback.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Chainable fake PostgREST builder: every method returns itself; awaiting it settles with
// the queued step result (or rejection). Shaped after the exact call chains models.ts uses.
type StepResult = { data?: unknown; error?: unknown } | { reject: unknown };
const steps: StepResult[] = [];
const calls: string[] = [];

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  for (const m of ["update", "eq", "select", "single", "insert", "delete", "order"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push(`${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      return builder;
    };
  }
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => {
    const step = steps.shift() ?? { data: null, error: null };
    if ("reject" in step) return Promise.reject(step.reject).then(resolve, reject);
    return Promise.resolve(step).then(resolve, reject);
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => {
      calls.push(`from(${table})`);
      return makeBuilder();
    },
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  },
}));

import { cloudErrorMessage, loadModel, overwriteModel, renameModel } from "@/lib/cloud/models";
import { useFinanceStore } from "@/store/financeStore";

beforeEach(() => {
  steps.length = 0;
  calls.length = 0;
});

describe("loadModel under backend failure", () => {
  it("REGRESSION: a dropped connection on the last_opened_at metadata write is NON-fatal", async () => {
    // The fetched payload is the store's own export — a guaranteed-valid import.
    const validPayload = JSON.parse(useFinanceStore.getState().exportJson());
    steps.push({ data: { data_json: validPayload }, error: null }); // data fetch OK
    steps.push({ reject: new TypeError("Failed to fetch") }); // metadata write: network down
    await expect(loadModel("model-1")).resolves.toBeUndefined();
  });

  it("a failed DATA fetch rejects and leaves the local store untouched", async () => {
    const before = useFinanceStore.getState().activeScenarioId;
    steps.push({ data: null, error: { message: "TypeError: Failed to fetch" } });
    await expect(loadModel("model-1")).rejects.toBeTruthy();
    expect(useFinanceStore.getState().activeScenarioId).toBe(before);
  });
});

describe("overwrite/rename against rows changed in another session", () => {
  it("REGRESSION: overwriting a model deleted in another session throws instead of fake success", async () => {
    steps.push({ data: [], error: null }); // update matched 0 rows — silent no-op before
    await expect(overwriteModel("gone-id")).rejects.toThrow(/findes ikke længere/);
  });

  it("overwrite with a concurrency token rejects when another session changed the model", async () => {
    steps.push({ data: [], error: null }); // updated_at no longer matches -> 0 rows
    await expect(overwriteModel("model-1", "2026-07-08T10:00:00+00:00")).rejects.toThrow(
      /ændret fra en anden enhed eller fane/,
    );
    // The token must actually reach the query as a second eq filter.
    expect(calls.join(" ")).toContain('eq("updated_at","2026-07-08T10:00:00+00:00")');
  });

  it("overwrite succeeds when the row matches (with and without token)", async () => {
    steps.push({ data: [{ id: "model-1" }], error: null });
    await expect(overwriteModel("model-1")).resolves.toBeUndefined();
    steps.push({ data: [{ id: "model-1" }], error: null });
    await expect(overwriteModel("model-1", "2026-07-08T10:00:00+00:00")).resolves.toBeUndefined();
  });

  it("renaming a model deleted in another session throws instead of fake success", async () => {
    steps.push({ data: [], error: null });
    await expect(renameModel("gone-id", "Nyt navn")).rejects.toThrow(/findes ikke længere/);
  });
});

describe("cloudErrorMessage: Danish, offline-aware", () => {
  const OFFLINE = /ingen forbindelse/i;

  it("maps network-level failures to the calm offline message (Error and PostgrestError shapes)", () => {
    expect(cloudErrorMessage(new TypeError("Failed to fetch"), "Kunne ikke hente")).toMatch(OFFLINE);
    expect(cloudErrorMessage({ message: "TypeError: Failed to fetch" }, "Kunne ikke hente")).toMatch(OFFLINE);
    expect(cloudErrorMessage(new Error("NetworkError when attempting to fetch resource."), "x")).toMatch(OFFLINE);
  });

  it("the offline message says local data is safe on this device", () => {
    expect(cloudErrorMessage(new TypeError("Failed to fetch"), "x")).toMatch(/lokalt på denne enhed/i);
  });

  it("keeps specific non-network messages and falls back on unknown shapes", () => {
    expect(cloudErrorMessage(new Error("Modellen findes ikke længere."), "x")).toBe(
      "Modellen findes ikke længere.",
    );
    expect(cloudErrorMessage({ message: "duplicate key value" }, "x")).toBe("duplicate key value");
    expect(cloudErrorMessage(undefined, "Kunne ikke gemme")).toBe("Kunne ikke gemme");
    expect(cloudErrorMessage("weird", "Kunne ikke gemme")).toBe("Kunne ikke gemme");
  });
});
