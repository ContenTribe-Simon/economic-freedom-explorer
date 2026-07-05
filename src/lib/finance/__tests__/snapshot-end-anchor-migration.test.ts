/**
 * Snapshot end-anchor migration (engine anchor fix, persist v17).
 *
 * Snapshots are FROZEN: their kpis are never recomputed. But snapshots saved BEFORE the engine
 * anchor fix, with lifeExpectancy > 95, carry the interior age-95 value under `capitalAt95`,
 * while new snapshots carry the end-of-horizon value under the same field name — the Snapshots
 * comparison page would silently mix two different quantities under one label.
 *
 * The fix re-anchors ONLY the end-anchored kpi fields from the snapshot's OWN frozen YearRows
 * (no engine re-run, nothing else touched), in BOTH load paths: the zustand persist migration
 * (v16 -> v17) and importJson (which cloud loadModel() goes through and which never hits
 * persist-migrate).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { buildSnapshot, normalizeSnapshotEndAnchors } from "../snapshots";
import { useFinanceStore } from "@/store/financeStore";
import type { Snapshot } from "../types";

/** A REAL post-fix snapshot for the flip persona (LE 105, no shortfall, 80M target met at end). */
function realSnapshotLE105(): Snapshot {
  const s = makeBaseScenario();
  s.inputs.person.lifeExpectancy = 105;
  s.inputs.spending.desiredMonthlyNet = 15_000;
  s.inputs.target.minNetWorthAtEnd = 80_000_000;
  return buildSnapshot(s, [s], defaultAssumptions, { name: "LE105" });
}

/**
 * Forge the PRE-FIX shape from a real snapshot: exactly what the old engine persisted — the
 * end-anchored fields derived from the interior age-95 row of the SAME frozen years.
 */
function forgePreFix(snap: Snapshot): Snapshot {
  const pre = structuredClone(snap);
  const y95 = pre.years.find((y) => y.age === 95)!;
  const missing = Math.max(0, pre.kpis.minNetWorthAtEnd - y95.netWorth);
  pre.kpis.capitalAt95 = y95.netWorth;
  pre.kpis.endShortfallVsTarget = missing;
  pre.kpis.modelStatus = "target_missed";
  pre.kpis.modelStatusReason = `Scenariet er gyldigt, men minimumsmålet er ikke opfyldt — mangler ${Math.round(missing).toLocaleString("da-DK")} kr ved slutalder.`;
  pre.kpis.financialRobustness = 40; // the old engine's missed-cap (verified pre-fix baseline value)
  pre.kpis.robustnessScore = 40;
  return pre;
}

