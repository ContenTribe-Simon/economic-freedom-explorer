import { defineMcp } from "@lovable.dev/mcp-js";
import estimateFireNumberTool from "./tools/estimate-fire-number";
import projectSavingsGrowthTool from "./tools/project-savings-growth";

/**
 * MCP server for Frihedsmodel (Economic Freedom Explorer).
 *
 * Exposes read-only financial-planning helpers so AI assistants can reason about
 * FIRE targets and savings projections in the same terms the app uses (real / present kroner).
 * No user data or app state is read or written.
 */
export default defineMcp({
  name: "frihedsmodel-mcp",
  title: "Frihedsmodel",
  version: "0.1.0",
  instructions:
    "Financial-independence planning helpers. Use `estimate_fire_number` to compute the invested capital required to fund a given annual spending at a safe withdrawal rate. Use `project_savings_growth` to project the future real value of a balance plus monthly contributions. All figures are in real (inflation-adjusted) kroner.",
  tools: [estimateFireNumberTool, projectSavingsGrowthTool],
});
