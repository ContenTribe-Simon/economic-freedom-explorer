import { ReactNode, useMemo, useState } from "react";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { deriveKPIs, scoreVerdict, LEVEL_LABELS } from "@/lib/finance/kpis";
import { sanityChecks } from "@/lib/finance/sanity";
import { computeFireAnalysis } from "@/lib/finance/fire";
import { Card } from "@/components/ui/card";
import { formatDKK } from "@/lib/format";
import { ChevronDown } from "lucide-react";
import type { ConfidenceFactor, ScoreFactor } from "@/lib/finance/types";
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

function KPI({ label, value, sub, tone, tooltip }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn"; tooltip?: string }) {
  const toneClass =
    tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <Card className="p-5" title={tooltip}>
      <div className="kpi-label flex items-center gap-1">
        {label}
        {tooltip && <span className="text-muted-foreground text-[10px] cursor-help">ⓘ</span>}
      </div>
      <div className={`kpi-value mt-2 ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function ScoreCard({
  label, score, summary, tone, what, details, testIdPrefix,
}: {
  label: string; score: number; summary: string;
  tone: "good" | "warn" | "bad"; what: string; details: ReactNode; testIdPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const toneClass = tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : "text-destructive";
  return (
    <Card className="p-5 h-fit self-start" data-testid={`${testIdPrefix}-card`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value mt-2 ${toneClass}`}>{score} / 100</div>
      <div className="text-xs text-muted-foreground mt-1">Vurdering: {scoreVerdict(score)}</div>
      <div className="text-xs mt-2 break-words">{summary}</div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-primary mt-3 inline-flex items-center gap-1 hover:underline"
        data-testid={`${testIdPrefix}-toggle`}
        aria-expanded={open}
      >
        {open ? "Skjul detaljer" : "Vis detaljer"}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs" data-testid={`${testIdPrefix}-details`}>
          <p className="text-muted-foreground italic">{what}</p>
          {details}
        </div>
      )}
    </Card>
  );
}

