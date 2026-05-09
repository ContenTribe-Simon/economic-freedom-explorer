import { useMemo } from "react";
import { useFinanceStore } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { deriveKPIs } from "@/lib/finance/kpis";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDKK } from "@/lib/format";
import { Trash2, Link2, Pencil, GitBranch } from "lucide-react";
import { resolveScenario, STRESS_TESTS } from "@/lib/finance/stress";
import { Badge } from "@/components/ui/badge";

export default function Scenarios() {
  const scenarios = useFinanceStore((s) => s.scenarios);
  const assumptions = useFinanceStore((s) => s.assumptions);
  const setActive = useFinanceStore((s) => s.setActive);
  const activeId = useFinanceStore((s) => s.activeScenarioId);
  const duplicate = useFinanceStore((s) => s.duplicateScenario);
  const del = useFinanceStore((s) => s.deleteScenario);
  const add = useFinanceStore((s) => s.addScenario);
  const applyStressModifier = useFinanceStore((s) => s.applyStressModifier);
  const convertToCustom = useFinanceStore((s) => s.convertToCustom);
  const rebase = useFinanceStore((s) => s.rebaseOnCurrentBase);

  const runStress = (key: string) => {
    const test = STRESS_TESTS.find((t) => t.key === key);
    if (!test) return;
    applyStressModifier(test.key);
  };

  const activeScenario = scenarios.find((s) => s.id === activeId);

  const rows = useMemo(
    () =>
      scenarios.map((s) => {
        const years = project(s, assumptions);
        return { scenario: s, kpis: deriveKPIs(s, years, assumptions) };
      }),
    [scenarios, assumptions],
  );

  type Metric = {
    key: string;
    label: string;
    fmt: (v: any, k?: any) => string;
    better: "higher" | "lower";
    raw?: (k: any) => number;
  };
  const metrics: Metric[] = [
    {
      key: "modelStatus",
      label: "Modelstatus",
      fmt: (_v, k) => {
        if (k?.modelStatus === "invalid") {
          const parts: string[] = [];
          if (k.firstShortfallAge) parts.push(`Cashflow-shortfall fra alder ${k.firstShortfallAge}`);
          if (k.firstFinancingIssueAge) parts.push(`${k.firstFinancingIssueKind} fra alder ${k.firstFinancingIssueAge}`);
          return `Ugyldig — ${parts.join("; ") || "se dashboard"}`;
        }
        if (k?.modelStatus === "target_missed") return "Valid, men mål ikke opfyldt";
        return "Valid";
      },
      better: "lower",
      raw: (k) => (k.modelStatus === "valid" ? 0 : k.modelStatus === "target_missed" ? 1 : 2),
    },
    { key: "plannedStopAge", label: "Planlagt stop", fmt: (v) => `${v} år`, better: "lower" },
    { key: "earliestSustainableStopAge", label: "Tidligste bæredygtige stop", fmt: (v) => (v ? `${v} år` : "—"), better: "lower" },
    { key: "capitalAtStopAge", label: "Kapital v. stop", fmt: (v) => formatDKK(v, { compact: true }), better: "higher" },
    { key: "capitalAt65", label: "Kapital v. 65", fmt: (v) => formatDKK(v, { compact: true }), better: "higher" },
    { key: "capitalAt95", label: "Kapital v. 95", fmt: (v) => formatDKK(v, { compact: true }), better: "higher" },
    {
      key: "cashflowShortfall",
      label: "Første privat cashflow-shortfall",
      fmt: (_v, k) => (k?.firstShortfallAge ? `Fra alder ${k.firstShortfallAge}` : "Ingen"),
      better: "higher",
      raw: (k) => k.firstShortfallAge ?? 999,
    },
    {
      key: "financingIssue",
      label: "Første finansieringsproblem",
      fmt: (_v, k) => (k?.firstFinancingIssueAge ? `${k.firstFinancingIssueKind} fra alder ${k.firstFinancingIssueAge}` : "Ingen"),
      better: "higher",
      raw: (k) => k.firstFinancingIssueAge ?? 999,
    },
    {
      key: "minTargetStatus",
      label: "Minimumsmål v. slutalder",
      fmt: (_v, k) =>
        (k?.endShortfallVsTarget ?? 0) > 0.5
          ? `Mangler ${formatDKK(k.endShortfallVsTarget, { compact: true })}`
          : (k?.minNetWorthAtEnd ?? 0) > 0
            ? `Opfyldt (mål ${formatDKK(k.minNetWorthAtEnd, { compact: true })})`
            : "Intet mål sat",
      better: "lower",
      raw: (k) => k.endShortfallVsTarget ?? 0,
    },
    { key: "monthlyGapAfterStop", label: "Mdl. hul efter stop", fmt: (v) => formatDKK(v, { compact: true }), better: "lower" },
    { key: "robustnessScore", label: "Robusthed", fmt: (v) => `${v}/100`, better: "higher" },
    { key: "assumptionConfidence", label: "Antagelsessikkerhed", fmt: (v) => `${v}/100`, better: "higher" },
  ];

  const best = (m: Metric) => {
    const values = rows
      .map((r) => (m.raw ? m.raw(r.kpis) : (r.kpis as any)[m.key]))
      .filter((v) => v !== null && v !== undefined && Number.isFinite(v));
    if (values.length === 0) return null;
    return m.better === "higher" ? Math.max(...values) : Math.min(...values);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Scenarier</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Sammenlign side om side</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">Bedste værdi pr. række er fremhævet. Klik et scenarie for at gøre det aktivt.</p>
        </div>
        <Button onClick={() => add(`Scenarie ${scenarios.length + 1}`)}>+ Nyt scenarie</Button>
      </header>

      <Card className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Stress-tests</div>
        <p className="text-xs text-muted-foreground mb-3">
          Dupliker det aktive scenarie med en specifik ændring. Det nye scenarie tilføjes til sammenligningen herunder.
        </p>
        <div className="flex flex-wrap gap-2">
          {STRESS_TESTS.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={activeScenario?.modifiers?.[t.key] ? "secondary" : "outline"}
              disabled={Boolean(activeScenario?.modifiers?.[t.key])}
              onClick={() => runStress(t.key)}
            >
              {activeScenario?.modifiers?.[t.key] ? `${t.label} · aktiv` : t.label}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 text-xs uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/95 backdrop-blur z-10 min-w-[180px] border-b border-border">
                  Nøgletal
                </th>
                {rows.map(({ scenario }) => (
                  <th
                    key={scenario.id}
                    className={`text-right p-4 min-w-[200px] max-w-[240px] border-b border-border ${scenario.id === activeId ? "bg-accent/5" : ""}`}
                  >
                    <button
                      className={`block w-full text-right ${scenario.id === activeId ? "text-accent" : ""}`}
                      onClick={() => scenario.id !== activeId && setActive(scenario.id)}
                    >
                      <div className="font-display text-base font-semibold truncate" title={scenario.name}>
                        {scenario.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                        {scenario.id === activeId ? "Aktiv" : "Klik for aktiver"}
                      </div>
                    </button>
                    <div className="flex justify-end gap-1 mt-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => duplicate(scenario.id)}>Dupliker</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => del(scenario.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const bestVal = best(m);
                return (
                  <tr key={m.key}>
                    <td className="p-4 text-muted-foreground sticky left-0 bg-card z-10 border-t border-border">{m.label}</td>
                    {rows.map(({ scenario, kpis }) => {
                      const rawVal = m.raw ? m.raw(kpis) : (kpis as any)[m.key];
                      const isBest = bestVal !== null && rawVal === bestVal && rows.length > 1;
                      return (
                        <td
                          key={scenario.id}
                          className={`p-4 text-right num border-t border-border ${isBest ? "text-accent font-semibold" : ""} ${scenario.id === activeId ? "bg-accent/5" : ""}`}
                        >
                          {m.fmt((kpis as any)[m.key], kpis)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td className="p-4 text-muted-foreground text-xs sticky left-0 bg-muted/30 z-10 border-t border-border">Forudsætninger</td>
                {rows.map(({ scenario }) => (
                  <td key={scenario.id} className={`p-4 text-right text-xs text-muted-foreground border-t border-border bg-muted/30 ${scenario.id === activeId ? "bg-accent/5" : ""}`}>
                    Alder {scenario.inputs.person.currentAge} → stop {scenario.inputs.stopAge}
                    <br />
                    Forbrug {formatDKK(scenario.inputs.spending.desiredMonthlyNet, { compact: true })}/md
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
