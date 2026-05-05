import { useMemo } from "react";
import { useFinanceStore } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { deriveKPIs } from "@/lib/finance/kpis";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDKK } from "@/lib/format";
import { Trash2 } from "lucide-react";
import { Scenario } from "@/lib/finance/types";

type StressMod = { suffix: string; apply: (s: Scenario) => void };

const STRESS_TESTS: { key: string; label: string; mod: StressMod }[] = [
  {
    key: "no-barma",
    label: "No Barma",
    mod: {
      suffix: "uden Barma",
      apply: (s) => {
        s.inputs.holding.balance = 0;
        s.inputs.holding.expectedExitValue = 0;
        s.inputs.holding.annualDistribution = 0;
      },
    },
  },
  {
    key: "no-parttime",
    label: "No part-time",
    mod: {
      suffix: "uden deltid",
      apply: (s) => {
        s.inputs.income.partTime.grossAnnual = 0;
        s.inputs.income.partTime.netMonthly = 0;
        s.inputs.fullRetireAge = s.inputs.stopAge;
      },
    },
  },
  {
    key: "low-return",
    label: "Low return",
    mod: {
      suffix: "lavt afkast",
      apply: (s) => {
        s.assumptionsOverride = {
          ...(s.assumptionsOverride ?? {}),
          realReturn: { free: 0.02, pension: 0.02, holding: 0.01 },
        };
      },
    },
  },
  {
    key: "higher-spending",
    label: "Higher spending",
    mod: {
      suffix: "højere forbrug",
      apply: (s) => {
        s.inputs.spending.desiredMonthlyNet = Math.round(s.inputs.spending.desiredMonthlyNet * 1.25);
      },
    },
  },
  {
    key: "no-folkepension",
    label: "No folkepension",
    mod: {
      suffix: "uden folkepension",
      apply: (s) => {
        s.inputs.income.statePension.mode = "none";
      },
    },
  },
];

export default function Scenarios() {
  const scenarios = useFinanceStore((s) => s.scenarios);
  const assumptions = useFinanceStore((s) => s.assumptions);
  const setActive = useFinanceStore((s) => s.setActive);
  const activeId = useFinanceStore((s) => s.activeScenarioId);
  const duplicate = useFinanceStore((s) => s.duplicateScenario);
  const del = useFinanceStore((s) => s.deleteScenario);
  const add = useFinanceStore((s) => s.addScenario);
  const updateScenario = useFinanceStore((s) => s.updateScenario);

  const runStress = (key: string) => {
    const test = STRESS_TESTS.find((t) => t.key === key);
    if (!test) return;
    const sourceId = activeId;
    const sourceName = scenarios.find((s) => s.id === sourceId)?.name ?? "Base";
    const newId = add(`${sourceName} – ${test.mod.suffix}`, sourceId);
    updateScenario(newId, (s) => {
      const copy = structuredClone(s);
      test.mod.apply(copy);
      return copy;
    });
  };

  const rows = useMemo(
    () =>
      scenarios.map((s) => {
        const years = project(s, assumptions);
        return { scenario: s, kpis: deriveKPIs(s, years, assumptions) };
      }),
    [scenarios, assumptions],
  );

  const metrics = [
    { key: "plannedStopAge", label: "Planlagt stop", fmt: (v: number) => `${v} år`, better: "lower" },
    { key: "earliestSustainableStopAge", label: "Tidligste bæredygtige stop", fmt: (v: number | null) => (v ? `${v} år` : "—"), better: "lower" },
    { key: "capitalAtStopAge", label: "Kapital v. stop", fmt: (v: number) => formatDKK(v, { compact: true }), better: "higher" },
    { key: "capitalAt65", label: "Kapital v. 65", fmt: (v: number) => formatDKK(v, { compact: true }), better: "higher" },
    { key: "capitalAt95", label: "Kapital v. 95", fmt: (v: number) => formatDKK(v, { compact: true }), better: "higher" },
    { key: "firstShortfallAge", label: "Første shortfall", fmt: (v: number | null) => (v ? `Alder ${v}` : "Ingen"), better: "higher" },
    { key: "monthlyGapAfterStop", label: "Mdl. hul efter stop", fmt: (v: number) => formatDKK(v, { compact: true }), better: "lower" },
    { key: "robustnessScore", label: "Robusthed", fmt: (v: number) => `${v}/100`, better: "higher" },
  ] as const;

  const best = (metricKey: string, better: "higher" | "lower") => {
    const values = rows.map((r) => (r.kpis as any)[metricKey]).filter((v) => v !== null && v !== undefined);
    if (values.length === 0) return null;
    return better === "higher" ? Math.max(...values) : Math.min(...values);
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
            <Button key={t.key} size="sm" variant="outline" onClick={() => runStress(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-4 text-xs uppercase tracking-wider text-muted-foreground">Nøgletal</th>
              {rows.map(({ scenario }) => (
                <th key={scenario.id} className="text-right p-4 min-w-[180px]">
                  <button
                    className={`block w-full text-right ${scenario.id === activeId ? "text-accent" : ""}`}
                    onClick={() => setActive(scenario.id)}
                  >
                    <div className="font-display text-base font-semibold truncate">{scenario.name}</div>
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
              const bestVal = best(m.key, m.better as any);
              return (
                <tr key={m.key} className="border-t border-border">
                  <td className="p-4 text-muted-foreground">{m.label}</td>
                  {rows.map(({ scenario, kpis }) => {
                    const v = (kpis as any)[m.key];
                    const isBest = bestVal !== null && v === bestVal && rows.length > 1;
                    return (
                      <td key={scenario.id} className={`p-4 text-right num ${isBest ? "text-accent font-semibold" : ""}`}>
                        {m.fmt(v as never)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t border-border bg-muted/30">
              <td className="p-4 text-muted-foreground text-xs">Forudsætninger</td>
              {rows.map(({ scenario }) => (
                <td key={scenario.id} className="p-4 text-right text-xs text-muted-foreground">
                  Alder {scenario.inputs.person.currentAge} → stop {scenario.inputs.stopAge}
                  <br />
                  Forbrug {formatDKK(scenario.inputs.spending.desiredMonthlyNet, { compact: true })}/md
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
