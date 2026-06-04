import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FireMilestoneMap } from "@/components/FireMilestoneMap";
import type { FireAnalysis, FireResult, FireType } from "@/lib/finance/fire";

function makeResult(type: FireType, overrides: Partial<FireResult> = {}): FireResult {
  return {
    type,
    label: { coast: "Coast FI", lean: "Lean FI", standard: "Standard FI", fat: "Fat FI", barista: "Barista FI" }[type],
    description: "",
    capitalRequired: 1_000_000,
    capitalAvailable: 500_000,
    achievedAtAge: null,
    gap: 500_000,
    gapPct: 0.5,
    bestPoint: null,
    status: "not_achieved",
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<Record<FireType, Partial<FireResult>>> = {}): FireAnalysis {
  const results: Record<FireType, FireResult> = {
    coast: makeResult("coast", overrides.coast),
    lean: makeResult("lean", overrides.lean),
    standard: makeResult("standard", overrides.standard),
    fat: makeResult("fat", overrides.fat),
    barista: makeResult("barista", overrides.barista),
  };
  return {
    assumptions: {} as any,
    annualSpending: 360000,
    standardFiNumber: 1_000_000,
    results,
    nearestMilestone: null,
    earliestFireAge: null,
    yearStatus: [],
    dependence: { freeShare: 1, pensionShare: 0, holdingShare: 0 },
    capitalBreakdown: {} as any,
    benchmarks: [],
    sustainableNow: { referenceAge: 40, capitalIncluded: 0, rates: [] },
    spendingReductions: [],
    summary: { nearestType: null, nearestAge: null, smallestUnachievedGap: null, keyDriver: "spending" },
    monthlyGapAfterStop: 0,
  };
}

describe("FireMilestoneMap", () => {
  it("renders all five FIRE levels", () => {
    render(<FireMilestoneMap analysis={makeAnalysis()} currentAge={40} plannedStopAge={55} fullPensionAge={68} />);
    expect(screen.getByTestId("milestone-card-coast")).toBeInTheDocument();
    expect(screen.getByTestId("milestone-card-barista")).toBeInTheDocument();
    expect(screen.getByTestId("milestone-card-lean")).toBeInTheDocument();
    expect(screen.getByTestId("milestone-card-standard")).toBeInTheDocument();
    expect(screen.getByTestId("milestone-card-fat")).toBeInTheDocument();
  });

  it("progress is 50% when capital is half of requirement", () => {
    const a = makeAnalysis({ standard: { capitalAvailable: 500_000, capitalRequired: 1_000_000 } });
    render(<FireMilestoneMap analysis={a} currentAge={40} />);
    const bar = screen.getByTestId("milestone-progress-standard");
    expect(parseFloat(bar.getAttribute("data-progress")!)).toBeCloseTo(50, 1);
    expect(screen.getByTestId("milestone-progress-label-standard").textContent).toContain("50");
  });

  it("progress bar capped at 100% but label can exceed", () => {
    const a = makeAnalysis({ lean: { capitalAvailable: 1_240_000, capitalRequired: 1_000_000, gap: 0 } });
    render(<FireMilestoneMap analysis={a} currentAge={40} />);
    const bar = screen.getByTestId("milestone-progress-lean");
    expect(parseFloat(bar.getAttribute("data-progress")!)).toBeLessThanOrEqual(100);
    expect(screen.getByTestId("milestone-progress-label-lean").textContent).toContain("124");
  });

  it("shows 'Opnået' when level achieved at current age", () => {
    const a = makeAnalysis({ coast: { achievedAtAge: 40, status: "achieved", gap: 0, capitalAvailable: 1_000_000 } });
    render(<FireMilestoneMap analysis={a} currentAge={40} />);
    expect(screen.getByTestId("milestone-badge-coast").textContent).toBe("Opnået");
  });

  it("shows 'Opnås ved alder X' when achieved later", () => {
    const a = makeAnalysis({ standard: { achievedAtAge: 52, status: "achieved_at_age" } });
    render(<FireMilestoneMap analysis={a} currentAge={40} />);
    expect(screen.getByTestId("milestone-badge-standard").textContent).toContain("52");
  });

  it("shows 'Ikke opnået' when never achieved", () => {
    const a = makeAnalysis();
    render(<FireMilestoneMap analysis={a} currentAge={40} />);
    expect(screen.getByTestId("milestone-badge-fat").textContent).toBe("Ikke opnået");
  });

  it("timeline shows dots only for achieved levels and lists not-achieved", () => {
    const a = makeAnalysis({
      coast: { achievedAtAge: 45 },
      standard: { achievedAtAge: 55 },
    });
    render(<FireMilestoneMap analysis={a} currentAge={40} plannedStopAge={55} fullPensionAge={68} />);
    expect(screen.getByTestId("timeline-dot-coast")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-dot-standard")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-dot-fat")).toBeNull();
    expect(screen.getByTestId("timeline-ref-now")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-ref-stop")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-ref-pension")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-not-achieved").textContent).toContain("Fat FI");
  });

  it("does not crash with zero capitalRequired", () => {
    const a = makeAnalysis({ coast: { capitalRequired: 0, capitalAvailable: 0, gap: 0 } });
    render(<FireMilestoneMap analysis={a} currentAge={40} />);
    expect(screen.getByTestId("milestone-card-coast")).toBeInTheDocument();
  });

  it("conclusion mentions next milestone gap when nothing achieved", () => {
    render(<FireMilestoneMap analysis={makeAnalysis()} currentAge={40} />);
    expect(screen.getByTestId("milestone-conclusion").textContent).toContain("Coast FI");
  });
});
