/**
 * Advanced inputs page (2026-10-11): "Anden indtægt" list instead of the family-fund fields, and a
 * holding switch. Drives the real page against the real store.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Inputs from "@/pages/Inputs";
import { useFinanceStore } from "@/store/financeStore";
import { makeBaseScenario, makeNewUserScenario } from "@/lib/finance/defaults";
import type { IncomeInputs, Scenario } from "@/lib/finance/types";

function load(s: Scenario) {
  useFinanceStore.setState({ scenarios: [{ ...s, type: "base" }], activeScenarioId: s.id });
}
const active = () => useFinanceStore.getState().scenarios[0].inputs;

function renderInputs() {
  return render(
    <MemoryRouter>
      <Inputs />
    </MemoryRouter>,
  );
}

beforeEach(() => localStorage.clear());

describe("Anden indtægt", () => {
  it("a new user has no other income and can add one, choosing how it is taxed", () => {
    load(makeNewUserScenario());
    renderInputs();
    const section = screen.getByTestId("other-income-section");
    expect(within(section).getByText(/Ingen andre indtægter/)).toBeTruthy();
    expect(screen.queryByText(/Familiefond/)).toBeNull();

    fireEvent.click(within(section).getByRole("button", { name: "+ Tilføj indtægt" }));
    expect(active().income.otherIncomes).toHaveLength(1);
    expect(active().income.otherIncomes[0].taxation).toBe("net");

    fireEvent.change(within(section).getByLabelText("Beskatning"), { target: { value: "gross_labor" } });
    expect(active().income.otherIncomes[0].taxation).toBe("gross_labor");
    expect(within(section).getByText("Beløb brutto pr. år")).toBeTruthy();

    fireEvent.click(within(section).getByRole("button", { name: /Fjern/ }));
    expect(active().income.otherIncomes).toEqual([]);
  });

  it("a model still holding the old family-fund fields shows it as a list entry", () => {
    const s = makeBaseScenario();
    const { otherIncomes: _drop, ...rest } = s.inputs.income;
    s.inputs.income = { ...rest, familyFundAnnualNet: 50_000, familyFundUntilAge: 70 } as unknown as IncomeInputs;
    load(s);
    renderInputs();
    const section = screen.getByTestId("other-income-section");
    expect((within(section).getByLabelText("Navn") as HTMLInputElement).value).toBe("Familiefond");
  });
});

describe("holding switch", () => {
  it("a new user starts with holding off; switching it on shows the holding fields", () => {
    load(makeNewUserScenario());
    renderInputs();
    const section = screen.getByTestId("holding-section");
    const toggle = within(section).getByRole("switch", { name: "Jeg har en holding eller et selskab" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(within(section).queryByText("Nuværende holdingkapital")).toBeNull();
    expect(within(section).getByText(/Beregningen regner uden holding/)).toBeTruthy();

    fireEvent.click(toggle);
    expect(active().holding.enabled).toBe(true);
    expect(within(section).getByText("Nuværende holdingkapital")).toBeTruthy();
  });

  it("a model saved before the switch has holding on", () => {
    load(makeBaseScenario());
    renderInputs();
    const toggle = within(screen.getByTestId("holding-section")).getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});
