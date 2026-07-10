/**
 * Phase 12 workstream B (security), Codex fix 3: the MCP tools' Zod input schemas must reject
 * non-finite / unbounded numbers at the SCHEMA level, before the handler computes anything.
 *
 * zod 3.25's z.number() (and .positive()/.min()) ACCEPT Infinity and NaN, so an input like
 * annualSpending: 1e309 (=== Infinity) — or a finite spend divided by a near-zero withdrawal rate
 * — produced non-finite output. Every numeric input now carries .finite() plus domain-appropriate
 * min/max bounds. This tests the ACTUAL schemas exported by the tool source (src/lib/mcp/tools/*),
 * which is what the Lovable plugin bundles into the deployed Edge Function.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import estimateFireNumberTool from "@/lib/mcp/tools/estimate-fire-number";
import projectSavingsGrowthTool from "@/lib/mcp/tools/project-savings-growth";

// The tool's inputSchema is a raw ZodRawShape; wrap it to validate a full input object.
const estimateSchema = z.object(estimateFireNumberTool.inputSchema as z.ZodRawShape);
const growthSchema = z.object(projectSavingsGrowthTool.inputSchema as z.ZodRawShape);

const ok = (schema: z.ZodTypeAny, input: unknown) => schema.safeParse(input).success;

describe("estimate_fire_number input schema", () => {
  it("rejects non-finite annualSpending (Infinity, 1e309, NaN)", () => {
    expect(ok(estimateSchema, { annualSpending: Infinity, safeWithdrawalRate: 0.04 })).toBe(false);
    expect(ok(estimateSchema, { annualSpending: 1e309, safeWithdrawalRate: 0.04 })).toBe(false); // 1e309 === Infinity
    expect(ok(estimateSchema, { annualSpending: Number.NaN, safeWithdrawalRate: 0.04 })).toBe(false);
  });

  it("rejects a withdrawal rate small enough to blow the result up to non-finite", () => {
    // finite spend / near-zero rate would otherwise overflow to Infinity in the handler.
    expect(ok(estimateSchema, { annualSpending: 1_000_000_000, safeWithdrawalRate: 1e-300 })).toBe(false);
    expect(ok(estimateSchema, { annualSpending: 240_000, safeWithdrawalRate: Infinity })).toBe(false);
  });

  it("accepts a normal input", () => {
    expect(ok(estimateSchema, { annualSpending: 240_000, safeWithdrawalRate: 0.04 })).toBe(true);
  });

  it("keeps the computed FIRE number finite for the schema's most extreme accepted input", () => {
    // Largest annualSpending / smallest safeWithdrawalRate the schema now allows must stay finite.
    const parsed = estimateSchema.parse({ annualSpending: 1_000_000_000, safeWithdrawalRate: 0.0001 });
    const fireNumber = parsed.annualSpending / parsed.safeWithdrawalRate;
    expect(Number.isFinite(fireNumber)).toBe(true);
  });
});

describe("project_savings_growth input schema", () => {
  it("rejects non-finite startingBalance / monthlyContribution", () => {
    expect(ok(growthSchema, { startingBalance: Infinity, monthlyContribution: 0, years: 30, realAnnualReturn: 0.04 })).toBe(false);
    expect(ok(growthSchema, { startingBalance: 0, monthlyContribution: Infinity, years: 30, realAnnualReturn: 0.04 })).toBe(false);
    expect(ok(growthSchema, { startingBalance: Number.NaN, monthlyContribution: 0, years: 30, realAnnualReturn: 0.04 })).toBe(false);
  });

  it("rejects non-finite years / realAnnualReturn", () => {
    expect(ok(growthSchema, { startingBalance: 0, monthlyContribution: 0, years: Infinity, realAnnualReturn: 0.04 })).toBe(false);
    expect(ok(growthSchema, { startingBalance: 0, monthlyContribution: 0, years: 30, realAnnualReturn: Number.NaN })).toBe(false);
  });

  it("accepts a normal input and keeps the projection finite at the extremes", () => {
    expect(ok(growthSchema, { startingBalance: 500_000, monthlyContribution: 5_000, years: 30, realAnnualReturn: 0.04 })).toBe(true);
    const p = growthSchema.parse({ startingBalance: 1e12, monthlyContribution: 1e10, years: 80, realAnnualReturn: 0.5 });
    const months = p.years * 12;
    const rMonthly = Math.pow(1 + p.realAnnualReturn, 1 / 12) - 1;
    let balance = p.startingBalance;
    for (let i = 0; i < months; i++) balance = balance * (1 + rMonthly) + p.monthlyContribution;
    expect(Number.isFinite(balance)).toBe(true);
  });
});
