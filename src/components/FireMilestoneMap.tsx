import { Card } from "@/components/ui/card";
import { formatDKK } from "@/lib/format";
import type { FireAnalysis, FireResult, FireType } from "@/lib/finance/fire";

interface Props {
  analysis: FireAnalysis;
  currentAge: number;
  plannedStopAge?: number | null;
  fullPensionAge?: number | null;
}

const SHORT_DESC: Record<FireType, string> = {
  coast: "Kapitalen kan vokse videre mod målet uden yderligere aktiv opsparing.",
  barista: "Kapital kombineret med deltidsindkomst kan dække behovet.",
  lean: "Kapitalen kan dække et lavt forbrugsniveau.",
  standard: "Kapitalen kan dække dit standardforbrug.",
  fat: "Kapitalen kan dække et mere komfortabelt forbrugsniveau.",
};

const NEXT_ORDER: FireType[] = ["coast", "barista", "lean", "standard", "fat"];

function badge(r: FireResult, currentAge: number): { label: string; tone: string } {
  if (r.status === "achieved" || (r.achievedAtAge !== null && r.achievedAtAge <= currentAge)) {
    return { label: "Opnået", tone: "bg-success/15 text-success border-success/30" };
  }
  if (r.achievedAtAge !== null) {
    return { label: `Opnås ved alder ${r.achievedAtAge}`, tone: "bg-warning/15 text-warning border-warning/30" };
  }
  return { label: "Ikke opnået", tone: "bg-muted text-muted-foreground border-border" };
}

function MilestoneCard({ result, currentAge }: { result: FireResult; currentAge: number }) {
  const b = badge(result, currentAge);
  const req = result.capitalRequired;
  const avail = result.capitalAvailable;
  const rawPct = req > 0 ? (avail / req) * 100 : 0;
  const cappedPct = Math.max(0, Math.min(100, rawPct));
  const pctLabel = req > 0 ? `${Math.round(rawPct)} %` : "—";
  return (
    <Card className="p-4" data-testid={`milestone-card-${result.type}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">{result.label}</div>
        <span className={`text-[10px] uppercase tracking-wider border rounded px-2 py-0.5 ${b.tone}`} data-testid={`milestone-badge-${result.type}`}>
          {b.label}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-2">{SHORT_DESC[result.type]}</div>

      <div className="mt-3">
        <div className="h-2 w-full bg-muted rounded overflow-hidden" aria-hidden>
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${cappedPct}%` }}
            data-testid={`milestone-progress-${result.type}`}
            data-progress={cappedPct.toFixed(2)}
          />
        </div>
        <div className="text-[11px] text-muted-foreground mt-1 flex justify-between">
          <span>Progress</span>
          <span className="num" data-testid={`milestone-progress-label-${result.type}`}>{pctLabel}</span>
        </div>
      </div>

      <div className="text-xs mt-3 space-y-1">
        <div className="flex justify-between"><span>Kapitalbehov</span><span className="num">{req > 0 ? formatDKK(req, { compact: true }) : "—"}</span></div>
        <div className="flex justify-between"><span>Kapitalgrundlag</span><span className="num">{formatDKK(avail, { compact: true })}</span></div>
        <div className="flex justify-between"><span>Gap</span><span className="num">{result.gap > 0 ? formatDKK(result.gap, { compact: true }) : "—"}</span></div>
        <div className="flex justify-between"><span>Tidligst opnået</span><span className="num">{result.achievedAtAge ?? "—"}</span></div>
      </div>
    </Card>
  );
}

function Conclusion({ analysis, currentAge }: { analysis: FireAnalysis; currentAge: number }) {
  const standard = analysis.results.standard;
  if (standard.achievedAtAge !== null && standard.achievedAtAge <= currentAge) {
    return (
      <div className="text-sm" data-testid="milestone-conclusion">
        Standard FI er opnået. Økonomien kan ifølge modellen bære dit standardforbrug.
      </div>
    );
  }
  // find next not yet achieved (or achieved later)
  const next = NEXT_ORDER.map((t) => analysis.results[t]).find(
    (r) => r.achievedAtAge === null || r.achievedAtAge > currentAge,
  );
  if (!next) {
    return <div className="text-sm" data-testid="milestone-conclusion">Alle FIRE-niveauer er opnået i scenariet.</div>;
  }
  if (next.achievedAtAge !== null) {
    // some level already achieved now? check
    const anyAchievedNow = NEXT_ORDER.some((t) => {
      const r = analysis.results[t];
      return r.achievedAtAge !== null && r.achievedAtAge <= currentAge;
    });
    if (anyAchievedNow) {
      return (
        <div className="text-sm" data-testid="milestone-conclusion">
          Næste relevante milepæl er <strong>{next.label}</strong> — forventes nået ved alder {next.achievedAtAge}.
        </div>
      );
    }
    return (
      <div className="text-sm" data-testid="milestone-conclusion">
        Næste milepæl er <strong>{next.label}</strong>. Du mangler ca.{" "}
        <span className="num">{formatDKK(next.gap, { compact: true })}</span> og forventes at nå den ved alder {next.achievedAtAge}, hvis projectionen holder.
      </div>
    );
  }
  return (
    <div className="text-sm" data-testid="milestone-conclusion">
      <strong>{next.label}</strong> opnås ikke i den nuværende projection. Mangler ca.{" "}
      <span className="num">{formatDKK(next.gap, { compact: true })}</span>.
    </div>
  );
}

