import { useMemo } from "react";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { computeFireAnalysis, FIRE_DEFAULTS, statusLabel, type FireType } from "@/lib/finance/fire";
import { Card } from "@/components/ui/card";
import { formatDKK, formatPct } from "@/lib/format";

const TYPE_ORDER: FireType[] = ["coast", "lean", "standard", "fat", "barista"];

function statusTone(status: string): string {
  if (status === "achieved" || status === "achieved_at_age") return "text-success";
  if (status === "not_sustainable") return "text-warning";
  return "text-muted-foreground";
}

export default function FirePage() {
  const scenario = useResolvedActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);
  const analysis = useMemo(() => {
    const years = project(scenario, assumptions);
    return computeFireAnalysis(scenario, years, assumptions);
  }, [scenario, assumptions]);

  const fa = analysis.assumptions;
  const nearest = analysis.nearestMilestone ? analysis.results[analysis.nearestMilestone] : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">FIRE-analyse</div>
        <h1 className="font-display text-4xl font-semibold mt-1">{scenario.name}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          FIRE-status beregnes oven på den eksisterende fremskrivning. Alle beløb er i nutidskroner.
          Udtræksrate: <strong>{formatPct(fa.withdrawalRate)}</strong> · Lean: {Math.round(fa.leanSpendingFactor * 100)}% · Fat: {Math.round(fa.fatSpendingFactor * 100)}%.
        </p>
      </header>

      <Card className="p-5" data-testid="fire-status">
        <div className="kpi-label">Hvor tæt er scenariet på FIRE?</div>
        {nearest ? (
          <>
            <div className="kpi-value mt-2 text-success">
              Nærmeste milepæl: {nearest.label} {nearest.achievedAtAge !== null ? `(alder ${nearest.achievedAtAge})` : ""}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Standard FI mål: {formatDKK(analysis.standardFiNumber, { compact: true })} · Årligt forbrug: {formatDKK(analysis.annualSpending, { compact: true })}
            </div>
          </>
        ) : (
          <>
            <div className="kpi-value mt-2 text-muted-foreground">Ingen FIRE-milepæl opnået i scenariet</div>
            <div className="text-xs text-muted-foreground mt-1">
              Standard FI mål: {formatDKK(analysis.standardFiNumber, { compact: true })}
            </div>
          </>
        )}
      </Card>

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
                <div className="flex justify-between"><span>Gap</span><span className="num">{r.gap > 0 ? formatDKK(r.gap, { compact: true }) : "—"}</span></div>
                <div className="flex justify-between"><span>Opnået alder</span><span className="num">{r.achievedAtAge ?? "—"}</span></div>
              </div>
            </Card>
          );
        })}
      </div>

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
      </Card>

      <Card className="p-5" data-testid="fire-capital-breakdown">
        <h2 className="font-display text-xl font-semibold mb-1">Kapitalgrundlag bag FIRE</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Samme grundlag som FIRE-kortenes "Forventet kapital" (reference-alder {analysis.capitalBreakdown.referenceAge}).
        </p>
        {analysis.capitalBreakdown.totalIncluded <= 0 ? (
          <div
            className="text-sm text-muted-foreground italic"
            data-testid="fire-capital-empty"
          >
            Der er ikke positivt FIRE-kapitalgrundlag i dette år.
          </div>
        ) : (
          <div className="text-sm space-y-2" data-testid="fire-capital-rows">
            <div className="flex justify-between" data-testid="fire-capital-free">
              <span>Fri kapital</span>
              <span className="num">
                {formatDKK(analysis.capitalBreakdown.free, { compact: true })} ·{" "}
                {Math.round(analysis.capitalBreakdown.shares.free * 100)} %
              </span>
            </div>
            <div className="flex justify-between" data-testid="fire-capital-holding">
              <span>
                Holding{" "}
                {!analysis.capitalBreakdown.included.holding && (
                  <span className="text-xs text-muted-foreground">(ikke medtaget)</span>
                )}
              </span>
              <span className="num">
                {formatDKK(analysis.capitalBreakdown.holding, { compact: true })} ·{" "}
                {Math.round(analysis.capitalBreakdown.shares.holding * 100)} %
              </span>
            </div>
            <div className="flex justify-between" data-testid="fire-capital-pension">
              <span>
                Pension{" "}
                {!analysis.capitalBreakdown.included.pension && (
                  <span className="text-xs text-muted-foreground">
                    (ikke medtaget i Standard FI — vises som fremtidig pensionsstøtte)
                  </span>
                )}
              </span>
              <span className="num">
                {formatDKK(analysis.capitalBreakdown.pension, { compact: true })}
                {analysis.capitalBreakdown.included.pension
                  ? ` · ${Math.round(analysis.capitalBreakdown.shares.pension * 100)} %`
                  : ""}
              </span>
            </div>
            <div className="flex justify-between" data-testid="fire-capital-buffer">
              <span>
                Buffer{" "}
                <span className="text-xs text-muted-foreground">
                  ({analysis.capitalBreakdown.included.buffer ? "kan bruges ved shortfall" : "ikke medtaget"})
                </span>
              </span>
              <span className="num">
                {formatDKK(analysis.capitalBreakdown.buffer, { compact: true })}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 mt-2 font-medium">
              <span>FIRE-kapitalgrundlag i alt</span>
              <span className="num">
                {formatDKK(analysis.capitalBreakdown.totalIncluded, { compact: true })}
              </span>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-4">
          Standard FI-grundlag inkluderer fri kapital{fa.includeHoldingInFire ? " og holding" : ""}{fa.includePensionInFire ? " og pension" : ""}.
          Pension er som udgangspunkt udeladt for at give et konservativt FIRE-billede.
        </p>
      </Card>
    </div>
  );
}

