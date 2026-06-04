/**
 * ASK v1.1 — audit rendering & projection integration tests.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import type { AskInputs } from "../types";
import { AuditPanel } from "@/pages/Projection";

const baseAsk = (overrides: Partial<AskInputs> = {}): AskInputs => ({
  enabled: true,
  currentValue: 0,
  priorYearEndValue: 0,
  depositLimit: 174_200,
  taxRate: 0.17,
  autoFillFirst: true,
  taxCreditCarryForward: 0,
  taxPaymentMode: "deductFromASK",
  ...overrides,
});

function renderAudit(scenarioMutator: (s: ReturnType<typeof makeBaseScenario>) => void, yearIndex = 0) {
  const s = makeBaseScenario();
  scenarioMutator(s);
  const years = project(s, defaultAssumptions);
  const y = years[yearIndex];
  render(<AuditPanel y={y} inputs={s.inputs} onClose={() => {}} />);
  return { y, inputs: s.inputs };
}

describe("ASK audit rendering", () => {
  it("viser ASK-sektion når ask.enabled = true", () => {
    renderAudit((s) => {
      s.inputs.free.balance = 100_000;
      s.inputs.free.ask = baseAsk({ currentValue: 50_000, priorYearEndValue: 50_000 });
    });
    expect(screen.getByTestId("audit-ask")).toBeTruthy();
    expect(screen.getAllByText(/Aktiesparekonto \(ASK\)/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ASK primo/i)).toBeTruthy();
    expect(screen.getByText(/ASK ultimo/i)).toBeTruthy();
    expect(screen.getByText(/Resterende indskudsrum/i)).toBeTruthy();
  });

  it("skjuler ASK-sektion når ask er disabled", () => {
    renderAudit((s) => {
      s.inputs.free.balance = 100_000;
      s.inputs.free.ask = baseAsk({ enabled: false });
    });
    expect(screen.queryByTestId("audit-ask")).toBeNull();
  });

  it("viser allokering 'Heraf til ASK' og depot ved auto-fill", () => {
    renderAudit((s) => {
      s.inputs.free.balance = 0;
      s.inputs.free.monthlyContribution = 5_000;
      s.inputs.income.salaryGross = 600_000;
      s.inputs.free.ask = baseAsk({ autoFillFirst: true });
    });
    expect(screen.getByTestId("audit-ask-allocation")).toBeTruthy();
    expect(screen.getByText(/Heraf til ASK/i)).toBeTruthy();
    expect(screen.getByText(/Heraf til almindeligt frit depot/i)).toBeTruthy();
  });

  it("viser ASK-afkast og ASK-skat i vækst-sektionen", () => {
    renderAudit((s) => {
      s.inputs.free.balance = 200_000;
      s.inputs.free.ask = baseAsk({ currentValue: 100_000, priorYearEndValue: 100_000 });
    });
    expect(screen.getAllByText(/ASK-afkast før skat/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Vækst fri i alt \(efter ASK-skat\)/i)).toBeTruthy();
  });
});

describe("ASK consistency", () => {
  it("closing.free == ASK ultimo + depot ultimo", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 250_000;
    s.inputs.free.ask = baseAsk({
      currentValue: 100_000,
      priorYearEndValue: 100_000,
      autoFillFirst: true,
    });
    const years = project(s, defaultAssumptions);
    for (const y of years.slice(0, 10)) {
      expect(y.closing.free).toBeCloseTo(y.flows.ask!.closing + y.flows.ask!.freeDepotClosing, 2);
    }
  });

  it("auto-fill: planlagt opsparing fylder ASK først indtil loft", () => {
    const s = makeBaseScenario();
    s.inputs.person.currentAge = 30;
    s.inputs.spending.desiredMonthlyNet = 1_000;
    s.inputs.free.balance = 10_000;
    s.inputs.free.monthlyContribution = 5_000;
    s.inputs.free.annualExtraContribution = 25_000;
    s.inputs.income.salaryGross = 800_000;
    s.inputs.free.ask = baseAsk({
      currentValue: 0,
      priorYearEndValue: 0,
      depositLimit: 174_200,
      autoFillFirst: true,
    });
    const years = project(s, defaultAssumptions);
    // ASK skal modtage planlagt opsparing først (op til loft 174.200)
    expect(years[0].flows.ask!.contribution).toBeGreaterThan(0);
    expect(years[0].flows.ask!.contribution).toBeLessThanOrEqual(174_200);
    expect(years[0].flows.ask!.contribution).toBeCloseTo(years[0].flows.investedAmount, 0);
  });
});

