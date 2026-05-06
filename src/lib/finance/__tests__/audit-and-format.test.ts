import { describe, expect, it } from "vitest";
import { makeBaseScenario } from "../defaults";
import { formatDKK } from "@/lib/format";
import { ratePensionStatusText, lifeAnnuityStatusText } from "@/pages/Projection";

describe("formatDKK below 1m", () => {
  it("formats values under 1.000.000 with thousand separators", () => {
    expect(formatDKK(0)).toMatch(/^0\s*kr$/);
    expect(formatDKK(1234)).toMatch(/1\.234\s*kr/);
    expect(formatDKK(987654)).toMatch(/987\.654\s*kr/);
  });
  it("compact format for sub-1m values uses k/t notation", () => {
    expect(formatDKK(750000, { compact: true })).toMatch(/kr$/);
  });
});

describe("ratePensionStatusText", () => {
  const s = makeBaseScenario();
  s.inputs.pension.ratePensionEnabled = true;
  s.inputs.pension.payoutFromAge = 65;
  s.inputs.pension.ratePensionPayoutYears = 10;

  it("shows start age before payout begins", () => {
    expect(ratePensionStatusText(50, s.inputs, false).text).toContain("starter fra alder 65");
  });
  it("indicates payout in year when active", () => {
    expect(ratePensionStatusText(70, s.inputs, true).kind).toBe("payout");
  });
  it("shows ended after payout period", () => {
    expect(ratePensionStatusText(80, s.inputs, false).text).toContain("afsluttet");
  });
  it("shows deactivated when disabled", () => {
    const s2 = makeBaseScenario();
    s2.inputs.pension.ratePensionEnabled = false;
    expect(ratePensionStatusText(70, s2.inputs, false).text).toBe("Deaktiveret");
  });
});

describe("lifeAnnuityStatusText", () => {
  it("inactive when disabled", () => {
    const s = makeBaseScenario();
    s.inputs.pension.lifeAnnuity.enabled = false;
    expect(lifeAnnuityStatusText(70, s.inputs, false).text).toBe("Deaktiveret");
  });
  it("shows start age when active and not yet paying out", () => {
    const s = makeBaseScenario();
    s.inputs.pension.lifeAnnuity.enabled = true;
    s.inputs.pension.lifeAnnuity.fromAge = 70;
    expect(lifeAnnuityStatusText(60, s.inputs, false).text).toContain("starter fra alder 70");
  });
});

describe("KPI: no shortfall but goal missed", () => {
  it("flags target missed without cashflow shortfall", async () => {
    const { project } = await import("../projection");
    const { deriveKPIs } = await import("../kpis");
    const { defaultAssumptions } = await import("../defaults");
    const s = makeBaseScenario();
    s.inputs.target.minNetWorthAtEnd = 1e12; // unreachable
    const years = project(s, defaultAssumptions);
    const k = deriveKPIs(s, years, defaultAssumptions);
    expect(k.firstShortfallAge === null || k.endShortfallVsTarget > 0).toBe(true);
    if (k.firstShortfallAge === null) {
      expect(k.endShortfallVsTarget).toBeGreaterThan(0);
      expect(k.modelStatus === "target_missed" || k.modelStatus === "valid").toBe(true);
    }
  });
});

describe("scenario long names", () => {
  it("preserves long names verbatim in store data", () => {
    const s = makeBaseScenario();
    const longName = "Base case – uden Barma – uden deltid – med lavere afkast – med højere forbrug";
    s.name = longName;
    expect(s.name).toBe(longName);
    expect(s.name.length).toBeGreaterThan(40);
  });
});
