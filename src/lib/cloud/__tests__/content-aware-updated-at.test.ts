/**
 * Phase 12 concurrency-correctness (Codex): finance_models.updated_at is the optimistic-
 * concurrency token, but the generic set_updated_at() trigger bumped it on EVERY update —
 * including loadModel's last_opened_at bookkeeping write — so merely OPENING a model
 * invalidated other sessions' tokens (false "changed elsewhere" conflicts).
 *
 * What CAN be pinned without a live database:
 * - The migration chain's EFFECTIVE trigger wiring and function text (textual, like the
 *   snapshots-RLS test): finance_models' BEFORE UPDATE trigger must point at the
 *   content-aware function, whose body must guard on data_json and preserve OLD.updated_at
 *   otherwise; the generic set_updated_at() must survive untouched for profiles/snapshots.
 * - The app never turns bookkeeping into content writes: loadModel's update payload carries
 *   ONLY last_opened_at, and overwriteModel no longer sends a client-side updated_at (the
 *   trigger owns that column).
 *
 * What CANNOT be verified here and needs the live database: the trigger actually firing
 * with these semantics. That is deliberately NOT faked with a mock — it is a manual
 * deploy-time check (see CLOUD_MODEL.md).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");

function allMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

/** LAST definition of the finance_models updated trigger across the chain wins. */
function effectiveFinanceModelsUpdatedTrigger(): string {
  const matches =
    allMigrationsSql().match(/CREATE TRIGGER trg_finance_models_updated[\s\S]*?;/g) ?? [];
  if (matches.length === 0) throw new Error("trigger not found in any migration");
  return matches[matches.length - 1];
}

describe("migration chain: content-aware updated_at on finance_models (textual pin)", () => {
  it("the effective finance_models trigger executes the content-aware function", () => {
    expect(effectiveFinanceModelsUpdatedTrigger()).toMatch(
      /EXECUTE FUNCTION public\.set_updated_at_on_content_change\(\)/,
    );
  });

  it("the content-aware function bumps only on data_json changes and preserves OLD.updated_at otherwise", () => {
    const fn = allMigrationsSql().match(
      /CREATE OR REPLACE FUNCTION public\.set_updated_at_on_content_change\(\)[\s\S]*?\$\$;/,
    )?.[0];
    expect(fn, "content-aware trigger function missing from migrations").toBeTruthy();
    expect(fn).toMatch(/NEW\.data_json IS DISTINCT FROM OLD\.data_json/);
    expect(fn).toMatch(/NEW\.updated_at = OLD\.updated_at/);
  });

  it("the generic set_updated_at() survives for profiles and finance_snapshots", () => {
    const sql = allMigrationsSql();
    expect(sql).not.toMatch(/DROP FUNCTION[^;]*set_updated_at\(\)/);
    // Their triggers still reference the generic function (last definitions unchanged).
    const profiles = sql.match(/CREATE TRIGGER trg_profiles_updated[\s\S]*?;/g) ?? [];
    const snaps = sql.match(/CREATE TRIGGER trg_finance_snapshots_updated[\s\S]*?;/g) ?? [];
    expect(profiles[profiles.length - 1]).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
    expect(snaps[snaps.length - 1]).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
  });
});

// ---- App side: bookkeeping writes stay bookkeeping ----

const steps: Array<{ data?: unknown; error?: unknown }> = [];
const calls: string[] = [];

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  for (const m of ["update", "eq", "select", "single", "insert", "delete", "order"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push(`${m}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      return builder;
    };
  }
  (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(steps.shift() ?? { data: null, error: null }).then(res, rej);
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

import { loadModel, overwriteModel } from "@/lib/cloud/models";
import { useFinanceStore } from "@/store/financeStore";

beforeEach(() => {
  steps.length = 0;
  calls.length = 0;
});

describe("app side: the token column is server-owned", () => {
  it("loadModel's bookkeeping write carries ONLY last_opened_at (never data_json/updated_at)", async () => {
    const validPayload = JSON.parse(useFinanceStore.getState().exportJson());
    steps.push({ data: { data_json: validPayload }, error: null });
    steps.push({ data: null, error: null });
    await loadModel("model-1");
    const bookkeeping = calls.find((c) => c.startsWith("update(") && c.includes("last_opened_at"));
    expect(bookkeeping, "bookkeeping update not issued").toBeTruthy();
    expect(bookkeeping).not.toContain("data_json");
    expect(bookkeeping).not.toContain("updated_at\":");
  });

  it("overwriteModel does not send a client-side updated_at (the trigger owns the column)", async () => {
    steps.push({ data: [{ id: "model-1" }], error: null });
    await overwriteModel("model-1", "2026-07-08T10:00:00+00:00");
    const contentWrite = calls.find((c) => c.startsWith("update(") && c.includes("data_json"));
    expect(contentWrite, "content update not issued").toBeTruthy();
    expect(contentWrite).not.toContain('"updated_at"');
  });
});
