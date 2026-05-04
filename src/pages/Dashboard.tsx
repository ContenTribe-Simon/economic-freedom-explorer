import { useMemo } from "react";
import { useActiveScenario, useFinanceStore } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { deriveKPIs } from "@/lib/finance/kpis";
import { Card } from "@/components/ui/card";
import { formatDKK } from "@/lib/format";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function KPI({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" }) {
  const toneClass =
    tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <Card className="p-5">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value mt-2 ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const scenario = useActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);

  const { years, kpis, chartData } = useMemo(() => {
    const ys = project(scenario, assumptions);
    return {
      years: ys,
      kpis: deriveKPIs(scenario, ys, assumptions),
      chartData: ys.map((y) => ({
        age: y.age,
        Fri: Math.round(y.closing.free),
        Pension: Math.round(y.closing.pension),
        Holding: Math.round(y.closing.holding),
        Forbrug: Math.round(y.flows.spending),
        Nettoformue: Math.round(y.netWorth),
      })),
    };
  }, [scenario, assumptions]);

  const robustnessTone = kpis.robustnessScore >= 70 ? "good" : kpis.robustnessScore >= 40 ? "warn" : "bad";

  return (
    <div className="space-y-8">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Aktivt scenarie</div>
        <h1 className="font-display text-4xl font-semibold mt-1">{scenario.name}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Alle beløb i nutidskroner (realværdi). Skat og afkast styres under <em>Antagelser</em>.
        </p>
      </header>

      {kpis.firstShortfallAge !== null && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive-foreground/90 rounded-md p-4 text-sm">
          <strong className="text-destructive">Shortfall ved alder {kpis.firstShortfallAge}.</strong>{" "}
          Kapitalen rækker ikke til det ønskede forbrug. Justér stopalder, forbrug, afkast eller indbetalinger.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI
          label="Planlagt stopalder"
          value={`${kpis.plannedStopAge} år`}
          sub="Som angivet i variabler"
        />
        <KPI
          label="Tidligste bæredygtige stop"
          value={kpis.earliestSustainableStopAge ? `${kpis.earliestSustainableStopAge} år` : "—"}
          sub="Holder til levealder uden shortfall"
          tone={
            kpis.earliestSustainableStopAge && kpis.earliestSustainableStopAge <= kpis.plannedStopAge
              ? "good"
              : "warn"
          }
        />
        <KPI label="Kapital v. stop" value={formatDKK(kpis.capitalAtStopAge, { compact: true })} sub={`Alder ${scenario.inputs.stopAge}`} />
        <KPI label="Kapital v. 65" value={formatDKK(kpis.capitalAt65, { compact: true })} />
        <KPI label="Kapital v. 95" value={formatDKK(kpis.capitalAt95, { compact: true })} tone={kpis.capitalAt95 > 0 ? "good" : "bad"} />
        <KPI
          label="Første shortfall"
          value={kpis.firstShortfallAge ? `Alder ${kpis.firstShortfallAge}` : "Ingen"}
          tone={kpis.firstShortfallAge ? "bad" : "good"}
        />
        <KPI label="Mdl. hul efter stop" value={formatDKK(kpis.monthlyGapAfterStop, { compact: true })} />
        <KPI label="Robusthed" value={`${kpis.robustnessScore} / 100`} tone={robustnessTone} />
        <KPI label="År simuleret" value={`${years.length}`} />
      </div>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold mb-4">Kapitaludvikling</h2>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="g-free" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="g-pension" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="g-holding" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="age" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatDKK(v, { compact: true })} width={90} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: number) => formatDKK(v, { compact: true })}
                labelFormatter={(l) => `Alder ${l}`}
              />
              <Legend />
              <Area type="monotone" dataKey="Fri" stackId="1" stroke="hsl(var(--accent))" fill="url(#g-free)" />
              <Area type="monotone" dataKey="Pension" stackId="1" stroke="hsl(var(--primary))" fill="url(#g-pension)" />
              <Area type="monotone" dataKey="Holding" stackId="1" stroke="hsl(var(--success))" fill="url(#g-holding)" />
              <Line type="monotone" dataKey="Forbrug" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