describe("normalizeSnapshotEndAnchors (pure)", () => {
  it("re-anchors a pre-fix lifeExpectancy>95 snapshot from its OWN frozen years, flipping target_missed -> valid", () => {
    const real = realSnapshotLE105();
    const pre = forgePreFix(real);
    const endNW = real.years[real.years.length - 1].netWorth;
    expect(pre.kpis.capitalAt95).not.toBe(endNW); // premise: the two quantities genuinely differ

    const fixed = normalizeSnapshotEndAnchors(pre);
    expect(fixed.kpis.capitalAt95).toBe(endNW);
    expect(fixed.kpis.endShortfallVsTarget).toBe(0);
    expect(fixed.kpis.modelStatus).toBe("valid");
    expect(fixed.kpis.modelStatusReason).toBe(
      "Scenariet er validt — ingen shortfall, ingen ufinansierede afdrag, mål opfyldt.",
    );
    // Frozen-ness: substance untouched — years, chartData, inputs, robustness breakdown texts.
    expect(fixed.years).toEqual(pre.years);
    expect(fixed.chartData).toEqual(pre.chartData);
    expect(fixed.resolvedInputs).toEqual(pre.resolvedInputs);
    expect(fixed.kpis.robustnessBreakdown).toEqual(pre.kpis.robustnessBreakdown);
    // The frozen (conservative) score is deliberately left as-is on the missed -> valid flip.
    expect(fixed.kpis.financialRobustness).toBe(40);
  });

  it("flips valid -> target_missed (and mirrors the engine's score cap) when the true end misses the target", () => {
    // The reverse divergence: a declining plan whose age-95 value cleared the target while the
    // true end value does not. Forged on the same frozen rows by raising the stored target.
    const real = realSnapshotLE105();
    const endNW = real.years[real.years.length - 1].netWorth;
    const pre = structuredClone(real);
    pre.kpis.minNetWorthAtEnd = endNW + 1_000_000;
    pre.kpis.modelStatus = "valid";
    pre.kpis.financialRobustness = 87;
    pre.kpis.robustnessScore = 87;

    const fixed = normalizeSnapshotEndAnchors(pre);
    expect(fixed.kpis.modelStatus).toBe("target_missed");
    expect(fixed.kpis.endShortfallVsTarget).toBe(1_000_000);
    expect(fixed.kpis.modelStatusReason).toContain("mangler 1.000.000 kr ved slutalder");
    expect(fixed.kpis.financialRobustness).toBeLessThanOrEqual(40);
    expect(fixed.kpis.robustnessScore).toBe(fixed.kpis.financialRobustness);
  });

  it("does NOT touch an invalid snapshot's status axis (shortfall reasons are not ours)", () => {
    const real = realSnapshotLE105();
    const pre = forgePreFix(real);
    pre.kpis.modelStatus = "invalid";
    pre.kpis.modelStatusReason = "Scenariet er ugyldigt: privat cashflow-shortfall fra alder 51 (≈ 54.252 kr).";
    const fixed = normalizeSnapshotEndAnchors(pre);
    expect(fixed.kpis.capitalAt95).toBe(real.years[real.years.length - 1].netWorth); // anchors still fixed
    expect(fixed.kpis.modelStatus).toBe("invalid"); // status axis untouched
    expect(fixed.kpis.modelStatusReason).toContain("cashflow-shortfall fra alder 51");
  });

  it("is a no-op (same object) for snapshots whose horizon is at or below 95", () => {
    const s = makeBaseScenario(); // lifeExpectancy 95
    const snap = buildSnapshot(s, [s], defaultAssumptions, { name: "LE95" });
    expect(normalizeSnapshotEndAnchors(snap)).toBe(snap); // identity — nothing rewritten
    const s90 = makeBaseScenario();
    s90.inputs.person.lifeExpectancy = 90;
    const snap90 = buildSnapshot(s90, [s90], defaultAssumptions, { name: "LE90" });
    expect(normalizeSnapshotEndAnchors(snap90)).toBe(snap90);
  });
});

describe("both load paths apply the normalization", () => {
  beforeEach(() => {
    localStorage.removeItem("finance-tool.v1");
  });

  it("persist migrate (v16 -> v17): a stored pre-fix snapshot is re-anchored on rehydrate", async () => {
    const pre = forgePreFix(realSnapshotLE105());
    localStorage.setItem(
      "finance-tool.v1",
      JSON.stringify({
        state: { scenarios: [], snapshots: [pre], countryProfiles: [] },
        version: 16,
      }),
    );
    await useFinanceStore.persist.rehydrate();
    const loaded = useFinanceStore.getState().snapshots.find((x) => x.snapshotId === pre.snapshotId);
    expect(loaded).toBeDefined();
    expect(loaded!.kpis.capitalAt95).toBe(pre.years[pre.years.length - 1].netWorth);
    expect(loaded!.kpis.modelStatus).toBe("valid");
    localStorage.removeItem("finance-tool.v1");
  });

  it("importJson (the cloud loadModel path, which never hits persist-migrate): same re-anchoring", () => {
    const real = realSnapshotLE105();
    const pre = forgePreFix(real);
    const s = makeBaseScenario();
    const payload = JSON.stringify({
      modelVersion: 1,
      scenarios: [s],
      assumptions: defaultAssumptions,
      activeScenarioId: s.id,
      snapshots: [pre],
    });
    useFinanceStore.getState().importJson(payload);
    const loaded = useFinanceStore.getState().snapshots.find((x) => x.snapshotId === pre.snapshotId);
    expect(loaded).toBeDefined();
    expect(loaded!.kpis.capitalAt95).toBe(real.years[real.years.length - 1].netWorth);
    expect(loaded!.kpis.endShortfallVsTarget).toBe(0);
    expect(loaded!.kpis.modelStatus).toBe("valid");
  });
});
