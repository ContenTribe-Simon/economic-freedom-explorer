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
 * .test.ts — this pins the MIGRATION SQL. The matching is deliberately format-TOLERANT (case,
 * whitespace, and EXECUTE FUNCTION vs the legacy EXECUTE PROCEDURE spelling) so that a future
 * trigger function which forgets the revoke fails this test regardless of HOW its DDL is written,
 * not just when it happens to match one exact string. Verifying the LIVE database matches remains
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

/** Every trigger function that must be revoked from the API roles. */
const TRIGGER_FUNCTIONS = ["handle_new_user", "set_updated_at", "set_updated_at_on_content_change"];

/**
 * Any function name invoked by a CREATE TRIGGER, however the DDL is spelled:
 * `EXECUTE FUNCTION|PROCEDURE public.<name>(`, case-insensitive, and whitespace-tolerant around
 * BOTH the schema-qualifier dot (`public . name` is valid Postgres) and the parentheses.
 */
function triggerInvokedFunctions(sql: string): Set<string> {
  const re = /EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+public\s*\.\s*(\w+)\s*\(/gi;
  return new Set([...sql.matchAll(re)].map((m) => m[1]));
}

/** The FROM-role list of the REVOKE EXECUTE statement for public.<fn>(), or null if absent. */
function revokeRolesFor(sql: string, fn: string): string | null {
  // Tolerate whitespace around the schema dot and the parentheses, plus case.
  const re = new RegExp(
    `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\s*\\.\\s*${fn}\\s*\\(\\s*\\)\\s+FROM\\s+([^;]*);`,
    "i",
  );
  return re.exec(sql)?.[1] ?? null;
}

describe("migration chain: trigger functions are not executable by API roles (format-tolerant pin)", () => {
  const sql = allMigrationsSql();

  it.each(TRIGGER_FUNCTIONS)(
    "public.%s() has EXECUTE revoked from PUBLIC, anon AND authenticated",
    (fn) => {
      const roles = revokeRolesFor(sql, fn);
      expect(roles, `no REVOKE EXECUTE found for public.${fn}()`).not.toBeNull();
      expect(roles, `public.${fn}() revoke does not name PUBLIC`).toMatch(/\bPUBLIC\b/i);
      expect(roles, `public.${fn}() revoke does not name anon`).toMatch(/\banon\b/i);
      expect(roles, `public.${fn}() revoke does not name authenticated`).toMatch(/\bauthenticated\b/i);
    },
  );

  it("every function invoked by a CREATE TRIGGER is in the guarded set (regardless of DDL spelling)", () => {
    const referenced = triggerInvokedFunctions(sql);
    // Sanity: the tolerant pattern actually matched the existing triggers.
    expect(referenced.size).toBeGreaterThan(0);
    for (const fn of referenced) {
      expect(
        TRIGGER_FUNCTIONS,
        `trigger function public.${fn}() is invoked by a CREATE TRIGGER but is not guarded by this test (add it to TRIGGER_FUNCTIONS and give it a REVOKE EXECUTE migration)`,
      ).toContain(fn);
    }
  });
});
