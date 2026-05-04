import { useFinanceStore } from "@/store/financeStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { defaultAssumptions } from "@/lib/finance/defaults";

function Field({ label, value, onChange, suffix, step = 0.001 }: { label: string; value: number; onChange: (n: number) => void; suffix?: string; step?: number }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value || "0"))} className="num" />
        {suffix && <span className="text-sm text-muted-foreground whitespace-nowrap">{suffix}</span>}
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
          <Field label="Fri kapital" value={a.realReturn.free} onChange={(v) => update((x) => ({ ...x, realReturn: { ...x.realReturn, free: v } }))} suffix="(0,05 = 5%)" />
          <Field label="Pension" value={a.realReturn.pension} onChange={(v) => update((x) => ({ ...x, realReturn: { ...x.realReturn, pension: v } }))} suffix="(0,05 = 5%)" />
          <Field label="Holding" value={a.realReturn.holding} onChange={(v) => update((x) => ({ ...x, realReturn: { ...x.realReturn, holding: v } }))} suffix="(0,04 = 4%)" />
          <Field label="Inflation (info)" value={a.inflation} onChange={(v) => update((x) => ({ ...x, inflation: v }))} suffix="(0,02 = 2%)" />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold mb-4">Lønindkomst</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="AM-bidrag" value={a.tax.amBidrag} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, amBidrag: v } }))} suffix="(0,08 = 8%)" />
          <Field label="Bundskat (effektiv inkl. kommune)" value={a.tax.laborBottomRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, laborBottomRate: v } }))} suffix="(0,37)" />
          <Field label="Topskat (effektiv)" value={a.tax.laborTopRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, laborTopRate: v } }))} suffix="(0,52)" />
          <Field label="Topskattegrænse (efter AM)" value={a.tax.laborTopBracket} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, laborTopBracket: v } }))} suffix="kr" step={1000} />
          <Field label="Personfradrag" value={a.tax.personalAllowance} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, personalAllowance: v } }))} suffix="kr" step={500} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold mb-4">Aktieindkomst & holding</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Sats lav" value={a.tax.shareLowRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, shareLowRate: v } }))} suffix="(0,27)" />
          <Field label="Sats høj" value={a.tax.shareHighRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, shareHighRate: v } }))} suffix="(0,42)" />
          <Field label="Tærskel (DKK)" value={a.tax.shareThreshold} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, shareThreshold: v } }))} suffix="kr" step={500} />
          <Field label="Selskabsskat (info)" value={a.tax.corporateRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, corporateRate: v } }))} suffix="(0,22)" />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold mb-4">Pension & folkepension</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Afgift v. udbetaling" value={a.tax.pensionPayoutRate} onChange={(v) => update((x) => ({ ...x, tax: { ...x.tax, pensionPayoutRate: v } }))} suffix="(0,40)" />
          <Field label="Folkepension netto/år" value={a.statePensionAnnualNet} onChange={(v) => update((x) => ({ ...x, statePensionAnnualNet: v }))} suffix="kr/år" step={1000} />
        </div>
      </Card>

      <Card className="p-6 bg-muted/40">
        <h3 className="font-display text-lg font-semibold mb-2">Antagelser bag modellen</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>Alle beløb er i nutidskroner – realafkast bruges, så inflation ikke skal tilføjes oven i.</li>
          <li>Lønskat bruger AM-bidrag + bund/top med personfradrag. Kirkeskat, fagforening, befordring mv. er ikke inkluderet.</li>
          <li>Pensionsudbetaling er forsimplet til én flad afgift (40 %). Ratepension/livrente skelnes ikke.</li>
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
