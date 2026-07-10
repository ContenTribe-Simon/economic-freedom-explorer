/**
 * Phase 12 workstream B (security): the trigger-function execute-revoke baseline.
 *
 * Migration 20260510163534 established that every SECURITY-relevant trigger function must have
 * EXECUTE revoked from the API roles (PUBLIC / anon / authenticated) so it cannot be invoked
 * directly. New PostgreSQL functions default to EXECUTE granted to PUBLIC, so a trigger
 * function added WITHOUT an explicit revoke silently breaks that baseline (this is exactly what
 * happened to set_updated_at_on_content_change() in 20260709090000, fixed in 20260710120000).
 *
 * CI has no Postgres, so — like snapshots-rls-migration.test.ts and content-aware-updated-at
 * .test.ts — this pins the MIGRATION SQL: across the whole chain, each trigger function must be
 * both created and revoked from anon/authenticated. If a future migration adds a trigger
 * function and forgets the revoke, this test fails. Verifying the LIVE database matches remains
 * a manual Supabase-dashboard step.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");

function allMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

/** Every trigger function defined anywhere in the migration chain. */
const TRIGGER_FUNCTIONS = ["handle_new_user", "set_updated_at", "set_updated_at_on_content_change"];

describe("migration chain: trigger functions are not executable by API roles (textual pin)", () => {
  const sql = allMigrationsSql();

  it.each(TRIGGER_FUNCTIONS)(
    "public.%s() has EXECUTE revoked from anon and authenticated",
    (fn) => {
      // Escaped '()' anchors the name so set_updated_at() does not match
      // set_updated_at_on_content_change().
      const revoke = new RegExp(
        `REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(\\) FROM[^;]*;`,
      ).exec(sql)?.[0];
      expect(revoke, `no REVOKE EXECUTE found for public.${fn}()`).toBeTruthy();
      expect(revoke).toMatch(/\banon\b/);
      expect(revoke).toMatch(/\bauthenticated\b/);
    },
  );

  it("the guarded set includes every function referenced by a CREATE TRIGGER", () => {
    // Guard against a new trigger function slipping past TRIGGER_FUNCTIONS above.
    const referenced = new Set(
      [...sql.matchAll(/EXECUTE FUNCTION public\.(\w+)\(\)/g)].map((m) => m[1]),
    );
    for (const fn of referenced) {
      expect(TRIGGER_FUNCTIONS, `trigger function public.${fn}() is not covered by this test`).toContain(fn);
    }
  });
});
