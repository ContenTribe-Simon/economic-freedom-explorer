import { useEffect, useState } from "react";
import { useActiveScenario, useFinanceStore } from "@/store/financeStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { defaultAssumptions } from "@/lib/finance/defaults";
import { decimalToPctString, parsePctInput } from "@/lib/format";
import { NumberInput } from "@/components/NumberInput";
import { CONFIDENCE_LABELS, LEVEL_LABELS, getConfidence } from "@/lib/finance/kpis";
import type { ConfidenceKey, ConfidenceLevel } from "@/lib/finance/types";

function NumberField({ label, value, onChange, suffix, step = 1, hint }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; step?: number; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <NumberInput value={value} step={step} onChange={onChange} className="num" />
        {suffix && <span className="text-sm text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PctField({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  const [text, setText] = useState(decimalToPctString(value));
  useEffect(() => setText(decimalToPctString(value)), [value]);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const dec = parsePctInput(e.target.value);
            if (Number.isFinite(dec)) onChange(dec);
          }}
          className="num"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
    </div>
  );
}

export default function Assumptions() {
  const a = useFinanceStore((s) => s.assumptions);
  const update = useFinanceStore((s) => s.updateAssumptions);
  const reset = useFinanceStore((s) => s.resetAssumptions);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Antagelser</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Skat, afkast & inflation</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Modellen regner i nutidskroner (realværdi). Realafkast er afkast efter inflation.
            Skattesatserne er forsimplede – tilpas til din faktiske situation.
          </p>
        </div>
        <Button variant="outline" onClick={reset}>Nulstil til standard ({new Date().getFullYear()})</Button>
      </header>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold mb-4">Realafkast</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <PctField label="Fri kapital" value={a.realReturn.free} onChange={(v) => update((x) => ({ ...x, realReturn: { ...x.realReturn, free: v } }))} />
          <PctField label="Pension" value={a.realReturn.pension} onChange={(v) => update((x) => ({ ...x, realReturn: { ...x.realReturn, pension: v } }))} />
          <PctField label="Holding" value={a.realReturn.holding} onChange={(v) => update((x) => ({ ...x, realReturn: { ...x.realReturn, holding: v } }))} />
          <PctField label="Inflation (info)" value={a.inflation} onChange={(v) => update((x) => ({ ...x, inflation: v }))} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold mb-4">Lønindkomst</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <PctField label="AM-bidrag" value={a.tax.amBidrag} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, amBidrag: v } }))} />
          <PctField label="Bundskat (effektiv inkl. kommune)" value={a.tax.laborBottomRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, laborBottomRate: v } }))} />
          <PctField label="Topskat (effektiv)" value={a.tax.laborTopRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, laborTopRate: v } }))} />
          <NumberField label="Topskattegrænse (efter AM)" value={a.tax.laborTopBracket} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, laborTopBracket: v } }))} suffix="kr" step={1000} />
          <NumberField label="Personfradrag" value={a.tax.personalAllowance} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, personalAllowance: v } }))} suffix="kr" step={500} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold mb-4">Aktieindkomst & holding</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <PctField label="Sats lav" value={a.tax.shareLowRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, shareLowRate: v } }))} />
          <PctField label="Sats høj" value={a.tax.shareHighRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, shareHighRate: v } }))} />
          <NumberField label="Tærskel (DKK)" value={a.tax.shareThreshold} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, shareThreshold: v } }))} suffix="kr" step={500} hint="2026: 79.400 kr (single)" />
          <PctField label="Selskabsskat (info)" value={a.tax.corporateRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, corporateRate: v } }))} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold mb-4">Privat pension</h2>
        <p className="text-sm text-muted-foreground">
          Skat på privat pension styres lokalt på hvert pensionsspor (ratepension og livsvarig pension/livrente) under <em>Variabler</em>. Der findes ingen global pensionsskattesats.
        </p>
        <div className="mt-3 p-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground space-y-1">
          <div><strong>Modelnote:</strong> Privat pension er opdelt i to spor pr. scenarie: <strong>ratepension</strong> (kapitalpulje med fast udbetalingsperiode) og <strong>livsvarig pension/livrente</strong> (stream til levealder). Begge spor kan være aktive samtidig og konfigureres under <em>Variabler</em> — inkl. egen effektiv skat.</div>
          <div>Folkepension behandles separat — se <em>Variabler → Folkepension</em>.</div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold mb-4">Folkepension (fallback)</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <NumberField label="Fallback netto/år" value={a.statePensionAnnualNet} onChange={(v) => update((x) => ({ ...x, statePensionAnnualNet: v }))} suffix="kr/år" step={1000} hint="Bruges kun hvis et scenarie endnu ikke har folkepensionsmetode valgt." />
        </div>
      </Card>

      <ConfidenceCard />

      <Card className="p-6 bg-muted/40">
        <h3 className="font-display text-lg font-semibold mb-2">Antagelser bag modellen</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>Alle beløb er i nutidskroner – realafkast bruges, så inflation ikke skal tilføjes oven i.</li>
          <li>Lønskat bruger AM-bidrag + bund/top med personfradrag. Kirkeskat, fagforening, befordring mv. er ikke inkluderet.</li>
          <li>Pensionsudbetaling beskattes med en effektiv sats sat lokalt pr. pensionsspor (default 40 %).</li>
          <li>Holding-exit antages netto efter selskabsskat. Udlodning beskattes derefter som aktieindkomst.</li>
          <li>Folkepensionens samspil med private pensioner er ikke modelleret – juster nettotallet manuelt.</li>
          <li>Udtræk sker i prioritetsrækkefølge: fri kapital → holding-udlodning → pension.</li>
          <li>Modellen er et beslutningsværktøj – ikke skatte- eller investeringsrådgivning.</li>
        </ul>
      </Card>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Standardværdier (reference)</summary>
        <pre className="mt-2 p-3 bg-muted rounded overflow-auto">{JSON.stringify(defaultAssumptions, null, 2)}</pre>
      </details>
    </div>
  );
}
