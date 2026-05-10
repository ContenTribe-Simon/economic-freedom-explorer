import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFinanceStore } from "@/store/financeStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDKK } from "@/lib/format";
import type { Snapshot } from "@/lib/finance/types";
import { toast } from "sonner";

const SCENARIO_TYPE_LABEL = {
  base: "Base case",
  linked_stress_test: "Linket stress-test",
  custom: "Custom",
} as const;

const STATUS_LABEL = {
  valid: "Validt",
  target_missed: "Mål ikke opfyldt",
  invalid: "Ugyldigt",
} as const;

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("da-DK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Field = {
  label: string;
  /** Returnér visningstekst */
  render: (s: Snapshot) => string;
  /** Numerisk værdi til delta — null hvis ikke sammenlignelig */
  numeric?: (s: Snapshot) => number | null;
  /** Suffix til delta-visning (fx "år", "kr") */
  unit?: "kr" | "år" | "score";
  /** Højere = bedre? Bruges udelukkende til diskret farvning. */
  higherIsBetter?: boolean;
};

const COMPARE_FIELDS: Field[] = [
  { label: "Snapshotnavn", render: (s) => s.snapshotName },
  { label: "Dato", render: (s) => formatDateTime(s.createdAt) },
  { label: "Scenarie", render: (s) => s.scenarioName },
  { label: "Scenarietype", render: (s) => SCENARIO_TYPE_LABEL[s.scenarioType] },
  { label: "Modelstatus", render: (s) => STATUS_LABEL[s.kpis.modelStatus] },
  {
    label: "Planlagt stopalder",
    render: (s) => `${s.kpis.plannedStopAge} år`,
    numeric: (s) => s.kpis.plannedStopAge,
    unit: "år",
    higherIsBetter: false,
  },
  {
    label: "Tidligste bæredygtige stop",
    render: (s) => (s.kpis.earliestSustainableStopAge ? `${s.kpis.earliestSustainableStopAge} år` : "—"),
    numeric: (s) => s.kpis.earliestSustainableStopAge ?? null,
    unit: "år",
    higherIsBetter: false,
  },
  {
    label: "Kapital ved stop",
    render: (s) => formatDKK(s.kpis.capitalAtStopAge, { compact: true }),
    numeric: (s) => s.kpis.capitalAtStopAge,
    unit: "kr",
    higherIsBetter: true,
  },
  {
    label: "Kapital ved 65",
    render: (s) => formatDKK(s.kpis.capitalAt65, { compact: true }),
    numeric: (s) => s.kpis.capitalAt65,
    unit: "kr",
    higherIsBetter: true,
  },
  {
    label: "Kapital ved slutalder",
    render: (s) => formatDKK(s.kpis.capitalAt95, { compact: true }),
    numeric: (s) => s.kpis.capitalAt95,
    unit: "kr",
    higherIsBetter: true,
  },
  {
    label: "Første cashflow-shortfall",
    render: (s) => (s.kpis.firstShortfallAge ? `Alder ${s.kpis.firstShortfallAge}` : "Ingen"),
    numeric: (s) => s.kpis.firstShortfallAge ?? null,
    unit: "år",
    higherIsBetter: true,
  },
  {
    label: "Første finansieringsproblem",
    render: (s) =>
      s.kpis.firstFinancingIssueAge
        ? `${s.kpis.firstFinancingIssueKind ?? "issue"} fra alder ${s.kpis.firstFinancingIssueAge}`
        : "Ingen",
    numeric: (s) => s.kpis.firstFinancingIssueAge ?? null,
    unit: "år",
    higherIsBetter: true,
  },
  {
    label: "Finansiel robusthed",
    render: (s) => `${s.kpis.financialRobustness} / 100`,
    numeric: (s) => s.kpis.financialRobustness,
    unit: "score",
    higherIsBetter: true,
  },
  {
    label: "Antagelsessikkerhed",
    render: (s) => `${s.kpis.assumptionConfidence} / 100`,
    numeric: (s) => s.kpis.assumptionConfidence,
    unit: "score",
    higherIsBetter: true,
  },
  {
    label: "Minimumsmål",
    render: (s) => (s.kpis.endShortfallVsTarget <= 0 ? "Opfyldt" : `Mangler ${formatDKK(s.kpis.endShortfallVsTarget, { compact: true })}`),
  },
];

