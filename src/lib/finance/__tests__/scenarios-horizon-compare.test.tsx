/**
 * Scenarios comparison table — "Kapital v. slutalder" is measured at each scenario's OWN end
 * horizon (engine anchor fix). Comparing scenarios with different lifeExpectancy values would
 * silently rank different ages against each other, so that row must show the horizon age next
 * to each value and must NOT highlight a "best" value when the compared horizons differ.
 * Other rows' highlighting is untouched.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Scenarios from "@/pages/Scenarios";
import { useFinanceStore } from "@/store/financeStore";
import { makeBaseScenario, defaultAssumptions } from "../defaults";
import type { Scenario } from "../types";

function seedScenarios(scenarios: Scenario[]) {
  useFinanceStore.setState({
    scenarios,
    activeScenarioId: scenarios[0].id,
    assumptions: defaultAssumptions,
    snapshots: [],
  });
}

function mkScenario(name: string, lifeExpectancy: number): Scenario {
  const s = makeBaseScenario();
  s.id = `sc-${name}`;
  s.name = name;
  s.inputs.person.lifeExpectancy = lifeExpectancy;
  return s;
}

/** The <tr> for a given row label. */
function rowFor(label: string): HTMLTableRowElement {
  const cell = screen.getByText(label, { exact: false }).closest("td");
  const row = cell?.closest("tr");
  if (!row) throw new Error(`row not found: ${label}`);
  return row as HTMLTableRowElement;
}

beforeEach(() => {
  // Not persisted through this path in tests; setState drives the page directly.
});

describe("Kapital v. slutalder across mismatched horizons", () => {
  it("shows each scenario's own horizon age and suppresses the best-value highlight", () => {
    seedScenarios([mkScenario("A95", 95), mkScenario("B105", 105)]);
    render(<Scenarios />);

    const row = rowFor("Kapital v. slutalder");
    const cells = Array.from(row.querySelectorAll("td")).slice(1);
    expect(cells).toHaveLength(2);
    // Each value carries its OWN horizon age.
    expect(cells[0].textContent).toContain("(alder 95)");
    expect(cells[1].textContent).toContain("(alder 105)");
    // No best-value highlight in this row (different ages are not comparable)…
    for (const c of cells) {
      expect(c.className).not.toContain("text-accent");
    }
    // …and the row label carries the caveat.
    expect(row.textContent).toContain("Forskellige slutaldre – bedste værdi fremhæves ikke");
    // Other rows' highlighting is untouched: some other numeric row still marks a best value.
    const stopRow = rowFor("Kapital v. stop");
    const stopCells = Array.from(stopRow.querySelectorAll("td")).slice(1);
    expect(stopCells.some((c) => c.className.includes("text-accent"))).toBe(true);
  });

  it("keeps the highlight (and still shows the age) when horizons match", () => {
    const a = mkScenario("A", 95);
    const b = mkScenario("B", 95);
    b.inputs.spending.desiredMonthlyNet = 15_000; // differentiate so one value IS best
    seedScenarios([a, b]);
    render(<Scenarios />);

    const row = rowFor("Kapital v. slutalder");
    const cells = Array.from(row.querySelectorAll("td")).slice(1);
    expect(cells.every((c) => (c.textContent ?? "").includes("(alder 95)"))).toBe(true);
    expect(cells.some((c) => c.className.includes("text-accent"))).toBe(true);
    expect(row.textContent).not.toContain("Forskellige slutaldre");
  });
});