function impactDot(impact: "positive" | "negative" | "neutral") {
  const cls = impact === "positive" ? "bg-success" : impact === "negative" ? "bg-destructive" : "bg-muted-foreground";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls} mt-1.5 shrink-0`} />;
}

function FactorBullet({ f }: { f: ScoreFactor }) {
  const tag = f.magnitude === "critical" ? "Kritisk effekt" : f.magnitude === "high" ? "Stor effekt" : f.magnitude === "medium" ? "Medium effekt" : "Lille effekt";
  return (
    <li className="flex items-start gap-2">
      {impactDot(f.impact)}
      <div className="min-w-0">
        <div className="font-medium">{f.label}</div>
        <div className="text-muted-foreground">{f.detail} · {tag}</div>
      </div>
    </li>
  );
}

function ConfBullet({ f }: { f: ConfidenceFactor }) {
  const effectLabel = f.effect === "high" ? "Høj" : f.effect === "medium" ? "Medium" : "Lav";
  const positive = f.level === "very_high" || f.level === "high";
  const trend = f.note
    ? "Bruges ikke — påvirker ikke scoren"
    : positive
      ? "Trækker næsten ikke ned"
      : f.effect === "high" ? "Trækker scoren ned" : "Trækker scoren lidt ned";
  return (
    <li className="flex items-start gap-2">
      {impactDot(f.note ? "neutral" : positive ? "positive" : "negative")}
      <div className="min-w-0">
        <div className="font-medium">{f.label}</div>
        <div className="text-muted-foreground">
          Sikkerhed: {LEVEL_LABELS[f.level]} · Effekt: {effectLabel} · {trend}
        </div>
      </div>
    </li>
  );
}

const SP_METHOD_LABEL = {
  none: "Ingen folkepension",
  baseOnly: "Kun grundbeløb (brutto − skat)",
  manualNet: "Manuelt nettobeløb",
} as const;

export default function Dashboard() {
  const scenario = useResolvedActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);

  const { years, kpis, chartData, checks, fire } = useMemo(() => {
    const ys = project(scenario, assumptions);
    return {
      years: ys,
      kpis: deriveKPIs(scenario, ys, assumptions),
      checks: sanityChecks(scenario, ys),
      fire: computeFireAnalysis(scenario, ys, assumptions),
      chartData: ys.map((y) => ({
        age: y.age,
        Fri: Math.round(y.closing.free),
        Buffer: Math.round(y.closing.buffer),
        Pension: Math.round(y.closing.pension),
        Holding: Math.round(y.closing.holding),
        Forbrug: Math.round(y.flows.spending),
        Nettoformue: Math.round(y.netWorth),
      })),
    };
  }, [scenario, assumptions]);

  const finTone = kpis.financialRobustness >= 70 ? "good" : kpis.financialRobustness >= 50 ? "warn" : "bad";
  const confidence = kpis.assumptionConfidence;
  const confTone = confidence >= 70 ? "good" : confidence >= 50 ? "warn" : "bad";
  const spMode = scenario.inputs.income.statePension.mode;
  const targetMissed = kpis.endShortfallVsTarget > 0;

  return (
    <div className="space-y-8">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Aktivt scenarie</div>
        <h1 className="font-display text-4xl font-semibold mt-1">{scenario.name}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Alle beløb i nutidskroner (realværdi). Folkepensionsmetode: <strong>{SP_METHOD_LABEL[spMode]}</strong>.
        </p>
      </header>

      {(() => {
        const s = kpis.modelStatus;
        const cls =
          s === "valid"
            ? "bg-success/10 border-success/40 text-success"
            : s === "target_missed"
              ? "bg-warning/10 border-warning/50"
              : "bg-destructive/10 border-destructive/40 text-destructive";
        const dot =
          s === "valid" ? "bg-success" : s === "target_missed" ? "bg-warning" : "bg-destructive";
        const label =
          s === "valid"
            ? "Modelstatus: validt"
            : s === "target_missed"
              ? "Scenariet er gyldigt, men minimumsmålet er ikke opfyldt"
              : "Modelstatus: ugyldigt";
        return (
          <div className={`border rounded-md p-4 text-sm flex items-start gap-3 ${cls}`}>
            <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
            <div>
              <div className="font-semibold">{label}</div>
              <div className="text-xs opacity-90 mt-1">{kpis.modelStatusReason}</div>
              {kpis.unfinancedHoldingDebt > 0.5 && (
                <div className="text-xs mt-1">
                  Ufinansieret holdinggæld i {kpis.unfinancedHoldingYears} år — i alt {formatDKK(kpis.unfinancedHoldingDebt)}.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Planlagt stopalder" value={`${kpis.plannedStopAge} år`} sub="Som angivet i variabler" />
        <KPI
          label="Tidligste bæredygtige stop"
          value={kpis.earliestSustainableStopAge ? `${kpis.earliestSustainableStopAge} år` : "—"}
          sub={`Min ved slutalder: ${formatDKK(kpis.minNetWorthAtEnd, { compact: true })}`}
          tooltip="Tidligste alder hvor scenariet holder uden shortfall og slutter med mindst minimumsformuen."
          tone={kpis.earliestSustainableStopAge && kpis.earliestSustainableStopAge <= kpis.plannedStopAge ? "good" : "warn"}
        />
        <KPI label="Kapital v. stop" value={formatDKK(kpis.capitalAtStopAge, { compact: true })} sub={`Alder ${scenario.inputs.stopAge}`} />
        <KPI label="Kapital v. 65" value={formatDKK(kpis.capitalAt65, { compact: true })} />
        <KPI
          label="Kapital v. slutalder"
          value={formatDKK(kpis.capitalAt95, { compact: true })}
          sub={`Mål: ${formatDKK(kpis.minNetWorthAtEnd, { compact: true })}${targetMissed ? ` — mangler ${formatDKK(kpis.endShortfallVsTarget, { compact: true })} ved slutalder` : " ✓"}`}
          tone={kpis.capitalAt95 > 0 && !targetMissed ? "good" : "bad"}
        />
        <KPI
          label="Første privat cashflow-shortfall"
          value={kpis.firstShortfallAge ? `Alder ${kpis.firstShortfallAge}` : "Ingen"}
          tone={kpis.firstShortfallAge ? "bad" : "good"}
          tooltip="Første år hvor det private cashflow ikke kan dække planlagt forbrug og afdrag."
        />
        <KPI
          label="Første finansieringsproblem"
          value={kpis.firstFinancingIssueAge ? `Alder ${kpis.firstFinancingIssueAge}` : "Ingen"}
          sub={kpis.firstFinancingIssueAge ? `${kpis.firstFinancingIssueKind} · ${formatDKK(kpis.firstFinancingIssueAmount, { compact: true })}` : "Ingen ufinansierede betalinger"}
          tone={kpis.firstFinancingIssueAge ? "bad" : "good"}
          tooltip="Fx ufinansieret holdingbetaling eller holdinggæld der ikke kan dækkes."
        />
        <KPI
          label="Standard FI"
          value={fire.results.standard.achievedAtAge ? `Alder ${fire.results.standard.achievedAtAge}` : "Ikke opnået"}
          sub={`Mål: ${formatDKK(fire.standardFiNumber, { compact: true })}`}
          tone={fire.results.standard.achievedAtAge ? "good" : "warn"}
          tooltip="Tidligste alder hvor fri kapital (+holding) dækker årligt forbrug ved sikker udtræksrate."
        />
        <KPI
          label="Nærmeste FIRE-milepæl"
          value={fire.nearestMilestone ? fire.results[fire.nearestMilestone].label : "Ingen opnået"}
          sub={fire.earliestFireAge ? `Ved alder ${fire.earliestFireAge}` : "Se FIRE-siden"}
          tone={fire.nearestMilestone ? "good" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <ScoreCard
          label="Finansiel robusthed"
          score={kpis.financialRobustness}
          tone={kpis.modelStatus === "invalid" ? "bad" : finTone}
          summary={
            kpis.modelStatus === "invalid"
              ? `Scoren er begrænset, fordi scenariet har uafklarede finansieringsproblemer. ${kpis.robustnessSummary}`
              : kpis.robustnessSummary
          }
          what="Måler hvor godt scenariet økonomisk hænger sammen, hvis tingene udvikler sig lidt dårligere end forventet. Capper ved 25/100 hvis scenariet er ugyldigt."
          testIdPrefix="robustness"
          details={
            <ul className="space-y-2">
              {kpis.robustnessBreakdown.map((f, i) => <FactorBullet key={i} f={f} />)}
            </ul>
          }
        />
        <ScoreCard
          label="Antagelsessikkerhed"
          score={confidence}
          tone={confTone}
          summary={
            kpis.modelStatus === "invalid" && confidence >= 50
              ? `${kpis.confidenceSummary} Antagelserne vurderes som rimelige, men scenariet fejler på cashflow/finansiering — se modelstatus øverst.`
              : kpis.confidenceSummary
          }
          what="Måler hvor sikre antagelserne er — ikke om cashflowet hænger sammen. Justér i Antagelser → Sikkerhedsvurderinger."
          testIdPrefix="confidence"
          details={
            <ul className="space-y-2">
              {kpis.confidenceBreakdown.map((f, i) => <ConfBullet key={i} f={f} />)}
            </ul>
          }
        />
      </div>

      {checks.length > 0 && (
        <Card className="p-6">
          <h2 className="font-display text-xl font-semibold mb-3">Input sanity check</h2>
          <ul className="space-y-2">
            {checks.map((c) => {
              const color =
                c.severity === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : c.severity === "warn"
                    ? "border-warning/40 bg-warning/10"
                    : "border-border bg-muted/30";
              return (
                <li key={c.id} className={`border rounded-md p-3 text-sm ${color}`}>
                  <div className="font-medium">{c.title}</div>
                  {c.detail && <div className="text-xs text-muted-foreground mt-1">{c.detail}</div>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

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
              <Area type="monotone" dataKey="Buffer" stackId="1" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted))" />
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
