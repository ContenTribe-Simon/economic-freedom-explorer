import { useMemo, useState } from "react";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { deriveKPIs } from "@/lib/finance/kpis";
import { sanityChecks } from "@/lib/finance/sanity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDKK } from "@/lib/format";
import { MODEL_RELEASE, MODEL_VERSION, type Snapshot } from "@/lib/finance/types";
import { Link, useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { toast } from "sonner";

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

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("da-DK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Report() {
  const [searchParams, setSearchParams] = useSearchParams();
  const snapshotId = searchParams.get("snapshot");

  const liveScenario = useResolvedActiveScenario();
  const liveAssumptions = useFinanceStore((s) => s.assumptions);
  const snapshots = useFinanceStore((s) => s.snapshots);
  const saveSnapshot = useFinanceStore((s) => s.saveSnapshot);
  const deleteSnapshot = useFinanceStore((s) => s.deleteSnapshot);
  const renameSnapshot = useFinanceStore((s) => s.renameSnapshot);
  const updateSnapshotNotes = useFinanceStore((s) => s.updateSnapshotNotes);
  const duplicateSnapshot = useFinanceStore((s) => s.duplicateSnapshot);

  const activeSnapshot = snapshotId ? snapshots.find((s) => s.snapshotId === snapshotId) : undefined;
  const isSnapshotMode = !!activeSnapshot;

  // Beregn live data hvis ikke i snapshot-mode
  const liveData = useMemo(() => {
    if (isSnapshotMode) return null;
    const ys = project(liveScenario, liveAssumptions);
    return {
      kpis: deriveKPIs(liveScenario, ys, liveAssumptions),
      checks: sanityChecks(liveScenario, ys),
      chartData: ys.map((y) => ({
        age: y.age,
        Fri: Math.round(y.closing.free),
        Buffer: Math.round(y.closing.buffer),
        Pension: Math.round(y.closing.pension),
        Holding: Math.round(y.closing.holding),
        Nettoformue: Math.round(y.netWorth),
      })),
    };
  }, [liveScenario, liveAssumptions, isSnapshotMode]);

  // Saml fælles datagrundlag — enten fra snapshot eller live
  const view = isSnapshotMode
    ? {
        scenarioName: activeSnapshot!.scenarioName,
        scenarioType: activeSnapshot!.scenarioType,
        baseScenarioName: activeSnapshot!.baseScenarioName,
        modifiers: activeSnapshot!.modifiers,
        manuallyEdited: activeSnapshot!.manuallyEdited,
        inputs: activeSnapshot!.resolvedInputs,
        kpis: activeSnapshot!.kpis,
        checks: activeSnapshot!.sanityChecks,
        chartData: activeSnapshot!.chartData,
        modelVersion: activeSnapshot!.modelVersion,
        modelRelease: activeSnapshot!.modelRelease,
      }
    : {
        scenarioName: liveScenario.name,
        scenarioType: liveScenario.type ?? "custom",
        baseScenarioName: liveScenario.baseScenarioName,
        modifiers: liveScenario.modifiers,
        manuallyEdited: liveScenario.manuallyEdited,
        inputs: liveScenario.inputs,
        kpis: liveData!.kpis,
        checks: liveData!.checks,
        chartData: liveData!.chartData,
        modelVersion: MODEL_VERSION,
        modelRelease: MODEL_RELEASE,
      };

  const reportDate = new Date().toLocaleDateString("da-DK", { year: "numeric", month: "long", day: "numeric" });
  const inputs = view.inputs;
  const kpis = view.kpis;

  const typeNote =
    view.scenarioType === "linked_stress_test"
      ? "Beregnet ud fra aktuel basecase + modifiers."
      : view.scenarioType === "custom"
        ? "Manuelt scenarie – følger ikke automatisk basecase."
        : "Uafhængigt basisscenarie.";

  // Snapshot-form state
  const [snapName, setSnapName] = useState("");
  const [snapNotes, setSnapNotes] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const handleSave = () => {
    const id = saveSnapshot({ name: snapName || undefined, notes: snapNotes || undefined });
    if (id) {
      toast.success("Snapshot gemt");
      setSnapName("");
      setSnapNotes("");
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id],
    );
  };

  const compareSnapshots = compareIds
    .map((id) => snapshots.find((s) => s.snapshotId === id))
    .filter((x): x is Snapshot => !!x);

  return (
    <div className="report-page max-w-[820px] mx-auto p-10 print:p-0 bg-background text-foreground">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← Tilbage til dashboard</Link>
        <div className="flex gap-2">
          {isSnapshotMode && (
            <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
              Vis aktivt scenarie
            </Button>
          )}
          <Button onClick={() => window.print()}>Print / Gem som PDF</Button>
        </div>
      </div>

      {isSnapshotMode && (
        <div className="mb-6 p-3 rounded-md border border-primary/40 bg-primary/5 text-sm print:bg-transparent">
          <strong>Rapport baseret på gemt snapshot.</strong>{" "}
          Dette er et frosset point-in-time snapshot fra {formatDateTime(activeSnapshot!.createdAt)}.
          Det ændrer sig ikke, selvom scenarier senere ændres.
          <div className="mt-1 text-xs text-muted-foreground">
            Snapshot: <span className="font-medium">{activeSnapshot!.snapshotName}</span>
            {activeSnapshot!.notes ? ` · ${activeSnapshot!.notes}` : ""}
          </div>
        </div>
      )}

      <header className="border-b border-border pb-4 mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Personlig fremskrivning · Rapport</div>
        <h1 className="font-display text-3xl font-semibold mt-1">{view.scenarioName}</h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-2">
          <span>Rapportdato: {reportDate}</span>
          <span>Modelversion: {view.modelRelease} (skema v{view.modelVersion})</span>
          <span>
            Scenarietype: {SCENARIO_TYPE_LABEL[view.scenarioType]}
            {view.scenarioType === "linked_stress_test" && view.baseScenarioName ? ` (basis: ${view.baseScenarioName})` : ""}
          </span>
          <span>Folkepension: {SP_METHOD_LABEL[inputs.income.statePension.mode]}</span>
          <span>
            Planlagt opsparing: {STOP_RULE_LABEL[inputs.free.contributionStopRule ?? "stopAge"]}
            {(inputs.free.contributionStopRule ?? "stopAge") === "customAge" && inputs.free.contributionStopAge
              ? ` (${inputs.free.contributionStopAge} år)`
              : ""}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-2 italic">{typeNote}</div>
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
            <AreaChart data={view.chartData}>
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
              ["Stop planlagt opsparing", STOP_RULE_LABEL[inputs.free.contributionStopRule ?? "stopAge"]],
              ["Pension — saldo", formatDKK(inputs.pension.balance, { compact: true })],
              ["Ratepension — udbetalingsperiode", inputs.pension.ratePensionEnabled ? `${inputs.pension.ratePensionPayoutYears} år fra ${inputs.pension.payoutFromAge}` : "Ikke aktiv"],
              ["Livsvarig pension", inputs.pension.lifeAnnuity.enabled ? `Aktiv fra ${inputs.pension.lifeAnnuity.fromAge}` : "Ikke aktiv"],
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

      {inputs.debts.length > 0 && (
        <section className="mb-6 break-inside-avoid">
          <h2 className="font-display text-lg font-semibold mb-2">Gældsoversigt</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-1.5 pr-4">Navn</th>
                <th className="py-1.5 pr-4">Type</th>
                <th className="py-1.5 text-right">Saldo</th>
                <th className="py-1.5 text-right">Rente</th>
              </tr>
            </thead>
            <tbody>
              {inputs.debts.map((d) => (
                <tr key={d.id} className="border-b border-border">
                  <td className="py-1.5 pr-4">{d.name}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{d.kind}</td>
                  <td className="py-1.5 text-right num">{formatDKK(d.balance, { compact: true })}</td>
                  <td className="py-1.5 text-right num">{(d.interestRate * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {view.checks.length > 0 && (
        <section className="mb-6 break-inside-avoid">
          <h2 className="font-display text-lg font-semibold mb-2">Input sanity check</h2>
          <ul className="space-y-1.5 text-sm">
            {view.checks.map((c) => (
              <li key={c.id} className="border-l-2 pl-2 border-border">
                <strong>{c.title}.</strong> {c.detail && <span className="text-muted-foreground">{c.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground leading-relaxed">
        <strong>Disclaimer:</strong> Modellen er en personlig fremskrivning i nutidskroner og er ikke finansiel rådgivning.
        Den indeholder forsimplinger og kan afvige væsentligt fra det faktiske forløb.
      </section>

      {/* SNAPSHOT MANAGER — vises kun i live-mode (skjules i snapshot og print) */}
      {!isSnapshotMode && (
        <section className="mt-10 print:hidden border-t border-border pt-6">
          <h2 className="font-display text-lg font-semibold mb-3">Gemte snapshots</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Et snapshot er en frossen kopi af det aktive scenarie på gemmetidspunktet. Det ændrer sig ikke,
            selvom basecase eller scenarier senere redigeres.
          </p>

          <div className="rounded-md border border-border p-4 mb-6 space-y-3 bg-muted/30">
            <div className="text-sm font-medium">Gem snapshot af aktivt scenarie</div>
            <Input
              placeholder={`Navn (default: ${liveScenario.name} – tidsstempel)`}
              value={snapName}
              onChange={(e) => setSnapName(e.target.value)}
            />
            <Textarea
              placeholder="Note (valgfri) — fx hvad der adskiller denne version"
              value={snapNotes}
              onChange={(e) => setSnapNotes(e.target.value)}
              rows={2}
            />
            <Button onClick={handleSave}>Gem snapshot</Button>
          </div>

          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Ingen snapshots gemt endnu.</p>
          ) : (
            <div className="space-y-3">
              {snapshots.map((s) => {
                const checked = compareIds.includes(s.snapshotId);
                return (
                  <div key={s.snapshotId} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCompare(s.snapshotId)}
                            aria-label="Sammenlign"
                          />
                          <Input
                            value={s.snapshotName}
                            onChange={(e) => renameSnapshot(s.snapshotId, e.target.value)}
                            className="h-8 text-sm font-medium"
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(s.createdAt)} · {s.scenarioName} ·{" "}
                          {SCENARIO_TYPE_LABEL[s.scenarioType]}
                        </div>
                        <div className="text-xs mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5">
                          <span>Stop: <span className="num">{s.kpis.plannedStopAge}</span></span>
                          <span>Robust: <span className="num">{s.kpis.financialRobustness}</span></span>
                          <span>v. 65: <span className="num">{formatDKK(s.kpis.capitalAt65, { compact: true })}</span></span>
                          <span>Slut: <span className="num">{formatDKK(s.kpis.minNetWorthAtEnd, { compact: true })}</span></span>
                        </div>
                        <Textarea
                          placeholder="Note"
                          value={s.notes ?? ""}
                          onChange={(e) => updateSnapshotNotes(s.snapshotId, e.target.value)}
                          rows={1}
                          className="mt-2 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => setSearchParams({ snapshot: s.snapshotId })}>
                          Åbn
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => duplicateSnapshot(s.snapshotId)}>
                          Duplikér
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Slet snapshot?")) deleteSnapshot(s.snapshotId);
                          }}
                        >
                          Slet
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {compareSnapshots.length >= 2 && (
            <div className="mt-6 rounded-md border border-border p-4 overflow-x-auto">
              <h3 className="font-display text-base font-semibold mb-2">Sammenligning</h3>
              <table className="w-full text-xs border-collapse min-w-[600px]">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-1.5 pr-2 text-muted-foreground">Felt</th>
                    {compareSnapshots.map((s) => (
                      <th key={s.snapshotId} className="py-1.5 pr-2">{s.snapshotName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Dato", (s: Snapshot) => formatDateTime(s.createdAt)],
                    ["Scenarie", (s: Snapshot) => s.scenarioName],
                    ["Type", (s: Snapshot) => SCENARIO_TYPE_LABEL[s.scenarioType]],
                    ["Planlagt stopalder", (s: Snapshot) => `${s.kpis.plannedStopAge}`],
                    ["Tidligste bæredygtige stop", (s: Snapshot) => s.kpis.earliestSustainableStopAge ? `${s.kpis.earliestSustainableStopAge}` : "—"],
                    ["Kapital v. stop", (s: Snapshot) => formatDKK(s.kpis.capitalAtStopAge, { compact: true })],
                    ["Kapital v. 65", (s: Snapshot) => formatDKK(s.kpis.capitalAt65, { compact: true })],
                    ["Kapital v. slut", (s: Snapshot) => formatDKK(s.kpis.minNetWorthAtEnd, { compact: true })],
                    ["Første shortfall", (s: Snapshot) => s.kpis.firstShortfallAge ? `${s.kpis.firstShortfallAge}` : "Ingen"],
                    ["Første finansieringsproblem", (s: Snapshot) => s.kpis.firstFinancingIssueAge ? `${s.kpis.firstFinancingIssueKind} (${s.kpis.firstFinancingIssueAge})` : "Ingen"],
                    ["Robusthed", (s: Snapshot) => `${s.kpis.financialRobustness}/100`],
                    ["Antagelsessikkerhed", (s: Snapshot) => `${s.kpis.assumptionConfidence}/100`],
                    ["Minimumsmål", (s: Snapshot) => s.kpis.endShortfallVsTarget <= 0 ? "Opfyldt" : `Mangler ${formatDKK(s.kpis.endShortfallVsTarget, { compact: true })}`],
                  ] as const).map(([label, fn]) => (
                    <tr key={label} className="border-b border-border/50">
                      <td className="py-1 pr-2 text-muted-foreground">{label}</td>
                      {compareSnapshots.map((s) => (
                        <td key={s.snapshotId} className="py-1 pr-2 num">{fn(s)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
