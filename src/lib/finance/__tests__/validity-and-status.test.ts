import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { deriveKPIs } from "../kpis";

function run(s: ReturnType<typeof makeBaseScenario>) {
  const years = project(s, defaultAssumptions);
  return { years, kpis: deriveKPIs(s, years, defaultAssumptions) };
}

describe("modelStatus and shortfall labels", () => {
  it("invalid scenario with cashflow-shortfall caps robustness at 25 and reports privat shortfall age", () => {
    const s = makeBaseScenario();
    s.inputs.spending.desiredMonthlyNet = 80000;
    const { kpis } = run(s);
    expect(kpis.modelStatus).toBe("invalid");
    expect(kpis.firstShortfallAge).not.toBeNull();
    expect(kpis.financialRobustness).toBeLessThanOrEqual(25);
    expect(kpis.modelStatusReason).toMatch(/cashflow-shortfall fra alder/);
  });

  it("valid scenario stays valid with no financing issue", () => {
    const s = makeBaseScenario();
    s.inputs.spending.desiredMonthlyNet = 5000;
    s.inputs.target.minNetWorthAtEnd = 0;
    const { kpis } = run(s);
    expect(kpis.modelStatus).toBe("valid");
    expect(kpis.firstFinancingIssueAge).toBeNull();
    expect(kpis.firstShortfallAge).toBeNull();
  });

  it("KPIs expose firstFinancingIssueAge separate from firstShortfallAge", () => {
    const s = makeBaseScenario();
    const { kpis } = run(s);
    expect("firstFinancingIssueAge" in kpis).toBe(true);
    expect("firstFinancingIssueKind" in kpis).toBe(true);
    expect("firstFinancingIssueAmount" in kpis).toBe(true);
  });

  it("invalid status forces robustness cap regardless of breakdown", () => {
    const s = makeBaseScenario();
    s.inputs.spending.desiredMonthlyNet = 80000;
    const { kpis } = run(s);
    expect(kpis.modelStatus).toBe("invalid");
    expect(kpis.financialRobustness).toBeLessThanOrEqual(25);
  });
});

describe("Scenarios comparison metric exposes Modelstatus row", () => {
  it("Scenarios.tsx defines a Modelstatus row", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("src/pages/Scenarios.tsx", "utf8"),
    );
    expect(src).toMatch(/Modelstatus/);
    expect(src).toMatch(/Første privat cashflow-shortfall/);
    expect(src).toMatch(/Første finansieringsproblem/);
  });
});

describe("Dashboard renames and notes", () => {
  it("Dashboard uses 'Første privat cashflow-shortfall' label", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("src/pages/Dashboard.tsx", "utf8"),
    );
    expect(src).toMatch(/Første privat cashflow-shortfall/);
    expect(src).toMatch(/Første finansieringsproblem/);
    expect(src).not.toMatch(/label="Første shortfall"/);
  });

  it("Audit panel section header is renamed", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("src/pages/Projection.tsx", "utf8"),
    );
    expect(src).toMatch(/Årets overskud\/underskud og investering/);
  });
});
