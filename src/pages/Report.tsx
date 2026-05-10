import { useMemo } from "react";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { deriveKPIs } from "@/lib/finance/kpis";
import { sanityChecks } from "@/lib/finance/sanity";
import { Button } from "@/components/ui/button";
import { formatDKK } from "@/lib/format";
import { MODEL_RELEASE, MODEL_VERSION } from "@/lib/finance/types";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";

const SP_METHOD_LABEL = {
  none: "Ingen folkepension",
  baseOnly: "Kun grundbeløb (brutto − skat)",
  manualNet: "Manuelt nettobeløb",
} as const;

const SCENARIO_TYPE_LABEL = {
  base: "Base case",
  linked_stress_test: "Linket stress-test",
  custom: "Custom scenarie",
} as const;

const STOP_RULE_LABEL = {
  stopAge: "Stop ved jobstop / stopalder",
  fullRetireAge: "Stop ved fuld pension",
  customAge: "Stop ved brugerdefineret alder",
  never: "Fortsæt hele livet",
} as const;

function statusLabel(s: ReturnType<typeof deriveKPIs>["modelStatus"]) {
  if (s === "valid") return "Validt";
  if (s === "target_missed") return "Validt — minimumsmål ikke opfyldt";
  return "Ugyldigt";
}

export default function Report() {
  const scenario = useResolvedActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);

  const { kpis, chartData, checks } = useMemo(() => {
    const ys = project(scenario, assumptions);
    return {
      kpis: deriveKPIs(scenario, ys, assumptions),
      checks: sanityChecks(scenario, ys),
      chartData: ys.map((y) => ({
        age: y.age,
        Fri: Math.round(y.closing.free),
        Buffer: Math.round(y.closing.buffer),
        Pension: Math.round(y.closing.pension),
        Holding: Math.round(y.closing.holding),
        Nettoformue: Math.round(y.netWorth),
      })),
    };
  }, [scenario, assumptions]);

  const reportDate = new Date().toLocaleDateString("da-DK", { year: "numeric", month: "long", day: "numeric" });
  const inputs = scenario.inputs;

  return (
    <div className="report-page max-w-[820px] mx-auto p-10 print:p-0 bg-background text-foreground">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← Tilbage til dashboard</Link>
        <Button onClick={() => window.print()}>Print / Gem som PDF</Button>
      </div>

      <header className="border-b border-border pb-4 mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Personlig fremskrivning · Rapport</div>
        <h1 className="font-display text-3xl font-semibold mt-1">{scenario.name}</h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-2">
          <span>Rapportdato: {reportDate}</span>
          <span>Modelversion: {MODEL_RELEASE} (skema v{MODEL_VERSION})</span>
          <span>Folkepension: {SP_METHOD_LABEL[inputs.income.statePension.mode]}</span>
        </div>
      </header>

      <section className="mb-6">
        <h2 className="font-display text-lg font-semibold mb-2">Modelstatus</h2>
        <div className="text-sm">
          <strong>{statusLabel(kpis.modelStatus)}.</strong> {kpis.modelStatusReason}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-display text-lg font-semibold mb-2">Nøgletal</h2>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {[
              ["Planlagt stopalder", `${kpis.plannedStopAge} år`],
              ["Tidligste bæredygtige stop", kpis.earliestSustainableStopAge ? `${kpis.earliestSustainableStopAge} år` : "—"],
              ["Kapital v. stop", formatDKK(kpis.capitalAtStopAge, { compact: true })],
              ["Kapital v. 65", formatDKK(kpis.capitalAt65, { compact: true })],
              ["Kapital v. 95", formatDKK(kpis.capitalAt95, { compact: true })],
              ["Minimumsmål v. slutalder", formatDKK(kpis.minNetWorthAtEnd, { compact: true })],
              ["Første privat cashflow-shortfall", kpis.firstShortfallAge ? `Alder ${kpis.firstShortfallAge}` : "Ingen"],
              ["Første finansieringsproblem", kpis.firstFinancingIssueAge ? `${kpis.firstFinancingIssueKind} fra alder ${kpis.firstFinancingIssueAge}` : "Ingen"],
              ["Finansiel robusthed", `${kpis.financialRobustness} / 100`],
              ["Antagelsessikkerhed", `${kpis.assumptionConfidence} / 100`],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-border">
                <td className="py-1.5 pr-4 text-muted-foreground">{label}</td>
                <td className="py-1.5 text-right num font-medium">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6 break-inside-avoid">
        <h2 className="font-display text-lg font-semibold mb-2">Kapitaludvikling</h2>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="age" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatDKK(v, { compact: true })} width={80} />
              <Tooltip formatter={(v: number) => formatDKK(v, { compact: true })} labelFormatter={(l) => `Alder ${l}`} />
              <Legend />
              <Area type="monotone" dataKey="Fri" stackId="1" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.3)" />
              <Area type="monotone" dataKey="Buffer" stackId="1" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted))" />
              <Area type="monotone" dataKey="Pension" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.25)" />
              <Area type="monotone" dataKey="Holding" stackId="1" stroke="hsl(var(--success))" fill="hsl(var(--success) / 0.25)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mb-6 break-inside-avoid">
        <h2 className="font-display text-lg font-semibold mb-2">Vigtigste inputs</h2>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {[
              ["Nuværende alder", `${inputs.person.currentAge} år`],
              ["Forventet levetid", `${inputs.person.lifeExpectancy} år`],
              ["Stopalder (job)", `${inputs.stopAge} år`],
              ["Fuldt pensioneret", `${inputs.fullRetireAge} år`],
              ["Ønsket forbrug (netto/md)", formatDKK(inputs.spending.desiredMonthlyNet)],
              ["Bruttoløn", formatDKK(inputs.income.salaryGross)],
              ["Fri kapital — saldo", formatDKK(inputs.free.balance, { compact: true })],
              ["Fri kapital — månedlig opsparing", formatDKK(inputs.free.monthlyContribution)],
              ["Pension — saldo", formatDKK(inputs.pension.balance, { compact: true })],
              ["Holding — saldo", formatDKK(inputs.holding.balance, { compact: true })],
              ["Holding — forventet exit", formatDKK(inputs.holding.expectedExitValue, { compact: true })],
              ["Sparelogik", inputs.savingsLogic],
              ["Antal gældsposter", String(inputs.debts.length)],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-border">
                <td className="py-1.5 pr-4 text-muted-foreground">{label}</td>
                <td className="py-1.5 text-right num">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {checks.length > 0 && (
        <section className="mb-6 break-inside-avoid">
          <h2 className="font-display text-lg font-semibold mb-2">Input sanity check</h2>
          <ul className="space-y-1.5 text-sm">
            {checks.map((c) => (
              <li key={c.id} className="border-l-2 pl-2 border-border">
                <strong>{c.title}.</strong> {c.detail && <span className="text-muted-foreground">{c.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground leading-relaxed">
        <strong>Disclaimer:</strong> Denne rapport er en personlig fremskrivning baseret på dine egne input og antagelser.
        Den er ikke finansiel rådgivning, indeholder forsimplinger og kan afvige væsentligt fra det faktiske forløb.
        Brug rapporten som arbejdsredskab — ikke som beslutningsgrundlag for investeringer eller pension.
      </section>
    </div>
  );
}