function Timeline({
  analysis,
  currentAge,
  plannedStopAge,
  fullPensionAge,
}: {
  analysis: FireAnalysis;
  currentAge: number;
  plannedStopAge?: number | null;
  fullPensionAge?: number | null;
}) {
  const fireAges = NEXT_ORDER
    .map((t) => ({ type: t, label: analysis.results[t].label, age: analysis.results[t].achievedAtAge }))
    .filter((x) => x.age !== null) as { type: FireType; label: string; age: number }[];

  const notAchieved = NEXT_ORDER
    .map((t) => ({ type: t, label: analysis.results[t].label, age: analysis.results[t].achievedAtAge }))
    .filter((x) => x.age === null);

  const ages: number[] = [currentAge, ...fireAges.map((f) => f.age)];
  if (plannedStopAge) ages.push(plannedStopAge);
  if (fullPensionAge) ages.push(fullPensionAge);
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages) + 1;
  const span = Math.max(1, maxAge - minAge);
  const pos = (a: number) => `${((a - minAge) / span) * 100}%`;

  return (
    <div className="mt-2" data-testid="milestone-timeline">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Alderstimeline</div>
      <div className="relative h-24">
        {/* axis */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />

        {/* reference markers (below axis) */}
        {[
          { age: currentAge, label: `Nu (${currentAge})`, key: "now" },
          plannedStopAge ? { age: plannedStopAge, label: `Stopalder (${plannedStopAge})`, key: "stop" } : null,
          fullPensionAge ? { age: fullPensionAge, label: `Pension (${fullPensionAge})`, key: "pension" } : null,
        ]
          .filter(Boolean)
          .map((m) => {
            const mm = m as { age: number; label: string; key: string };
            return (
              <div
                key={mm.key}
                className="absolute"
                style={{ left: pos(mm.age), top: "50%", transform: "translate(-50%, 4px)" }}
                data-testid={`timeline-ref-${mm.key}`}
              >
                <div className="w-px h-3 bg-muted-foreground mx-auto" />
                <div className="text-[10px] text-muted-foreground whitespace-nowrap mt-1">{mm.label}</div>
              </div>
            );
          })}

        {/* fire dots (above axis) */}
        {fireAges.map((f, i) => (
          <div
            key={f.type}
            className="absolute"
            style={{ left: pos(f.age), top: "50%", transform: `translate(-50%, -${20 + (i % 2) * 16}px)` }}
            data-testid={`timeline-dot-${f.type}`}
          >
            <div className="text-[10px] whitespace-nowrap text-center mb-1">{f.label}<br/><span className="text-muted-foreground">alder {f.age}</span></div>
            <div className="w-2 h-2 rounded-full bg-primary mx-auto" />
          </div>
        ))}
      </div>

      {notAchieved.length > 0 && (
        <div className="text-[11px] text-muted-foreground mt-2" data-testid="timeline-not-achieved">
          Ikke opnået: {notAchieved.map((n) => n.label).join(", ")}
        </div>
      )}
    </div>
  );
}

export function FireMilestoneMap({ analysis, currentAge, plannedStopAge, fullPensionAge }: Props) {
  const flexibility: FireType[] = ["coast", "barista"];
  const liveOff: FireType[] = ["lean", "standard", "fat"];

  return (
    <Card className="p-5" data-testid="fire-milestone-map">
      <div>
        <h2 className="font-display text-xl font-semibold">FIRE Milestone Map</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Se hvor du er på vej mod forskellige former for økonomisk frihed — fra at kunne stoppe aktiv opsparing til at kunne leve fuldt af kapital.
        </p>
      </div>

      <div className="mt-4 p-3 rounded border border-border bg-muted/30">
        <Conclusion analysis={analysis} currentAge={currentAge} />
      </div>

      <div className="mt-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Fleksibilitet</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {flexibility.map((t) => (
            <MilestoneCard key={t} result={analysis.results[t]} currentAge={currentAge} />
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Lev af kapital</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {liveOff.map((t) => (
            <MilestoneCard key={t} result={analysis.results[t]} currentAge={currentAge} />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <Timeline
          analysis={analysis}
          currentAge={currentAge}
          plannedStopAge={plannedStopAge}
          fullPensionAge={fullPensionAge}
        />
      </div>
    </Card>
  );
}
