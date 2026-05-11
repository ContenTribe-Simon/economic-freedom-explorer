import { useMemo, useState } from "react";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { computeFireAnalysis, FIRE_DEFAULTS, statusLabel, type FireType, type FireAssumptions } from "@/lib/finance/fire";
import { Card } from "@/components/ui/card";
import { formatDKK, formatPct } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TYPE_ORDER: FireType[] = ["coast", "lean", "standard", "fat", "barista"];

const DRIVER_LABEL: Record<string, string> = {
  spending: "forbrug",
  freeCapital: "fri kapital",
  pension: "pension",
  holding: "holding",
  withdrawalRate: "udtræksrate",
};

function statusTone(status: string): string {
  if (status === "achieved" || status === "achieved_at_age") return "text-success";
  if (status === "not_sustainable") return "text-warning";
  return "text-muted-foreground";
}

export default function FirePage() {
  const scenario = useResolvedActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);
  const [taxPctInput, setTaxPctInput] = useState<string>(
    String(Math.round(FIRE_DEFAULTS.effectiveTaxOnWithdrawal * 100)),
  );

  const fireAssumptions: FireAssumptions = useMemo(() => {
    const parsed = parseFloat(taxPctInput.replace(",", "."));
    const tax = Number.isFinite(parsed) ? Math.min(95, Math.max(0, parsed)) / 100 : FIRE_DEFAULTS.effectiveTaxOnWithdrawal;
    return { ...FIRE_DEFAULTS, effectiveTaxOnWithdrawal: tax };
  }, [taxPctInput]);

  const analysis = useMemo(() => {
    const years = project(scenario, assumptions);
    return computeFireAnalysis(scenario, years, assumptions, fireAssumptions);
  }, [scenario, assumptions, fireAssumptions]);

  const fa = analysis.assumptions;
  const nearest = analysis.nearestMilestone ? analysis.results[analysis.nearestMilestone] : null;
  const summary = analysis.summary;
  const standardBenchmark = analysis.benchmarks.find((b) => b.rate === 0.035);

  return (
    <div className="space-y-8">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">FIRE-analyse</div>
        <h1 className="font-display text-4xl font-semibold mt-1">{scenario.name}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          FIRE-status beregnes oven på den eksisterende fremskrivning. Alle beløb er i nutidskroner.
          Resultaterne er indikative benchmarks — ikke finansiel rådgivning.
        </p>
      </header>

      {/* ---- Konklusion ---- */}
      <Card className="p-5" data-testid="fire-summary">
        <div className="kpi-label">FIRE-konklusion</div>
        {nearest ? (
          <>
            <div className="kpi-value mt-2 text-success">
              Nærmeste milepæl: {nearest.label}
              {nearest.achievedAtAge !== null ? ` (alder ${nearest.achievedAtAge})` : ""}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Standard FI mål: <span className="num">{formatDKK(analysis.standardFiNumber, { compact: true })}</span> ved udtræksrate {formatPct(fa.withdrawalRate)}.
              {summary.smallestUnachievedGap && (
                <>
                  {" "}Næste milepæl ({analysis.results[summary.smallestUnachievedGap.type].label}) mangler ca.{" "}
                  <span className="num">{formatDKK(summary.smallestUnachievedGap.gap, { compact: true })}</span> ved bedste punkt (alder {summary.smallestUnachievedGap.age}).
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2 italic">
              Indikativt set påvirker <strong>{DRIVER_LABEL[summary.keyDriver]}</strong> FIRE-billedet mest blandt forbrug, kapital og udtræksrate.
            </div>
          </>
        ) : (
          <>
            <div className="kpi-value mt-2 text-muted-foreground">Der nås ingen FIRE-milepæl i scenariet</div>
            {summary.smallestUnachievedGap ? (
              <div className="text-sm text-muted-foreground mt-2">
                Mindste gap opstår ved alder {summary.smallestUnachievedGap.age} ({analysis.results[summary.smallestUnachievedGap.type].label}), hvor der mangler ca.{" "}
                <span className="num">{formatDKK(summary.smallestUnachievedGap.gap, { compact: true })}</span>.
              </div>
            ) : (
              <div className="text-sm text-muted-foreground mt-2">
                Standard FI mål: <span className="num">{formatDKK(analysis.standardFiNumber, { compact: true })}</span>.
              </div>
            )}
          </>
        )}
      </Card>

      {/* ---- FIRE-kort ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="fire-cards">
        {TYPE_ORDER.map((t) => {
          const r = analysis.results[t];
          return (
            <Card key={t} className="p-5" data-testid={`fire-card-${t}`}>
              <div className="kpi-label">{r.label}</div>
              <div className={`text-lg font-semibold mt-2 ${statusTone(r.status)}`}>
                {statusLabel(r.status, r.achievedAtAge)}
              </div>
              <div className="text-xs text-muted-foreground italic mt-2">{r.description}</div>
              <div className="text-xs mt-3 space-y-1">
                <div className="flex justify-between"><span>Nødvendig kapital</span><span className="num">{formatDKK(r.capitalRequired, { compact: true })}</span></div>
                <div className="flex justify-between"><span>Forventet kapital</span><span className="num">{formatDKK(r.capitalAvailable, { compact: true })}</span></div>
                <div className="flex justify-between">
                  <span>Gap</span>
                  <span className="num">
                    {r.gap > 0 ? `${formatDKK(r.gap, { compact: true })} (${Math.round(r.gapPct * 100)} %)` : "—"}
                  </span>
                </div>
                <div className="flex justify-between"><span>Opnået alder</span><span className="num">{r.achievedAtAge ?? "—"}</span></div>
                {r.achievedAtAge === null && r.bestPoint && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Bedste punkt</span>
                    <span className="num">alder {r.bestPoint.age} · mangler {formatDKK(r.bestPoint.gap, { compact: true })}</span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ---- Benchmarks (4%-regel m.fl.) ---- */}
      <Card className="p-5" data-testid="fire-benchmarks">
        <h2 className="font-display text-xl font-semibold mb-1">FIRE-benchmarks</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Klassiske tommelfingerregler beregnet ud fra det aktuelle årlige nettoforbrug ({formatDKK(analysis.annualSpending, { compact: true })}).
          Ikke en garanti og ikke automatisk justeret for dansk skat, pension eller livsfaser.
        </p>
        <div className="mb-3 flex items-end gap-3">
          <div>
            <Label htmlFor="fire-tax" className="text-xs">Effektiv skat på FIRE-udtræk (%)</Label>
            <Input
              id="fire-tax"
              data-testid="fire-tax-input"
              value={taxPctInput}
              onChange={(e) => setTaxPctInput(e.target.value)}
              className="w-24 mt-1"
              inputMode="decimal"
            />
          </div>
          <div className="text-xs text-muted-foreground pb-2">
            Forenklet — bruges kun til skattejusteret grovestimat herunder. Påvirker ikke fremskrivningen.
          </div>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="py-2 pr-4">Benchmark</th>
              <th className="py-2 pr-4 text-right">Kapitalbehov (uden skattejustering)</th>
              <th className="py-2 pr-4 text-right">Skattejusteret grovestimat</th>
            </tr>
          </thead>
          <tbody data-testid="fire-benchmarks-rows">
            {analysis.benchmarks.map((b) => (
              <tr key={b.rate} className="border-b border-border" data-testid={`fire-benchmark-${b.rate}`}>
                <td className="py-2 pr-4">{b.label}</td>
                <td className="py-2 pr-4 text-right num">{formatDKK(b.capitalRequiredNet, { compact: true })}</td>
                <td className="py-2 pr-4 text-right num">{formatDKK(b.capitalRequiredGross, { compact: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-muted-foreground mt-3 italic">
          Skattejusteret grovestimat = nettoforbrug / (1 − effektiv skat) / udtræksrate. Effektiv skat sat til {Math.round(fa.effectiveTaxOnWithdrawal * 100)} %.
          Den egentlige model i Frihedsmodellen tager højde for dine konkrete pension-, holding- og fri-konti.
        </p>
      </Card>

      {/* ---- Bæredygtigt udtræk fra nuværende kapital ---- */}
      <Card className="p-5" data-testid="fire-sustainable">
        <h2 className="font-display text-xl font-semibold mb-1">Hvad kan din nuværende kapital bære?</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Indikativt bæredygtigt udtræk fra det aktuelle FIRE-kapitalgrundlag (alder {analysis.sustainableNow.referenceAge}).
          Grundlag i alt: <span className="num">{formatDKK(analysis.sustainableNow.capitalIncluded, { compact: true })}</span>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {analysis.sustainableNow.rates.map((r) => (
            <div key={r.rate} className="border border-border rounded p-3" data-testid={`fire-sustainable-${r.rate}`}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Ved {(r.rate * 100).toFixed(1)} %</div>
              <div className="text-sm mt-1 flex justify-between"><span>Årligt</span><span className="num">{formatDKK(r.annual, { compact: true })}</span></div>
              <div className="text-sm flex justify-between"><span>Månedligt</span><span className="num">{formatDKK(r.monthly, { compact: true })}</span></div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 italic">
          Grundlaget medregner fri kapital{fa.includeHoldingInFire ? " og holding" : ""}{fa.includePensionInFire ? " og pension" : ""}.
          {!fa.includePensionInFire && " Pension medregnes ikke som fri kapital før pensionsalder."}
        </p>
      </Card>

      {/* ---- Effekt af lavere forbrug ---- */}
      <Card className="p-5" data-testid="fire-spending-reductions">
        <h2 className="font-display text-xl font-semibold mb-1">Hvis forbruget reduceres</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Indikativ følsomhed — viser hvordan FIRE-kapitalbehovet ændrer sig ved lavere nettoforbrug.
          Påvirker ikke scenariets faktiske forbrug.
        </p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="py-2 pr-4">Reduktion</th>
              <th className="py-2 pr-4 text-right">Nyt månedligt netto</th>
              <th className="py-2 pr-4 text-right">Nyt årligt netto</th>
              <th className="py-2 pr-4 text-right">Kapital ved 3,5 %</th>
              <th className="py-2 pr-4 text-right">Kapital ved 4 %</th>
              <th className="py-2 pr-4 text-right">Besparelse (3,5 %)</th>
              <th className="py-2 pr-4 text-right">Standard FI alder</th>
            </tr>
          </thead>
          <tbody data-testid="fire-reduction-rows">
            {analysis.spendingReductions.map((r) => (
              <tr key={r.pct} className="border-b border-border" data-testid={`fire-reduction-${Math.round(r.pct * 100)}`}>
                <td className="py-2 pr-4">−{Math.round(r.pct * 100)} %</td>
                <td className="py-2 pr-4 text-right num">{formatDKK(r.newMonthlyNet, { compact: true })}</td>
                <td className="py-2 pr-4 text-right num">{formatDKK(r.newAnnualNet, { compact: true })}</td>
                <td className="py-2 pr-4 text-right num">{formatDKK(r.capitalRequiredAt3_5, { compact: true })}</td>
                <td className="py-2 pr-4 text-right num">{formatDKK(r.capitalRequiredAt4, { compact: true })}</td>
                <td className="py-2 pr-4 text-right num">{formatDKK(r.savingsAt3_5, { compact: true })}</td>
                <td className="py-2 pr-4 text-right num">{r.achievedAge ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ---- FIRE-oversigt ---- */}
      <Card className="p-5">
        <h2 className="font-display text-xl font-semibold mb-3">FIRE-oversigt</h2>
        <table className="w-full text-sm border-collapse" data-testid="fire-table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="py-2 pr-4">FIRE-type</th>
              <th className="py-2 pr-4 text-right">Mål</th>
              <th className="py-2 pr-4 text-right">Kapitalgrundlag</th>
              <th className="py-2 pr-4 text-right">Gap</th>
              <th className="py-2 pr-4 text-right">Opnået alder</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {TYPE_ORDER.map((t) => {
              const r = analysis.results[t];
              return (
                <tr key={t} className="border-b border-border">
                  <td className="py-2 pr-4 font-medium">{r.label}</td>
                  <td className="py-2 pr-4 text-right num">{formatDKK(r.capitalRequired, { compact: true })}</td>
                  <td className="py-2 pr-4 text-right num">{formatDKK(r.capitalAvailable, { compact: true })}</td>
                  <td className="py-2 pr-4 text-right num">{r.gap > 0 ? formatDKK(r.gap, { compact: true }) : "—"}</td>
                  <td className="py-2 pr-4 text-right num">{r.achievedAtAge ?? "—"}</td>
                  <td className={`py-2 pr-4 ${statusTone(r.status)}`}>{statusLabel(r.status, r.achievedAtAge)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {standardBenchmark && (
          <p className="text-[11px] text-muted-foreground mt-3 italic">
            Beregnet som nettoforbrug divideret med udtræksrate. Der er ikke lavet særskilt skattejustering af udtræk i denne tabel.
          </p>
        )}
      </Card>

      {/* ---- Kapitalgrundlag bag FIRE ---- */}
      <Card className="p-5" data-testid="fire-capital-breakdown">
        <h2 className="font-display text-xl font-semibold mb-1">Kapitalgrundlag bag FIRE</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Samme grundlag som FIRE-kortenes "Forventet kapital" (reference-alder {analysis.capitalBreakdown.referenceAge}).
        </p>
        {analysis.capitalBreakdown.totalIncluded <= 0 ? (
          <div className="text-sm text-muted-foreground italic" data-testid="fire-capital-empty">
            Der er ikke positivt FIRE-kapitalgrundlag i dette år.
          </div>
        ) : (
          <div className="text-sm space-y-2" data-testid="fire-capital-rows">
            <div className="flex justify-between" data-testid="fire-capital-free">
              <span>Fri kapital</span>
              <span className="num">{formatDKK(analysis.capitalBreakdown.free, { compact: true })} · {Math.round(analysis.capitalBreakdown.shares.free * 100)} %</span>
            </div>
            <div className="flex justify-between" data-testid="fire-capital-holding">
              <span>Holding {!analysis.capitalBreakdown.included.holding && (<span className="text-xs text-muted-foreground">(ikke medtaget)</span>)}</span>
              <span className="num">{formatDKK(analysis.capitalBreakdown.holding, { compact: true })} · {Math.round(analysis.capitalBreakdown.shares.holding * 100)} %</span>
            </div>
            <div className="flex justify-between" data-testid="fire-capital-pension">
              <span>Pension {!analysis.capitalBreakdown.included.pension && (<span className="text-xs text-muted-foreground">(ikke medtaget i Standard FI — vises som fremtidig pensionsstøtte)</span>)}</span>
              <span className="num">{formatDKK(analysis.capitalBreakdown.pension, { compact: true })}{analysis.capitalBreakdown.included.pension ? ` · ${Math.round(analysis.capitalBreakdown.shares.pension * 100)} %` : ""}</span>
            </div>
            <div className="flex justify-between" data-testid="fire-capital-buffer">
              <span>Buffer <span className="text-xs text-muted-foreground">({analysis.capitalBreakdown.included.buffer ? "kan bruges ved shortfall" : "ikke medtaget"})</span></span>
              <span className="num">{formatDKK(analysis.capitalBreakdown.buffer, { compact: true })}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 mt-2 font-medium">
              <span>FIRE-kapitalgrundlag i alt</span>
              <span className="num">{formatDKK(analysis.capitalBreakdown.totalIncluded, { compact: true })}</span>
            </div>
          </div>
        )}
      </Card>

      {/* ---- Sådan læses FIRE-tallene ---- */}
      <Card className="p-5" data-testid="fire-howto-read">
        <details>
          <summary className="cursor-pointer font-display text-lg font-semibold">Sådan læses FIRE-tallene</summary>
          <ul className="text-sm text-muted-foreground mt-3 space-y-2 list-disc pl-5">
            <li>FIRE-tallene er benchmarks og scenarieanalyser — ikke garantier.</li>
            <li>4 %-reglen er en klassisk tommelfingerregel fra Trinity-studiet og bygger på amerikanske data og perioder.</li>
            <li>Lavere udtræksrate (fx 3,5 %) giver et mere konservativt kapitalbehov.</li>
            <li>Skat er forenklet i benchmark-visningen — ikke en faktisk dansk skatteberegning.</li>
            <li>Den egentlige fremskrivning i Frihedsmodellen tager højde for pension, holding, livsfaser, gæld og cashflow.</li>
            <li>Resultaterne er ikke finansiel rådgivning.</li>
          </ul>
        </details>
      </Card>
    </div>
  );
}
