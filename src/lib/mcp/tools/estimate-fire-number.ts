import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

/**
 * Estimate a FIRE (financial independence) target using the safe-withdrawal-rate rule:
 *   fireNumber = annualSpending / safeWithdrawalRate
 *
 * Public, read-only helper. Uses no app state or user data. Numbers are in real terms
 * (present kroner) — consistent with the Frihedsmodel model default.
 */
export default defineTool({
  name: "estimate_fire_number",
  title: "Estimate FIRE number",
  description:
    "Estimate the invested capital required for financial independence from an annual spending level and a safe withdrawal rate (default 4%). Real terms.",
  inputSchema: {
    annualSpending: z
      .number()
      .positive()
      .describe("Desired annual spending in kroner (real terms, present-day value)."),
    safeWithdrawalRate: z
      .number()
      .positive()
      .max(0.2)
      .default(0.04)
      .describe("Safe withdrawal rate as a decimal, e.g. 0.04 for 4%."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ annualSpending, safeWithdrawalRate }) => {
    const fireNumber = annualSpending / safeWithdrawalRate;
    const monthlySpending = annualSpending / 12;
    const summary =
      `At ${(safeWithdrawalRate * 100).toFixed(2)}% SWR, an annual spending of ` +
      `${Math.round(annualSpending).toLocaleString("da-DK")} kr ` +
      `(~${Math.round(monthlySpending).toLocaleString("da-DK")} kr/month) ` +
      `requires ~${Math.round(fireNumber).toLocaleString("da-DK")} kr invested.`;
    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        fireNumber: Math.round(fireNumber),
        annualSpending,
        monthlySpending: Math.round(monthlySpending),
        safeWithdrawalRate,
      },
    };
  },
});
