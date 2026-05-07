import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { deriveKPIs, DEFAULT_CONFIDENCE, getConfidence } from "../kpis";

describe("confidence does not affect year-by-year projection", () => {
  it("identical year output regardless of confidence values", () => {
    const s1 = makeBaseScenario();
    const s2 = makeBaseScenario();
    s2.inputs.confidence = {
      ...DEFAULT_CONFIDENCE,
      holdingExit: "speculative",
      returns: "speculative",
      spending: "very_high",
    };
    const y1 = project(s1, defaultAssumptions);
    const y2 = project(s2, defaultAssumptions);
    expect(y1.length).toBe(y2.length);
    for (let i = 0; i < y1.length; i++) {
      expect(y2[i].netWorth).toBeCloseTo(y1[i].netWorth, 2);
      expect(y2[i].flows.spending).toBeCloseTo(y1[i].flows.spending, 2);
    }
  });

  it("scenario without confidence falls back to defaults without errors", () => {
    const s = makeBaseScenario();
    delete (s.inputs as any).confidence;
    const conf = getConfidence(s);
    expect(conf).toEqual(DEFAULT_CONFIDENCE);
    const years = project(s, defaultAssumptions);
    const k = deriveKPIs(s, years, defaultAssumptions);
    expect(k.assumptionConfidence).toBeGreaterThanOrEqual(0);
  });
});

describe("Sikkerhedsvurderinger UI placement", () => {
  it("is rendered on the Assumptions page, not on Inputs", async () => {
    const assumptionsSrc = await import("fs").then((fs) =>
      fs.readFileSync("src/pages/Assumptions.tsx", "utf8"),
    );
    const inputsSrc = await import("fs").then((fs) =>
      fs.readFileSync("src/pages/Inputs.tsx", "utf8"),
    );
    expect(assumptionsSrc).toMatch(/Sikkerhedsvurderinger/);
    expect(inputsSrc).not.toMatch(/Sikkerhedsvurderinger/);
  });
});

describe("Dashboard ScoreCards have independent expansion", () => {
  it("uses items-start so the grid does not stretch cards to equal height", async () => {
    const dashSrc = await import("fs").then((fs) =>
      fs.readFileSync("src/pages/Dashboard.tsx", "utf8"),
    );
    // Grid containing ScoreCards must use items-start (or self-start/h-fit on cards)
    expect(dashSrc).toMatch(/items-start/);
    // ScoreCard itself uses h-fit/self-start to avoid being stretched
    expect(dashSrc).toMatch(/h-fit/);
    // Each ScoreCard must own its open-state via useState (one per instance)
    expect(dashSrc).toMatch(/function ScoreCard\b[\s\S]*useState/);
  });
});
