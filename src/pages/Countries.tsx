import { useMemo, useState } from "react";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { FIRE_DEFAULTS } from "@/lib/finance/fire";
import {
  computeCountryFireResults,
  formatWithdrawalRatePct,
  lifestyleLabel,
  nearestForCountry,
  statusLabel,
  summarizeCountryStatus,
  type CountryLifestyle,
  type CountryProfile,
} from "@/lib/finance/country";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/NumberInput";
import { formatDKK } from "@/lib/format";
import { Trash2, Copy, Plus, RotateCcw } from "lucide-react";

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

  const [wrInput, setWrInput] = useState<string>(formatWithdrawalRatePct(FIRE_DEFAULTS.withdrawalRate));
  const wr = useMemo(() => {
    const n = parseFloat(wrInput.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n / 100 : FIRE_DEFAULTS.withdrawalRate;
  }, [wrInput]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const results = useMemo(() => {
    const years = project(scenario, assumptions);
    return computeCountryFireResults(scenario, years, assumptions, countryProfiles, {
      withdrawalRate: wr,
    });
  }, [scenario, assumptions, countryProfiles, wr]);

  const enabled = countryProfiles.filter((c) => c.enabled);
  const selectedCountry: CountryProfile | undefined =
    countryProfiles.find((c) => c.id === selectedId) ?? enabled[0];

  return (
    <div className="space-y-8" data-testid="countries-page">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Lande</div>
        <h1 className="font-display text-4xl font-semibold mt-1">Landeanalyse</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl">
          Sammenlign hvordan forskellige lande og livsstilsniveauer påvirker dit FIRE-behov.
          Modulet er økonomisk fokuseret — visum, sundhedssystem og personligt fit indgår ikke.
        </p>
        <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
          <strong>Alle beløb indtastes og beregnes i DKK / nutidskroner.</strong> Valuta er kun en referenceetiket.
        </p>
        <div className="mt-3 text-xs text-muted-foreground">
          Aktivt scenarie: <span className="text-foreground font-medium">{scenario.name}</span>{" "}
          · Udtræksrate:{" "}
          <span className="text-foreground font-medium">{formatWithdrawalRatePct(wr)} %</span>
        </div>
      </header>

      {/* Settings */}
      <Card className="p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="wr">Valgt udtræksrate (%)</Label>
            <Input
              id="wr"
              value={wrInput}
              onChange={(e) => setWrInput(e.target.value)}
              onBlur={() => setWrInput(formatWithdrawalRatePct(wr))}
              className="w-28"
              data-testid="wr-input"
            />
          </div>
          <div className="text-xs text-muted-foreground max-w-md">
            Standardværdi 3,5 %. Tabellen viser også 4 % som klassisk benchmark.
          </div>
        </div>
      </Card>

      {/* Country cards */}
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
              return (
                <Card
                  key={c.id}
                  data-testid={`country-card-${c.id}`}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedCountry?.id === c.id ? "border-primary" : ""
                  }`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="flex items-baseline justify-between mb-2 gap-2">
                    <div className="font-semibold">{c.name}</div>
                    <div className={`text-xs text-right ${statusTone(summary.tone)}`}>
                      {summary.label}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>Lean: {formatDKK(c.monthlyCostLean, { compact: true })}/md.</div>
                    <div>Standard: {formatDKK(c.monthlyCostStandard, { compact: true })}/md.</div>
                    <div>Comfortable: {formatDKK(c.monthlyCostComfortable, { compact: true })}/md.</div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-border text-xs space-y-1">
                    <div>
                      Standard kapitalbehov:{" "}
                      <span className="font-medium">
                        {formatDKK(std.selectedCapitalNeed, { compact: true })}
                      </span>
                    </div>
                    <div>
                      Standard gap:{" "}
                      <span className="font-medium">
                        {std.gap > 0 ? formatDKK(std.gap, { compact: true }) : "—"}
                      </span>
                    </div>
                    {summary.achievedAge !== null && (
                      <div>
                        Tidligst opnået: alder{" "}
                        <span className="font-medium">{summary.achievedAge}</span>{" "}
                        ({lifestyleLabel(summary.achievedLifestyle!)})
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Comparison table */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Sammenligning</h2>
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="country-comparison">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left p-2">Land</th>
                <th className="text-left p-2">Niveau</th>
                <th className="text-right p-2">Md. forbrug</th>
                <th className="text-right p-2">Årligt behov</th>
                <th className="text-right p-2">Kapital @3,5 %</th>
                <th className="text-right p-2">Kapital @4 %</th>
                <th className="text-right p-2">Forventet kapital</th>
                <th className="text-right p-2">Gap</th>
                <th className="text-right p-2">Opnået alder</th>
                <th className="text-right p-2" title="Kapitalgrundlag × valgt udtræksrate / 12. Uafhængigt af land.">Brutto udtræk/md.</th>
                <th className="text-right p-2" title="Efter faste landeomkostninger og buffer/friktion.">Rådighedsbeløb/md.</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.countryId}-${r.lifestyle}`} className="border-t border-border">
                  <td className="p-2">{r.countryName}</td>
                  <td className="p-2">{lifestyleLabel(r.lifestyle)}</td>
                  <td className="p-2 text-right num">{formatDKK(r.monthlyNetCost, { compact: true })}</td>
                  <td className="p-2 text-right num">{formatDKK(r.totalAnnualNeed, { compact: true })}</td>
                  <td className="p-2 text-right num">{formatDKK(r.capitalNeed35, { compact: true })}</td>
                  <td className="p-2 text-right num">{formatDKK(r.capitalNeed40, { compact: true })}</td>
                  <td className="p-2 text-right num">{formatDKK(r.expectedCapitalAtReferenceAge, { compact: true })}</td>
                  <td className="p-2 text-right num">{r.gap > 0 ? formatDKK(r.gap, { compact: true }) : "—"}</td>
                  <td className="p-2 text-right num">{r.achievedAge ?? "—"}</td>
                  <td className="p-2 text-right num">{formatDKK(r.grossSustainableMonthlyAtReferenceAge, { compact: true })}</td>
                  <td className="p-2 text-right num">{formatDKK(r.sustainableMonthlyNetAtReferenceAge, { compact: true })}</td>
                  <td className={`p-2 ${statusTone(r.status)}`}>{statusLabel(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* Detail */}
      {selectedCountry && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">
            Detaljer — {selectedCountry.name}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {LIFESTYLES.map((lvl) => {
              const r = results.find((x) => x.countryId === selectedCountry.id && x.lifestyle === lvl);
              if (!r) return null;
              return (
                <Card key={lvl} className="p-4">
                  <div className="font-semibold mb-1">{lifestyleLabel(lvl)}</div>
                  <div className="text-xs text-muted-foreground mb-3">
                    {formatDKK(r.monthlyNetCost, { compact: true })}/md ·{" "}
                    {formatDKK(r.annualNetCost, { compact: true })}/år
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total årligt behov</span>
                      <span className="num">{formatDKK(r.totalAnnualNeed, { compact: true })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kapitalbehov</span>
                      <span className="num">{formatDKK(r.selectedCapitalNeed, { compact: true })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gap</span>
                      <span className="num">{r.gap > 0 ? formatDKK(r.gap, { compact: true }) : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Opnået alder</span>
                      <span className="num">{r.achievedAge ?? "Ikke opnået"}</span>
                    </div>
                    <div
                      className="flex justify-between"
                      title="Estimeret månedligt forbrug, som det nuværende kapitalgrundlag kan bære ved valgt udtræksrate, justeret for friktion/skattebuffer/valutabuffer/ekstra buffer. Et groft modelestimat — ikke rådgivning."
                    >
                      <span className="text-muted-foreground">Bæredygtigt md.</span>
                      <span className="num">
                        {formatDKK(r.sustainableMonthlyNetAtReferenceAge, { compact: true })}
                      </span>
                    </div>
                  </div>
                  {r.keyDrivers.length > 0 && (
                    <div className="mt-3 text-[11px] text-muted-foreground">
                      Økonomiske drivere: {r.keyDrivers.join(", ")}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            "Bæredygtigt md." er et groft modelestimat — det nuværende kapitalgrundlag × valgt
            udtræksrate, fratrukket årlige ekstraomkostninger og delt med friktions-/buffer-faktor.
            Ikke rådgivning.
          </p>

          {/* Sensitivity */}
          {(() => {
            const std = results.find(
              (x) => x.countryId === selectedCountry.id && x.lifestyle === "standard",
            );
            if (!std) return null;
            const sens = [-0.20, -0.10, 0, 0.10].map((delta) => {
              const factor = 1 + delta;
              const need = std.totalAnnualNeed * factor;
              const cap = wr > 0 ? need / wr : 0;
              const gap = Math.max(0, cap - std.expectedCapitalAtReferenceAge);
              return { delta, monthly: std.monthlyNetCost * factor, need, cap, gap };
            });
            return (
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">Følsomhed (Standard-niveau)</div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left">Ændring</th>
                      <th className="text-right">Md. forbrug</th>
                      <th className="text-right">Årligt behov</th>
                      <th className="text-right">Kapitalbehov</th>
                      <th className="text-right">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sens.map((s) => (
                      <tr key={s.delta} className="border-t border-border">
                        <td>{s.delta === 0 ? "Basis" : `${s.delta > 0 ? "+" : ""}${Math.round(s.delta * 100)} %`}</td>
                        <td className="text-right num">{formatDKK(s.monthly, { compact: true })}</td>
                        <td className="text-right num">{formatDKK(s.need, { compact: true })}</td>
                        <td className="text-right num">{formatDKK(s.cap, { compact: true })}</td>
                        <td className="text-right num">{s.gap > 0 ? formatDKK(s.gap, { compact: true }) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })()}
        </section>
      )}

      {/* Edit profiles */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Redigér landeprofiler</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => addCountryProfile()}>
              <Plus className="h-4 w-4 mr-1" /> Tilføj land
            </Button>
            <Button size="sm" variant="ghost" onClick={() => resetCountryProfilesToDefaults()}>
              <RotateCcw className="h-4 w-4 mr-1" /> Nulstil til demo
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Alle tal er <strong>økonomiske modelantagelser i DKK / nutidskroner</strong>.
          Referencevaluta bruges kun som label og påvirker ikke beregningen.
        </p>
        <div className="space-y-3">
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
                  <NumberInput
                    value={c.monthlyCostLean}
                    onChange={(v) => updateCountryProfile(c.id, { monthlyCostLean: v })}
                  />
                </div>
                <div>
                  <Label>Standard (DKK/md.)</Label>
                  <NumberInput
                    value={c.monthlyCostStandard}
                    onChange={(v) => updateCountryProfile(c.id, { monthlyCostStandard: v })}
                  />
                </div>
                <div>
                  <Label>Comfortable (DKK/md.)</Label>
                  <NumberInput
                    value={c.monthlyCostComfortable}
                    onChange={(v) => updateCountryProfile(c.id, { monthlyCostComfortable: v })}
                  />
                </div>
                <div>
                  <Label>Sundhed/forsikring pr. år</Label>
                  <NumberInput
                    value={c.annualHealthcareCost ?? 0}
                    onChange={(v) => updateCountryProfile(c.id, { annualHealthcareCost: v })}
                  />
                </div>
                <div>
                  <Label>Rejser/hjemrejser pr. år</Label>
                  <NumberInput
                    value={c.annualTravelHomeCost ?? 0}
                    onChange={(v) => updateCountryProfile(c.id, { annualTravelHomeCost: v })}
                  />
                </div>
                <div>
                  <Label>Admin/ophold pr. år</Label>
                  <NumberInput
                    value={c.annualAdminCost ?? 0}
                    onChange={(v) => updateCountryProfile(c.id, { annualAdminCost: v })}
                  />
                </div>
                <div>
                  <Label>Økonomisk friktion/skat (%)</Label>
                  <Input
                    value={pctInputValue(c.effectiveTaxOrFrictionPct)}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(",", "."));
                      updateCountryProfile(c.id, {
                        effectiveTaxOrFrictionPct: Number.isFinite(n) ? n / 100 : 0,
                      });
                    }}
                  />
                </div>
                <div>
                  <Label>Valutabuffer (%)</Label>
                  <Input
                    value={pctInputValue(c.currencyRiskBufferPct)}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(",", "."));
                      updateCountryProfile(c.id, {
                        currencyRiskBufferPct: Number.isFinite(n) ? n / 100 : 0,
                      });
                    }}
                  />
                </div>
                <div>
                  <Label>Ekstra buffer (%)</Label>
                  <Input
                    value={pctInputValue(c.generalSafetyBufferPct)}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(",", "."));
                      updateCountryProfile(c.id, {
                        generalSafetyBufferPct: Number.isFinite(n) ? n / 100 : 0,
                      });
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
      </section>

      {/* Disclaimer */}
      <section className="text-xs text-muted-foreground border-t border-border pt-4 leading-relaxed">
        Landeanalysen er et groft økonomisk modelværktøj. Den tager ikke højde for individuel skat,
        visum, sundhedsdækning eller juridiske forhold. Brug værdierne som egne antagelser, ikke
        som rådgivning. Alle beløb er i DKK / nutidskroner.
      </section>
    </div>
  );
}