function formatDelta(diff: number, unit: Field["unit"]): string {
  const sign = diff > 0 ? "+" : "";
  if (unit === "år") return `${sign}${diff} år`;
  if (unit === "score") return `${sign}${diff}`;
  if (unit === "kr") {
    const abs = Math.abs(diff);
    const compact = new Intl.NumberFormat("da-DK", { notation: "compact", maximumFractionDigits: 1 }).format(abs);
    return `${sign}${diff < 0 ? "-" : ""}${compact} kr`;
  }
  return `${sign}${diff}`;
}

export default function Snapshots() {
  const snapshots = useFinanceStore((s) => s.snapshots);
  const renameSnapshot = useFinanceStore((s) => s.renameSnapshot);
  const updateSnapshotNotes = useFinanceStore((s) => s.updateSnapshotNotes);
  const duplicateSnapshot = useFinanceStore((s) => s.duplicateSnapshot);
  const deleteSnapshot = useFinanceStore((s) => s.deleteSnapshot);

  const sorted = useMemo(() => [...snapshots].sort((a, b) => b.createdAt - a.createdAt), [snapshots]);

  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const a = sorted.find((s) => s.snapshotId === aId);
  const b = sorted.find((s) => s.snapshotId === bId);

  return (
    <div className="space-y-8" data-testid="snapshots-page">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Snapshots</div>
          <h1 className="font-display text-3xl font-semibold mt-1">Snapshot-historik</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Hvert snapshot er en frossen kopi af det aktive scenarie på gemmetidspunktet — KPI'er, projektion og
            forudsætninger ændrer sig ikke, selvom scenarier eller basecase senere redigeres.
          </p>
        </div>
        <Link to="/report" className="text-sm text-muted-foreground hover:underline shrink-0">
          Til Rapport →
        </Link>
      </header>

      {sorted.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-muted-foreground text-sm">
          Ingen snapshots gemt endnu. Gå til <Link to="/report" className="underline">Rapport</Link> og gem dit
          første snapshot.
        </div>
      ) : (
        <>
          <section data-testid="snapshot-history">
            <h2 className="font-display text-lg font-semibold mb-3">Historik ({sorted.length})</h2>
            <div className="space-y-3">
              {sorted.map((s) => (
                <article
                  key={s.snapshotId}
                  className="rounded-md border border-border p-4"
                  data-testid="snapshot-row"
                  data-snapshot-id={s.snapshotId}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={s.snapshotName}
                        onChange={(e) => renameSnapshot(s.snapshotId, e.target.value)}
                        className="h-9 font-medium"
                        aria-label="Snapshotnavn"
                      />
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Oprettet: {formatDateTime(s.createdAt)}</span>
                        {s.updatedAt && s.updatedAt !== s.createdAt && (
                          <span>Opdateret: {formatDateTime(s.updatedAt)}</span>
                        )}
                        <span>Scenarie: {s.scenarioName}</span>
                        <span>Type: {SCENARIO_TYPE_LABEL[s.scenarioType]}</span>
                        <span>Modelversion: {s.modelRelease} (v{s.modelVersion})</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs mt-2">
                        <KV label="Modelstatus" value={STATUS_LABEL[s.kpis.modelStatus]} />
                        <KV label="Planlagt stop" value={`${s.kpis.plannedStopAge} år`} />
                        <KV label="Tidligste stop" value={s.kpis.earliestSustainableStopAge ? `${s.kpis.earliestSustainableStopAge} år` : "—"} />
                        <KV label="v. stop" value={formatDKK(s.kpis.capitalAtStopAge, { compact: true })} />
                        <KV label="v. 65" value={formatDKK(s.kpis.capitalAt65, { compact: true })} />
                        <KV label="v. slutalder" value={formatDKK(s.kpis.capitalAt95, { compact: true })} />
                        <KV label="Robusthed" value={`${s.kpis.financialRobustness}/100`} />
                        <KV label="Antagelser" value={`${s.kpis.assumptionConfidence}/100`} />
                        <KV label="Shortfall" value={s.kpis.firstShortfallAge ? `${s.kpis.firstShortfallAge} år` : "Ingen"} />
                        <KV label="Finansiering" value={s.kpis.firstFinancingIssueAge ? `${s.kpis.firstFinancingIssueAge} år` : "Ingen"} />
                      </div>

                      <Textarea
                        value={s.notes ?? ""}
                        onChange={(e) => updateSnapshotNotes(s.snapshotId, e.target.value)}
                        placeholder="Note (fx: 'Efter justering af forbrug til 18.000 kr/md')"
                        rows={2}
                        className="text-xs mt-2"
                        aria-label="Snapshot note"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0 w-full sm:w-32">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/report?snapshot=${s.snapshotId}`}>Åbn rapport</Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (!aId) setAId(s.snapshotId);
                          else if (!bId && s.snapshotId !== aId) setBId(s.snapshotId);
                          else {
                            setAId(s.snapshotId);
                            setBId("");
                          }
                          toast.success("Tilføjet til sammenligning");
                        }}
                      >
                        Sammenlign
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => duplicateSnapshot(s.snapshotId)}>
                        Duplikér
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPendingDelete(s.snapshotId)}
                      >
                        Slet
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section data-testid="snapshot-comparison">
            <h2 className="font-display text-lg font-semibold mb-3">Sammenlign snapshots</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <PickSelect label="Snapshot A" value={aId} onChange={setAId} options={sorted} />
              <PickSelect label="Snapshot B" value={bId} onChange={setBId} options={sorted} />
            </div>

            {!a || !b ? (
              <p className="text-sm text-muted-foreground italic">Vælg to snapshots for at sammenligne.</p>
            ) : a.snapshotId === b.snapshotId ? (
              <p className="text-sm text-muted-foreground italic">Vælg to forskellige snapshots.</p>
            ) : (
              <div className="rounded-md border border-border overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[640px]" data-testid="comparison-table">
                  <thead>
                    <tr className="text-left border-b border-border bg-muted/40">
                      <th className="py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground">Felt</th>
                      <th className="py-2 px-3">Snapshot A</th>
                      <th className="py-2 px-3">Snapshot B</th>
                      <th className="py-2 px-3">Ændring</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARE_FIELDS.map((f) => {
                      const va = f.render(a);
                      const vb = f.render(b);
                      let deltaCell: React.ReactNode = <span className="text-muted-foreground">—</span>;

                      if (f.numeric) {
                        const na = f.numeric(a);
                        const nb = f.numeric(b);
                        if (na === null || nb === null) {
                          deltaCell = <span className="text-muted-foreground italic">Ikke sammenlignelig</span>;
                        } else {
                          const diff = nb - na;
                          if (diff === 0) {
                            deltaCell = <span className="text-muted-foreground">Uændret</span>;
                          } else {
                            const better =
                              f.higherIsBetter === undefined
                                ? null
                                : f.higherIsBetter
                                  ? diff > 0
                                  : diff < 0;
                            const cls =
                              better === null
                                ? "text-foreground"
                                : better
                                  ? "text-success"
                                  : "text-destructive";
                            const word = better === null ? "Ændring" : better ? "Forbedret" : "Forværret";
                            deltaCell = (
                              <span className={cls} data-direction={better === null ? "neutral" : better ? "better" : "worse"}>
                                {formatDelta(diff, f.unit)}
                                <span className="text-[10px] uppercase tracking-wider ml-2 opacity-70">{word}</span>
                              </span>
                            );
                          }
                        }
                      } else if (va !== vb) {
                        deltaCell = <span className="text-muted-foreground">Ændring</span>;
                      } else {
                        deltaCell = <span className="text-muted-foreground">Uændret</span>;
                      }

                      return (
                        <tr key={f.label} className="border-b border-border/60" data-field={f.label}>
                          <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">{f.label}</td>
                          <td className="py-1.5 px-3 num">{va}</td>
                          <td className="py-1.5 px-3 num">{vb}</td>
                          <td className="py-1.5 px-3 num text-xs">{deltaCell}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              Snapshot'et fjernes permanent fra din lokale historik. Eksportér først hvis du vil bevare en kopi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  deleteSnapshot(pendingDelete);
                  if (aId === pendingDelete) setAId("");
                  if (bId === pendingDelete) setBId("");
                }
                setPendingDelete(null);
              }}
            >
              Slet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function PickSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Snapshot[];
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Vælg snapshot" />
        </SelectTrigger>
        <SelectContent>
          {options.map((s) => (
            <SelectItem key={s.snapshotId} value={s.snapshotId}>
              {s.snapshotName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
