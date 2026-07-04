import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

/**
 * Project the future value of a starting balance plus monthly contributions at a
 * real (inflation-adjusted) annual return, over a number of years.
 *
 * Public, read-only helper. Uses no app state or user data.
 */
export default defineTool({
  name: "project_savings_growth",
  title: "Project savings growth",
  description:
    "Project the real (inflation-adjusted) future value of a starting balance plus monthly contributions over N years at a real annual return.",
  inputSchema: {
    startingBalance: z
      .number()
      .min(0)
      .describe("Current invested balance in kroner (real terms)."),
    monthlyContribution: z
      .number()
      .min(0)
      .describe("Ongoing monthly contribution in kroner (real terms)."),
    years: z
      .number()
      .int()
      .positive()
      .max(80)
      .describe("Number of years to project."),
    realAnnualReturn: z
      .number()
      .min(-0.2)
      .max(0.5)
      .default(0.04)
      .describe("Expected real annual return as a decimal, e.g. 0.04 for 4%."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ startingBalance, monthlyContribution, years, realAnnualReturn }) => {
    const months = years * 12;
    const rMonthly = Math.pow(1 + realAnnualReturn, 1 / 12) - 1;
    let balance = startingBalance;
    let contributed = 0;
    for (let i = 0; i < months; i++) {
      balance = balance * (1 + rMonthly) + monthlyContribution;
      contributed += monthlyContribution;
    }
    const finalBalance = Math.round(balance);
    const growth = Math.round(balance - startingBalance - contributed);
    const summary =
      `After ${years} years at ${(realAnnualReturn * 100).toFixed(2)}% real return: ` +
      `~${finalBalance.toLocaleString("da-DK")} kr (contributed ${Math.round(contributed).toLocaleString("da-DK")} kr, ` +
      `growth ${growth.toLocaleString("da-DK")} kr). Real terms.`;
    return {
      content: [{ type: "text", text: summary }],
      structuredContent: {
        finalBalance,
        totalContributed: Math.round(contributed),
        growth,
        years,
        realAnnualReturn,
      },
    };
  },
});
