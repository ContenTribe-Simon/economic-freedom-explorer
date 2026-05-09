import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project, resolvePlannedContributionStopAge } from "../projection";

describe("planlagt fri opsparing — stopregel", () => {
  it("default = stopAge: planned er 0 og inaktiv efter stopalder", () => {
    const s = makeBaseScenario();
    s.inputs.free.contributionStopRule = "stopAge";
    const years = project(s, defaultAssumptions);
    const after = years.find((y) => y.age === Math.max(s.inputs.stopAge + 5, 70))!;
    expect(after.flows.plannedContributionsActive).toBe(false);
    expect(after.flows.plannedFreeContribution).toBe(0);
    expect(after.flows.plannedContributionStopAge).toBe(s.inputs.stopAge);
  });

  it("never: planned forbliver aktiv hele livet", () => {
    const s = makeBaseScenario();
    s.inputs.free.contributionStopRule = "never";
    const raw = s.inputs.free.monthlyContribution * 12 + s.inputs.free.annualExtraContribution;
    const years = project(s, defaultAssumptions);
    const late = years[years.length - 1];
    expect(late.flows.plannedContributionsActive).toBe(true);
    expect(late.flows.plannedFreeContribution).toBe(raw);
    expect(late.flows.plannedContributionStopAge).toBeNull();
  });

  it("customAge: stopper ved valgt alder", () => {
    const s = makeBaseScenario();
    s.inputs.free.contributionStopRule = "customAge";
    s.inputs.free.contributionStopAge = 75;
    const years = project(s, defaultAssumptions);
    expect(years.find((y) => y.age === 74)!.flows.plannedContributionsActive).toBe(true);
    expect(years.find((y) => y.age === 75)!.flows.plannedContributionsActive).toBe(false);
    expect(years.find((y) => y.age === 92)!.flows.plannedFreeContribution).toBe(0);
  });

  it("resolvePlannedContributionStopAge mapper korrekt", () => {
    const s = makeBaseScenario();
    s.inputs.free.contributionStopRule = "fullRetireAge";
    expect(resolvePlannedContributionStopAge(s.inputs, s.inputs.stopAge)).toBe(s.inputs.fullRetireAge);
    s.inputs.free.contributionStopRule = "never";
    expect(resolvePlannedContributionStopAge(s.inputs, s.inputs.stopAge)).toBeNull();
  });
});
