/**
 * Phase 7 security screening, finding 3: finance_snapshots RLS validated only
 * auth.uid() = user_id, never that model_id belongs to a finance_models row owned by the
 * same user — an authenticated user could link a snapshot to someone else's model UUID.
 *
 * CI has no Postgres, so this test pins the MIGRATION SQL itself: across the migration
 * chain (timestamp order, last definition of a policy wins), the effective
 * INSERT/UPDATE policies for finance_snapshots must carry the model-ownership check.
 * Verifying the LIVE database matches these migrations is a manual step (Supabase
 * dashboard, two real users) and deliberately not covered here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");

/** The full SQL of the LAST definition of a named policy across the migration chain. */
function effectivePolicy(name: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // timestamp-prefixed names: lexicographic = chronological
  let last: string | null = null;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    // Each CREATE POLICY statement ends at the first ';' after its head.
    const re = new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`, "g");
    for (const m of sql.match(re) ?? []) last = m;
  }
  if (!last) throw new Error(`policy ${name} not found in any migration`);
  return last;
}

const OWNERSHIP_CHECK =
  /model_id IS NULL\s+OR EXISTS \(\s*SELECT 1 FROM public\.finance_models m\s+WHERE m\.id = model_id AND m\.user_id = auth\.uid\(\)\s*\)/;

describe("finance_snapshots RLS: model_id ownership is enforced by the effective policies", () => {
  it("INSERT requires model_id to be NULL or reference the caller's own model", () => {
    const policy = effectivePolicy("snapshots_insert_own");
    expect(policy).toMatch(/auth\.uid\(\) = user_id/);
    expect(policy).toMatch(OWNERSHIP_CHECK);
  });

  it("UPDATE keeps the own-row USING clause and adds the same ownership WITH CHECK", () => {
    const policy = effectivePolicy("snapshots_update_own");
    expect(policy).toMatch(/FOR UPDATE USING \(auth\.uid\(\) = user_id\)/);
    expect(policy).toMatch(/WITH CHECK/);
    expect(policy).toMatch(OWNERSHIP_CHECK);
  });

  it("SELECT/DELETE remain own-row scoped (unchanged by the hardening migration)", () => {
    expect(effectivePolicy("snapshots_select_own")).toMatch(/auth\.uid\(\) = user_id/);
    expect(effectivePolicy("snapshots_delete_own")).toMatch(/auth\.uid\(\) = user_id/);
  });
});
