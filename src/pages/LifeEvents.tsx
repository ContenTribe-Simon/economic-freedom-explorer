import { useActiveScenario, useFinanceStore } from "@/store/financeStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/NumberInput";
import { LIFE_EVENT_TEMPLATES, lifeEventValidationError } from "@/lib/finance/lifeEvents";
import { LifeEvent, LifeEventCategory, LifeEventEffectDirection, LifeEventEffectTarget, LifeEventFrequency } from "@/lib/finance/types";
import { Trash2, Copy, Plus } from "lucide-react";
import { useState } from "react";

const CATEGORY_LABEL: Record<LifeEventCategory, string> = {
  income_change: "Indkomstændring",
  expense_change: "Forbrugsændring",
  one_time_capital: "Engangsbeløb (kapital)",
  debt_change: "Gældsændring",
  housing: "Bolig",
  children: "Børn",
  work_pause: "Arbejdspause",
  relocation: "Flytning",
  custom: "Custom",
};

const TARGET_LABEL: Record<LifeEventEffectTarget, string> = {
  privateIncome: "Privat indkomst",
  privateSpending: "Privat forbrug",
  freeCapital: "Fri kapital",
  privateDebt: "Privat gæld",
  holdingCapital: "Holdingkapital (forberedt)",
  holdingCashflow: "Holding cashflow (forberedt)",
  pensionCapital: "Pensionskapital (forberedt)",
  netWorthOnly: "Kun nettoformue (forberedt)",
};

const FREQ_LABEL: Record<LifeEventFrequency, string> = {
  monthly: "Månedligt",
  annual: "Årligt",
  one_time: "Engangsbeløb",
};

export default function LifeEventsPage() {
  const scenario = useActiveScenario();
  const addLifeEvent = useFinanceStore((s) => s.addLifeEvent);
  const updateLifeEvent = useFinanceStore((s) => s.updateLifeEvent);
  const removeLifeEvent = useFinanceStore((s) => s.removeLifeEvent);
  const duplicateLifeEvent = useFinanceStore((s) => s.duplicateLifeEvent);
  const toggleLifeEvent = useFinanceStore((s) => s.toggleLifeEvent);

  const [showTemplates, setShowTemplates] = useState(false);
  const events = scenario.inputs.lifeEvents ?? [];

  const update = (id: string, patch: Partial<LifeEvent>) => updateLifeEvent(scenario.id, id, patch);

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Livsfaser</div>
        <h1 className="font-display text-4xl font-semibold mt-1">{scenario.name}</h1>
        <p className="text-muted-foreground mt-2">Livsfaser kan justere indkomst, forbrug, fri kapital eller privat gæld i bestemte aldersperioder. Modellen ændres ikke når der ikke er nogen livsfaser.</p>
      </header>

      <div className="flex gap-2">
        <Button onClick={() => setShowTemplates((v) => !v)}>
          <Plus className="h-4 w-4 mr-2" /> Tilføj livsfase
        </Button>
      </div>

      {showTemplates && (
        <Card className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2">
          {LIFE_EVENT_TEMPLATES.map((t) => (
            <Button
              key={t.key}
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={() => {
                addLifeEvent(scenario.id, t.build());
                setShowTemplates(false);
              }}
            >
              {t.label}
            </Button>
          ))}
        </Card>
      )}

      {events.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Ingen livsfaser endnu. Tilføj én for at modellere fx ekstra forbrug, en arbejdspause eller en engangsudgift.
        </Card>
      )}

      <div className="space-y-3">
        {events.map((ev) => {
          const validationError = lifeEventValidationError(ev);
          const isOneTime = ev.frequency === "one_time";
          return (
          <Card key={ev.id} className={`p-4 ${ev.enabled ? "" : "opacity-60"}`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-2"
                checked={ev.enabled}
                onChange={() => toggleLifeEvent(scenario.id, ev.id)}
                aria-label="Aktiver livsfase"
              />
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-3">
                  <Input value={ev.name} onChange={(e) => update(ev.id, { name: e.target.value })} className="font-semibold" />
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Kategori</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
                    value={ev.category}
                    onChange={(e) => update(ev.id, { category: e.target.value as LifeEventCategory })}
                  >
                    {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Effekt mål</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
                    value={ev.effectTarget}
                    onChange={(e) => update(ev.id, { effectTarget: e.target.value as LifeEventEffectTarget })}
                  >
                    {Object.entries(TARGET_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Retning</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
                    value={ev.effectDirection}
                    onChange={(e) => update(ev.id, { effectDirection: e.target.value as LifeEventEffectDirection })}
                  >
                    <option value="increase">Forøg (+)</option>
                    <option value="decrease">Reducér (−)</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Frekvens</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
                    value={ev.frequency}
                    onChange={(e) => update(ev.id, { frequency: e.target.value as LifeEventFrequency })}
                  >
                    {Object.entries(FREQ_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Beløb {ev.frequency === "monthly" ? "(kr/md)" : ev.frequency === "annual" ? "(kr/år)" : "(kr)"}
                  </Label>
                  <NumberInput value={ev.amount} step={1000} onChange={(v) => update(ev.id, { amount: v })} />
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fra alder</Label>
                  <NumberInput value={ev.startAge} onChange={(v) => update(ev.id, { startAge: v })} />
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Til alder (valgfri)</Label>
                  <NumberInput value={ev.endAge ?? 0} onChange={(v) => update(ev.id, { endAge: v > 0 ? v : undefined })} />
                </div>

                <div className="md:col-span-3">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Note</Label>
                  <Input value={ev.notes ?? ""} onChange={(e) => update(ev.id, { notes: e.target.value })} placeholder="Intern note (påvirker ikke beregning)" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="sm" onClick={() => duplicateLifeEvent(scenario.id, ev.id)} aria-label="Duplikér">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removeLifeEvent(scenario.id, ev.id)} aria-label="Slet">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
