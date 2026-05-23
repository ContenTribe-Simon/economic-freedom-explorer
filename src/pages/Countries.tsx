import { useMemo, useState } from "react";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { FIRE_DEFAULTS, computeFireAnalysis } from "@/lib/finance/fire";
import {
  computeCountryFireResults,
  describeAnalysisMode,
  describeStatusAtAnalysisAge,
  formatWithdrawalRatePct,
  lifestyleLabel,
  resolveAnalysisAge,
  summarizeCountryStatus,
  type CountryAnalysisReferenceMode,
  type CountryFireResult,
  type CountryLifestyle,
  type CountryProfile,
} from "@/lib/finance/country";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumberInput } from "@/components/NumberInput";
import { formatDKK } from "@/lib/format";
import { ChevronDown, Trash2, Copy, Plus, RotateCcw } from "lucide-react";

const LIFESTYLES: CountryLifestyle[] = ["lean", "standard", "comfortable"];

function statusTone(status: string): string {
  if (status === "achieved") return "text-success";
  if (status === "near") return "text-warning";
  return "text-muted-foreground";
}

function pctInputValue(decimal: number | undefined): string {
  const n = (decimal ?? 0) * 100;
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return n.toFixed(1).replace(".", ",");
}

function MiniBar({ value, max, tone = "primary" }: { value: number; max: number; tone?: "primary" | "warning" | "success" | "muted" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const cls =
    tone === "warning" ? "bg-warning"
      : tone === "success" ? "bg-success"
      : tone === "muted" ? "bg-muted-foreground/40"
      : "bg-primary";
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
      <div className={`h-full ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function CountriesPage() {
  const scenario = useResolvedActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);
  const countryProfiles = useFinanceStore((s) => s.countryProfiles);
  const addCountryProfile = useFinanceStore((s) => s.addCountryProfile);
  const updateCountryProfile = useFinanceStore((s) => s.updateCountryProfile);
  const removeCountryProfile = useFinanceStore((s) => s.removeCountryProfile);
  const duplicateCountryProfile = useFinanceStore((s) => s.duplicateCountryProfile);
  const toggleCountryProfile = useFinanceStore((s) => s.toggleCountryProfile);
  const resetCountryProfilesToDefaults = useFinanceStore((s) => s.resetCountryProfilesToDefaults);
  const analysisSettings = useFinanceStore((s) => s.countryAnalysisSettings);
  const updateAnalysis = useFinanceStore((s) => s.updateCountryAnalysisSettings);

  const [wrInput, setWrInput] = useState<string>(formatWithdrawalRatePct(FIRE_DEFAULTS.withdrawalRate));
  const wr = useMemo(() => {
    const n = parseFloat(wrInput.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n / 100 : FIRE_DEFAULTS.withdrawalRate;
  }, [wrInput]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showExtraCols, setShowExtraCols] = useState(false);
  const [levelFilter, setLevelFilter] = useState<"all" | CountryLifestyle>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  const years = useMemo(() => project(scenario, assumptions), [scenario, assumptions]);

  const fire = useMemo(
    () => computeFireAnalysis(scenario, years, assumptions),
    [scenario, years, assumptions],
  );
  const fireRefAge = fire.capitalBreakdown.referenceAge;

  const analysisAge = useMemo(
    () => resolveAnalysisAge(scenario, years, analysisSettings, fireRefAge),
    [scenario, years, analysisSettings, fireRefAge],
  );

  const results = useMemo(
    () =>
      computeCountryFireResults(scenario, years, assumptions, countryProfiles, {
        withdrawalRate: wr,
        analysisSettings,
      }),
    [scenario, years, assumptions, countryProfiles, wr, analysisSettings],
  );

  const enabled = countryProfiles.filter((c) => c.enabled);
  const selectedCountry: CountryProfile | undefined =
    countryProfiles.find((c) => c.id === selectedId) ?? enabled[0];

  // Header capital metrics
  const expectedCapital = results[0]?.expectedCapitalAtReferenceAge ?? 0;
  const grossSustainableMonthly = (expectedCapital * wr) / 12;

  // Standard-niveau results sortering for summary strip
  const standardResults = results.filter((r) => r.lifestyle === "standard");
  const dkProfile = countryProfiles.find((c) => /danmark|denmark/i.test(c.name));
  const dkStd = dkProfile ? standardResults.find((r) => r.countryId === dkProfile.id) : undefined;

  const lowestNeed = [...standardResults].sort((a, b) => a.selectedCapitalNeed - b.selectedCapitalNeed)[0];
  const lowestGap = [...standardResults]
    .filter((r) => r.gap >= 0)
    .sort((a, b) => a.gap - b.gap)[0];
  const cheapestSpend = [...standardResults].sort((a, b) => a.monthlyNetCost - b.monthlyNetCost)[0];
  const europeMatch = standardResults.find((r) => /portugal|spanien|spain|tysk|italien|frankrig|grækenland|EU/i.test(r.countryName));

  // For badges
  const lowestNeedId = lowestNeed?.countryId;
  const lowestGapId = lowestGap?.countryId;
  const cheapestSpendId = cheapestSpend?.countryId;

  // Build filtered table results
  const tableResults = useMemo(() => {
    if (levelFilter === "all") return results;
    return results.filter((r) => r.lifestyle === levelFilter);
  }, [results, levelFilter]);

  // Sorting in table
  const [sortKey, setSortKey] = useState<string>("country");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortedTable = useMemo(() => {
    const copy = [...tableResults];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      const get = (r: CountryFireResult) => {
        switch (sortKey) {
          case "country": return r.countryName;
          case "level": return LIFESTYLES.indexOf(r.lifestyle);
          case "monthly": return r.monthlyNetCost;
          case "annual": return r.totalAnnualNeed;
          case "need": return r.selectedCapitalNeed;
          case "expected": return r.expectedCapitalAtReferenceAge;
          case "gap": return r.gap;
          default: return 0;
        }
      };
      const va = get(a); const vb = get(b);
      if (typeof va === "string") return va.localeCompare(vb as string) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
    return copy;
  }, [tableResults, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // Helpers
  function deltaVsDk(value: number, dkValue: number | undefined): string | null {
    if (dkValue === undefined || !dkProfile) return null;
    const d = value - dkValue;
    if (Math.abs(d) < 1) return "≈ Danmark";
    const sign = d > 0 ? "+" : "−";
    return `${sign}${formatDKK(Math.abs(d), { compact: true })} vs. Danmark`;
  }

  // Max for visualisation in cards
  const maxNeedAcrossEnabled = Math.max(
    1,
    ...standardResults.map((r) => r.selectedCapitalNeed),
  );
  const maxGapAcrossEnabled = Math.max(
    1,
    ...standardResults.map((r) => r.gap),
  );

  const minProjAge = years[0]?.age ?? scenario.inputs.person.currentAge;
  const maxProjAge = years[years.length - 1]?.age ?? scenario.inputs.person.lifeExpectancy;

  return (
    <div className="space-y-8" data-testid="countries-page">
      {/* A. Header */}
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Lande</div>
        <h1 className="font-display text-4xl font-semibold mt-1">Landeanalyse</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl">
          Sammenlign hvordan forskellige lande og livsstilsniveauer påvirker dit FIRE-behov.
        </p>
        <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
          Alle beløb er i <strong>DKK / nutidskroner</strong>. Valuta er kun referenceetiket.
          Tallene er modelantagelser — ikke rådgivning.
        </p>
      </header>

      {/* B. Control panel */}
      <Card className="p-4" data-testid="control-panel">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Aktivt scenarie</Label>
            <div className="text-sm font-medium truncate" title={scenario.name}>{scenario.name}</div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="wr" className="text-xs uppercase text-muted-foreground">Udtræksrate</Label>
            <div className="flex items-center gap-1">
              <Input
                id="wr"
                value={wrInput}
                onChange={(e) => setWrInput(e.target.value)}
                onBlur={() => setWrInput(formatWithdrawalRatePct(wr))}
                className="w-20 h-8"
                data-testid="wr-input"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs uppercase text-muted-foreground">Analysealder / flyttetidspunkt</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={analysisSettings.referenceMode}
                onValueChange={(v) => updateAnalysis({ referenceMode: v as CountryAnalysisReferenceMode })}
              >
                <SelectTrigger className="h-8 w-56" data-testid="analysis-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Nu</SelectItem>
                  <SelectItem value="inYears">Om X år</SelectItem>
                  <SelectItem value="plannedStopAge">Ved planlagt stopalder</SelectItem>
                  <SelectItem value="manualAge">Manuel alder</SelectItem>
                  <SelectItem value="fireReference">Anbefalet (FIRE-referencealder)</SelectItem>
                </SelectContent>
              </Select>
              {analysisSettings.referenceMode === "inYears" && (
                <Input
                  type="number"
                  className="h-8 w-20"
                  value={analysisSettings.yearsFromNow ?? 5}
                  onChange={(e) => updateAnalysis({ yearsFromNow: Number(e.target.value) || 0 })}
                  data-testid="analysis-years"
                />
              )}
              {analysisSettings.referenceMode === "manualAge" && (
                <Input
                  type="number"
                  min={minProjAge}
                  max={maxProjAge}
                  className="h-8 w-20"
                  value={analysisSettings.manualReferenceAge ?? scenario.inputs.person.currentAge}
                  onChange={(e) => updateAnalysis({ manualReferenceAge: Number(e.target.value) || 0 })}
                  data-testid="analysis-age"
                />
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Analysen viser økonomien ved alder <strong>{analysisAge}</strong>.
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Forventet kapital</Label>
            <div className="text-sm font-medium num">{formatDKK(expectedCapital, { compact: true })}</div>
            <div className="text-[11px] text-muted-foreground">
              Brutto bæredygtigt: {formatDKK(grossSustainableMonthly, { compact: true })}/md.
            </div>
          </div>
        </div>
      </Card>

      {/* C. Summary strip */}
      {standardResults.length > 0 && (
        <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3" data-testid="summary-strip">
          {dkStd && (
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Danmark baseline</div>
              <div className="text-sm font-semibold mt-1">{formatDKK(dkStd.selectedCapitalNeed, { compact: true })}</div>
              <div className="text-[11px] text-muted-foreground">Standard kapitalbehov</div>
            </Card>
          )}
          {lowestNeed && (
            <Card className="p-3 border-primary/30">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Laveste kapitalbehov</div>
              <div className="text-sm font-semibold mt-1">{lowestNeed.countryName}</div>
              <div className="text-[11px]">{formatDKK(lowestNeed.selectedCapitalNeed, { compact: true })}</div>
            </Card>
          )}
          {lowestGap && (
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Mindste Standard-gap</div>
              <div className="text-sm font-semibold mt-1">{lowestGap.countryName}</div>
              <div className="text-[11px]">
                {lowestGap.gap > 0 ? formatDKK(lowestGap.gap, { compact: true }) : "Opnået"}
              </div>
            </Card>
          )}
          {cheapestSpend && (
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Billigste Standard</div>
              <div className="text-sm font-semibold mt-1">{cheapestSpend.countryName}</div>
              <div className="text-[11px]">{formatDKK(cheapestSpend.monthlyNetCost, { compact: true })}/md.</div>
            </Card>
          )}
          {europeMatch && europeMatch.countryId !== lowestNeedId && (
            <Card className="p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Europa-valg</div>
              <div className="text-sm font-semibold mt-1">{europeMatch.countryName}</div>
              <div className="text-[11px]">{formatDKK(europeMatch.selectedCapitalNeed, { compact: true })}</div>
            </Card>
          )}
        </section>
      )}

      {/* D. Country cards */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Aktive lande</h2>
        {enabled.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground italic">
            Ingen aktive lande. Aktivér eller tilføj en landeprofil længere nede.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {enabled.map((c) => {
              const std = results.find((r) => r.countryId === c.id && r.lifestyle === "standard");
              if (!std) return null;
              const summary = summarizeCountryStatus(results, c.id);
              const isDk = dkProfile?.id === c.id;
              const isSelected = selectedCountry?.id === c.id;
              const dkSpend = dkStd?.monthlyNetCost;
              const dkNeed = dkStd?.selectedCapitalNeed;
              return (
                <Card
                  key={c.id}
                  data-testid={`country-card-${c.id}`}
                  className={`p-4 cursor-pointer transition-colors ${isSelected ? "border-primary" : ""}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className={`text-xs ${statusTone(summary.tone)}`}>{summary.label}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isDk && <Badge variant="outline" className="text-[10px]">Baseline</Badge>}
                      {c.id === lowestNeedId && <Badge className="text-[10px]">Lav. behov</Badge>}
                      {c.id === lowestGapId && lowestGap!.gap > 0 && (
                        <Badge variant="secondary" className="text-[10px]">Mindste gap</Badge>
                      )}
                      {c.id === cheapestSpendId && c.id !== lowestNeedId && (
                        <Badge variant="secondary" className="text-[10px]">Billigst</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
                    <div>Lean: {formatDKK(c.monthlyCostLean, { compact: true })}/md.</div>
                    <div>Standard: {formatDKK(c.monthlyCostStandard, { compact: true })}/md.
                      {!isDk && dkSpend && (
                        <span className="ml-1 text-[10px]">
                          ({deltaVsDk(c.monthlyCostStandard, dkSpend)})
                        </span>
                      )}
                    </div>
                    <div>Comf.: {formatDKK(c.monthlyCostComfortable, { compact: true })}/md.</div>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Standard kapitalbehov</span>
                        <span className="font-medium">{formatDKK(std.selectedCapitalNeed, { compact: true })}</span>
                      </div>
                      <MiniBar value={std.selectedCapitalNeed} max={maxNeedAcrossEnabled} />
                      {!isDk && dkNeed !== undefined && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {deltaVsDk(std.selectedCapitalNeed, dkNeed)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Standard gap (alder {std.analysisAge})</span>
                        <span className="font-medium">
                          {std.gap > 0 ? formatDKK(std.gap, { compact: true }) : "—"}
                        </span>
                      </div>
                      <MiniBar value={std.gap} max={maxGapAcrossEnabled} tone="warning" />
                    </div>
                    <div className="flex justify-between pt-1 border-t border-border/50">
                      <span className="text-muted-foreground">Rådighedsbeløb (alder {std.analysisAge})</span>
                      <span className="num">{formatDKK(std.sustainableMonthlyNetAtReferenceAge, { compact: true })}/md.</span>
                    </div>
                    {summary.achievedAge !== null && (
                      <div className="text-[11px] text-muted-foreground">
                        Tidligst opnåede alder: <span className="text-foreground font-medium">{summary.achievedAge}</span>
                        {" "}({lifestyleLabel(summary.achievedLifestyle!)})
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* E. Comparison table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display text-xl font-semibold">Sammenligning</h2>
          <div className="flex items-center gap-2 text-xs">
            <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as "all" | CountryLifestyle)}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle niveauer</SelectItem>
                <SelectItem value="lean">Kun Lean</SelectItem>
                <SelectItem value="standard">Kun Standard</SelectItem>
                <SelectItem value="comfortable">Kun Comfortable</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setShowExtraCols((v) => !v)}>
              {showExtraCols ? "Skjul ekstra kolonner" : "Vis flere kolonner"}
            </Button>
          </div>
        </div>
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="country-comparison">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left p-2 cursor-pointer" onClick={() => toggleSort("country")}>Land</th>
                <th className="text-left p-2 cursor-pointer" onClick={() => toggleSort("level")}>Niveau</th>
                <th className="text-right p-2 cursor-pointer" onClick={() => toggleSort("monthly")}>Md. forbrug</th>
                <th className="text-right p-2 cursor-pointer" onClick={() => toggleSort("annual")}>Årligt behov</th>
                <th className="text-right p-2 cursor-pointer" onClick={() => toggleSort("need")}>Kapitalbehov</th>
                <th className="text-right p-2 cursor-pointer" onClick={() => toggleSort("expected")}>Forv. kapital</th>
                <th className="text-right p-2 cursor-pointer" onClick={() => toggleSort("gap")}>Gap</th>
                {showExtraCols && (
                  <>
                    <th className="text-right p-2">Kapital @3,5 %</th>
                    <th className="text-right p-2">Kapital @4 %</th>
                    <th className="text-right p-2" title="Kapital × udtræksrate / 12.">Brutto udtræk/md.</th>
                    <th className="text-right p-2" title="Efter faste landeomkostninger og buffer/friktion.">Rådigh./md.</th>
                  </>
                )}
                <th className="text-left p-2">Status ved alder {analysisAge}</th>
                <th className="text-right p-2">Tidligst opnået</th>
              </tr>
            </thead>
            <tbody>
              {sortedTable.map((r) => {
                const isSelected = r.countryId === selectedCountry?.id;
                const desc = describeStatusAtAnalysisAge(r);
                return (
                  <tr
                    key={`${r.countryId}-${r.lifestyle}`}
                    className={`border-t border-border ${isSelected ? "bg-muted/40" : ""}`}
                  >
                    <td className="p-2">{r.countryName}</td>
                    <td className="p-2">{lifestyleLabel(r.lifestyle)}</td>
                    <td className="p-2 text-right num">{formatDKK(r.monthlyNetCost, { compact: true })}</td>
                    <td className="p-2 text-right num">{formatDKK(r.totalAnnualNeed, { compact: true })}</td>
                    <td className="p-2 text-right num">{formatDKK(r.selectedCapitalNeed, { compact: true })}</td>
                    <td className="p-2 text-right num">{formatDKK(r.expectedCapitalAtReferenceAge, { compact: true })}</td>
                    <td className="p-2 text-right num">{r.gap > 0 ? formatDKK(r.gap, { compact: true }) : "—"}</td>
                    {showExtraCols && (
                      <>
                        <td className="p-2 text-right num">{formatDKK(r.capitalNeed35, { compact: true })}</td>
                        <td className="p-2 text-right num">{formatDKK(r.capitalNeed40, { compact: true })}</td>
                        <td className="p-2 text-right num">{formatDKK(r.grossSustainableMonthlyAtReferenceAge, { compact: true })}</td>
                        <td className="p-2 text-right num">{formatDKK(r.sustainableMonthlyNetAtReferenceAge, { compact: true })}</td>
                      </>
                    )}
                    <td className={`p-2 ${statusTone(desc.tone)}`}>{desc.label}</td>
                    <td className="p-2 text-right num">{r.earliestAchievedAge ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <p className="text-[11px] text-muted-foreground">
          <strong>Status ved alder {analysisAge}</strong> viser, om økonomien kan bære landet på det valgte tidspunkt.
          <strong> Tidligst opnået</strong> alder viser første alder i hele fremskrivningen, hvor niveauet kan bæres.
        </p>
      </section>

      {/* F. Detail for selected country */}
      {selectedCountry && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">
            Detaljer — {selectedCountry.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            Beregnet ved analysealder <strong>{analysisAge}</strong> ({describeAnalysisMode(analysisSettings, analysisAge, scenario)}).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {LIFESTYLES.map((lvl) => {
              const r = results.find((x) => x.countryId === selectedCountry.id && x.lifestyle === lvl);
              if (!r) return null;
              return (
                <Card key={lvl} className="p-4">
                  <div className="font-semibold mb-2">{lifestyleLabel(lvl)}</div>

                  {/* 1. Mål */}
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Mål</div>
                  <div className="space-y-1 text-sm mb-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ønsket md. forbrug</span>
                      <span className="num">{formatDKK(r.monthlyNetCost, { compact: true })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total årligt behov</span>
                      <span className="num">{formatDKK(r.totalAnnualNeed, { compact: true })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kapitalbehov</span>
                      <span className="num font-medium">{formatDKK(r.selectedCapitalNeed, { compact: true })}</span>
                    </div>
                  </div>

                  {/* 2. Status ved analysealder */}
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                    Status ved analysealder {r.analysisAge}
                  </div>
                  <div className="space-y-1 text-sm mb-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Forventet kapital</span>
                      <span className="num">{formatDKK(r.expectedCapitalAtReferenceAge, { compact: true })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gap</span>
                      <span className="num">{r.gap > 0 ? formatDKK(r.gap, { compact: true }) : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className={statusTone(r.status)}>{statusLabel(r.status)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{r.monthlySurplus > 0 ? "Overskud" : "Mangler"}/md.</span>
                      <span className={`num ${r.monthlySurplus > 0 ? "text-success" : r.monthlyShortfall > 0 ? "text-warning" : ""}`}>
                        {r.monthlySurplus > 0
                          ? formatDKK(r.monthlySurplus, { compact: true })
                          : r.monthlyShortfall > 0
                          ? formatDKK(r.monthlyShortfall, { compact: true })
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tidligst opnået alder</span>
                      <span className="num">{r.earliestAchievedAge ?? "Ikke opnået"}</span>
                    </div>
                  </div>

                  {/* 3. Hvad økonomien kan bære */}
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                    Hvad økonomien kan bære
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Brutto bæredygtigt udtræk</span>
                      <span className="num">{formatDKK(r.grossSustainableMonthlyAtReferenceAge, { compact: true })}/md.</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Landespecifikt rådighedsbeløb</span>
                      <span className="num">{formatDKK(r.sustainableMonthlyNetAtReferenceAge, { compact: true })}/md.</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Brutto udtræk er kapital × udtræksrate / 12 (uafhængigt af land). Rådighedsbeløb fratrækker faste landeomkostninger og friktion/buffere.
                  </p>

                  {r.keyDrivers.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/50">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Drivere</div>
                      <div className="flex flex-wrap gap-1">
                        {r.keyDrivers.map((d) => (
                          <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* H. Mellemregning collapsible */}
          {(() => {
            const std = results.find(
              (x) => x.countryId === selectedCountry.id && x.lifestyle === "standard",
            );
            if (!std) return null;
            const grossAnnual = std.expectedCapitalAtReferenceAge * std.selectedWithdrawalRate;
            return (
              <Collapsible open={calcOpen} onOpenChange={setCalcOpen}>
                <Card className="p-0">
                  <CollapsibleTrigger className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors">
                    <span className="text-sm font-semibold">
                      Se hvordan rådighedsbeløb er beregnet — {selectedCountry.name} (Standard)
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${calcOpen ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Kapitalgrundlag (alder {std.analysisAge})</span>
                          <span className="num">{formatDKK(std.expectedCapitalAtReferenceAge, { compact: true })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Valgt udtræksrate</span>
                          <span className="num">{formatWithdrawalRatePct(std.selectedWithdrawalRate)} %</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Årligt brutto udtræk</span>
                          <span className="num">{formatDKK(grossAnnual, { compact: true })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Faste årlige landeomkostninger</span>
                          <span className="num">−{formatDKK(std.annualExtras, { compact: true })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Økonomisk friktion/skat</span>
                          <span className="num">{pctInputValue(selectedCountry.effectiveTaxOrFrictionPct)} %</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Valutabuffer</span>
                          <span className="num">{pctInputValue(selectedCountry.currencyRiskBufferPct)} %</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ekstra buffer</span>
                          <span className="num">{pctInputValue(selectedCountry.generalSafetyBufferPct)} %</span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-1 mt-1 md:col-span-2">
                          <span className="font-medium">Landespecifikt rådighedsbeløb pr. md.</span>
                          <span className="num font-medium">
                            {formatDKK(std.sustainableMonthlyNetAtReferenceAge, { compact: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })()}

          {/* I. Sensitivity */}
          {(() => {
            const std = results.find(
              (x) => x.countryId === selectedCountry.id && x.lifestyle === "standard",
            );
            if (!std) return null;
            const deltas = [-0.20, -0.10, 0, 0.10];
            const sens = deltas.map((delta) => {
              const factor = 1 + delta;
              const need = std.totalAnnualNeed * factor;
              const cap = wr > 0 ? need / wr : 0;
              const gap = Math.max(0, cap - std.expectedCapitalAtReferenceAge);
              return { delta, monthly: std.monthlyNetCost * factor, need, cap, gap };
            });
            const maxCap = Math.max(...sens.map((s) => s.cap), 1);
            return (
              <Card className="p-4">
                <div className="text-sm font-semibold mb-3">Følsomhed (Standard-niveau)</div>
                <div className="space-y-2">
                  {sens.map((s) => (
                    <div key={s.delta} className="grid grid-cols-12 items-center gap-2 text-xs">
                      <div className="col-span-2 font-medium">
                        {s.delta === 0 ? "Basis" : `${s.delta > 0 ? "+" : ""}${Math.round(s.delta * 100)} %`}
                      </div>
                      <div className="col-span-2 text-right num">{formatDKK(s.monthly, { compact: true })}/md.</div>
                      <div className="col-span-2 text-right num">{formatDKK(s.need, { compact: true })}</div>
                      <div className="col-span-3"><MiniBar value={s.cap} max={maxCap} /></div>
                      <div className="col-span-2 text-right num">{formatDKK(s.cap, { compact: true })}</div>
                      <div className="col-span-1 text-right num text-warning">
                        {s.gap > 0 ? formatDKK(s.gap, { compact: true }) : "—"}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mt-2 pt-2 border-t border-border/50">
                  <div className="col-span-2">Ændring</div>
                  <div className="col-span-2 text-right">Md. forbrug</div>
                  <div className="col-span-2 text-right">Årligt behov</div>
                  <div className="col-span-3">Kapitalbehov</div>
                  <div className="col-span-2 text-right">Beløb</div>
                  <div className="col-span-1 text-right">Gap</div>
                </div>
              </Card>
            );
          })()}
        </section>
      )}

      {/* J. Edit profiles — collapsible */}
      <Collapsible open={editorOpen} onOpenChange={setEditorOpen}>
        <Card className="p-0">
          <CollapsibleTrigger className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors" data-testid="editor-trigger">
            <div>
              <div className="font-display text-xl font-semibold">Tilpas landeprofiler</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Demo-tal — skal erstattes med egne antagelser. Alle beløb i DKK / nutidskroner.
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${editorOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 pt-0 space-y-3">
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => addCountryProfile()}>
                  <Plus className="h-4 w-4 mr-1" /> Tilføj land
                </Button>
                <Button size="sm" variant="ghost" onClick={() => resetCountryProfilesToDefaults()}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Nulstil til demo
                </Button>
              </div>
              {countryProfiles.map((c) => (
                <Card key={c.id} className="p-4 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Input
                      value={c.name}
                      onChange={(e) => updateCountryProfile(c.id, { name: e.target.value })}
                      className="max-w-xs font-medium"
                    />
                    <Input
                      value={c.currency ?? ""}
                      onChange={(e) => updateCountryProfile(c.id, { currency: e.target.value })}
                      placeholder="Referencevaluta"
                      className="w-32"
                    />
                    <Button
                      size="sm"
                      variant={c.enabled ? "secondary" : "outline"}
                      onClick={() => toggleCountryProfile(c.id)}
                    >
                      {c.enabled ? "Aktiv" : "Inaktiv"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => duplicateCountryProfile(c.id)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeCountryProfile(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Lean (DKK/md.)</Label>
                      <NumberInput value={c.monthlyCostLean} onChange={(v) => updateCountryProfile(c.id, { monthlyCostLean: v })} />
                    </div>
                    <div>
                      <Label>Standard (DKK/md.)</Label>
                      <NumberInput value={c.monthlyCostStandard} onChange={(v) => updateCountryProfile(c.id, { monthlyCostStandard: v })} />
                    </div>
                    <div>
                      <Label>Comfortable (DKK/md.)</Label>
                      <NumberInput value={c.monthlyCostComfortable} onChange={(v) => updateCountryProfile(c.id, { monthlyCostComfortable: v })} />
                    </div>
                    <div>
                      <Label>Sundhed/forsikring pr. år</Label>
                      <NumberInput value={c.annualHealthcareCost ?? 0} onChange={(v) => updateCountryProfile(c.id, { annualHealthcareCost: v })} />
                    </div>
                    <div>
                      <Label>Rejser/hjemrejser pr. år</Label>
                      <NumberInput value={c.annualTravelHomeCost ?? 0} onChange={(v) => updateCountryProfile(c.id, { annualTravelHomeCost: v })} />
                    </div>
                    <div>
                      <Label>Admin/ophold pr. år</Label>
                      <NumberInput value={c.annualAdminCost ?? 0} onChange={(v) => updateCountryProfile(c.id, { annualAdminCost: v })} />
                    </div>
                    <div>
                      <Label>Økonomisk friktion/skat (%)</Label>
                      <Input
                        value={pctInputValue(c.effectiveTaxOrFrictionPct)}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value.replace(",", "."));
                          updateCountryProfile(c.id, { effectiveTaxOrFrictionPct: Number.isFinite(n) ? n / 100 : 0 });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Valutabuffer (%)</Label>
                      <Input
                        value={pctInputValue(c.currencyRiskBufferPct)}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value.replace(",", "."));
                          updateCountryProfile(c.id, { currencyRiskBufferPct: Number.isFinite(n) ? n / 100 : 0 });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Ekstra buffer (%)</Label>
                      <Input
                        value={pctInputValue(c.generalSafetyBufferPct)}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value.replace(",", "."));
                          updateCountryProfile(c.id, { generalSafetyBufferPct: Number.isFinite(n) ? n / 100 : 0 });
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Noter</Label>
                    <Input
                      value={c.notes ?? ""}
                      onChange={(e) => updateCountryProfile(c.id, { notes: e.target.value })}
                      placeholder="Demo-tal — skal erstattes med egne antagelser."
                    />
                  </div>
                </Card>
              ))}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Disclaimer */}
      <section className="text-xs text-muted-foreground border-t border-border pt-4 leading-relaxed">
        Landeanalysen er et groft økonomisk modelværktøj. Den tager ikke højde for individuel skat,
        visum, sundhedsdækning eller juridiske forhold. Brug værdierne som egne antagelser, ikke
        som rådgivning. Alle beløb er i DKK / nutidskroner.
      </section>
    </div>
  );
}
