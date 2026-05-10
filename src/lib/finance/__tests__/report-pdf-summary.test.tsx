/**
 * Report PDF/screen summary mode tests.
 *
 * Verifies that the report renders correctly in both live and snapshot mode,
 * that print-summary contains no input controls or advisory copy, and that
 * navigation/sidebar/snapshot-manager are hidden via print:hidden.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Report from "@/pages/Report";
import { useFinanceStore } from "@/store/financeStore";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import type { Scenario } from "@/lib/finance/types";

const PERSIST_KEY = "finance-tool.v1";

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.removeItem(PERSIST_KEY);
  const fresh: Scenario = { ...makeBaseScenario(), type: "base", updatedAt: Date.now() };
  useFinanceStore.setState({
    scenarios: [fresh],
    activeScenarioId: fresh.id,
    assumptions: defaultAssumptions,
    snapshots: [],
  });
});

function renderReport(initial = "/report") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Report />
    </MemoryRouter>,
  );
}

describe("Report — live vs snapshot rendering", () => {
  it("rendrer som live rapport når der ikke er ?snapshot", () => {
    renderReport();
    const root = screen.getByTestId("report-root");
    expect(root.dataset.mode).toBe("live");
    expect(screen.getByTestId("report-mode-badge").textContent).toMatch(/live rapport/i);
    expect(screen.queryByTestId("snapshot-meta")).toBeNull();
  });

  it("rendrer som snapshot når ?snapshot=ID matcher", () => {
    const id = useFinanceStore.getState().saveSnapshot({ name: "Min v1" });
    renderReport(`/report?snapshot=${id}`);
    const root = screen.getByTestId("report-root");
    expect(root.dataset.mode).toBe("snapshot");
    expect(screen.getByTestId("report-mode-badge").textContent).toMatch(/gemt snapshot/i);
    const meta = screen.getByTestId("snapshot-meta");
    expect(meta.textContent).toContain("Min v1");
  });

  it("snapshot-mode skjuler snapshot-manager (ingen ny snapshot kan oprettes inde i en snapshot-rapport)", () => {
    const id = useFinanceStore.getState().saveSnapshot({ name: "Frosset" });
    renderReport(`/report?snapshot=${id}`);
    expect(screen.queryByTestId("snapshot-manager")).toBeNull();
  });
});

describe("Report — PDF summary indhold", () => {
  it("indeholder scenarietype-badge med læsbar etikette", () => {
    renderReport();
    const header = screen.getByTestId("report-header");
    expect(header.textContent).toMatch(/Scenarietype:/);
  });

  it("forudsætningssektion er omdøbt og indeholder ingen inputfelter", () => {
    renderReport();
    const section = screen.getByTestId("assumptions-section");
    expect(section.textContent).toMatch(/Forudsætninger brugt i beregningen/);
    // Ingen form-controls (input/select/textarea/button) inde i forudsætningssektionen
    expect(within(section).queryAllByRole("textbox").length).toBe(0);
    expect(within(section).queryAllByRole("combobox").length).toBe(0);
    expect(within(section).queryAllByRole("button").length).toBe(0);
    expect(section.querySelectorAll("input,select,textarea").length).toBe(0);
  });

  it("indeholder disclaimer", () => {
    renderReport();
    const d = screen.getByTestId("disclaimer");
    expect(d.textContent).toMatch(/Disclaimer/);
    expect(d.textContent).toMatch(/ikke finansiel rådgivning/);
  });

  it("indeholder ingen rådgivnings-formuleringer (du bør / det anbefales / næste skridt)", () => {
    renderReport();
    const root = screen.getByTestId("report-root");
    // Snapshot-manager kan have UI-tekst, men selve rapportkroppen må ikke rådgive.
    // Vi tjekker kun de print-relevante sektioner.
    const sections = [
      screen.getByTestId("report-header"),
      screen.getByTestId("assumptions-section"),
      screen.getByTestId("disclaimer"),
    ];
    for (const s of sections) {
      const t = (s.textContent ?? "").toLowerCase();
      expect(t).not.toMatch(/du bør/);
      expect(t).not.toMatch(/det anbefales/);
      expect(t).not.toMatch(/næste skridt/);
    }
    expect(root).toBeTruthy();
  });

  it("top-actions og snapshot-manager har print:hidden så de ikke kommer med i PDF", () => {
    renderReport();
    expect(screen.getByTestId("report-actions").className).toMatch(/print:hidden/);
    expect(screen.getByTestId("snapshot-manager").className).toMatch(/print:hidden/);
  });
});

describe("Report — snapshot bruger frosne data, live bruger resolved scenario", () => {
  it("snapshot-rapport viser frosset stopAge selv efter basecase ændres", () => {
    const baseId = useFinanceStore.getState().activeScenarioId;
    const beforeStop = useFinanceStore.getState().scenarios[0].inputs.stopAge;
    const id = useFinanceStore.getState().saveSnapshot({ name: "frys" });

    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, stopAge: beforeStop + 10 },
    }));

    renderReport(`/report?snapshot=${id}`);
    const section = screen.getByTestId("assumptions-section");
    expect(section.textContent).toContain(`${beforeStop} år`);
  });
});
