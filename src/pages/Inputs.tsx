import { ReactNode, useState, useEffect } from "react";
import { useActiveScenario, useFinanceStore } from "@/store/financeStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ScenarioInputs,
  SavingsLogic,
  DebtItem,
  DebtKind,
  DebtCashflowImpact,
  PartTimeMode,
  StatePensionMode,
  HoldingWithdrawalStrategy,
} from "@/lib/finance/types";
import { decimalToPctString, parsePctInput } from "@/lib/format";
import { NumberInput } from "@/components/NumberInput";
import { Trash2 } from "lucide-react";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground mt-1 mb-4">{description}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">{children}</div>
    </Card>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <NumberInput value={Number.isFinite(value) ? value : 0} step={step} onChange={onChange} className="num" />
        {suffix && <span className="text-sm text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PctField({
  label,
  value,
  onChange,
  hint,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (decimal: number) => void;
  hint?: string;
  step?: number;
}) {
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
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const DEBT_KIND_LABEL: Record<DebtKind, string> = {
  su: "SU-lån",
  private: "Privat gæld",
  holding: "Holdinggæld",
  personal_liability: "Personlig hæftelse",
};

const IMPACT_LABEL: Record<DebtCashflowImpact, string> = {
  private: "Privat cashflow",
  holding: "Holding cashflow",
  risk_only: "Kun risiko (vises i nettoformue)",
};

export default function Inputs() {
  const scenario = useActiveScenario();
  const update = useFinanceStore((s) => s.updateScenario);
  const rename = useFinanceStore((s) => s.renameScenario);

  const set = <K extends keyof ScenarioInputs>(key: K, value: ScenarioInputs[K]) =>
    update(scenario.id, (s) => ({ ...s, inputs: { ...s.inputs, [key]: value } }));

  const inp = scenario.inputs;

  const updateDebt = (idx: number, patch: Partial<DebtItem>) => {
    const next = inp.debts.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    set("debts", next);
  };
  const addDebt = () => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    set("debts", [
      ...inp.debts,
      { id, name: "Ny gæld", kind: "private", balance: 0, interestRate: 0.04, monthlyPayment: 0, impact: "private" },
    ]);
  };
  const removeDebt = (idx: number) => set("debts", inp.debts.filter((_, i) => i !== idx));

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Variabler</div>
        <input
          className="font-display text-4xl font-semibold mt-1 bg-transparent outline-none border-b border-transparent focus:border-border w-full"
          value={scenario.name}
          onChange={(e) => rename(scenario.id, e.target.value)}
        />
        <p className="text-muted-foreground mt-2">Justér nedenfor – ændringer slår igennem i hele modellen med det samme.</p>
      </header>

      <Section title="Person & alder">
        <NumField label="Nuværende alder" value={inp.person.currentAge} onChange={(v) => set("person", { ...inp.person, currentAge: v })} suffix="år" />
        <NumField label="Forventet levealder" value={inp.person.lifeExpectancy} onChange={(v) => set("person", { ...inp.person, lifeExpectancy: v })} suffix="år" />
        <NumField label="Stopalder (fuldtid)" value={inp.stopAge} onChange={(v) => set("stopAge", v)} suffix="år" />
        <NumField label="Helt stop (også deltid)" value={inp.fullRetireAge} onChange={(v) => set("fullRetireAge", v)} suffix="år" />
      </Section>

      <Section title="Fri/investerbar kapital" description="Likvide midler der investeres og får realafkast.">
        <NumField label="Nuværende saldo" value={inp.free.balance} onChange={(v) => set("free", { ...inp.free, balance: v })} suffix="kr" step={10000} />
        <NumField label="Månedlig opsparing" value={inp.free.monthlyContribution} onChange={(v) => set("free", { ...inp.free, monthlyContribution: v })} suffix="kr/md" step={500} />
        <NumField label="Årligt ekstra (bonus mv.)" value={inp.free.annualExtraContribution} onChange={(v) => set("free", { ...inp.free, annualExtraContribution: v })} suffix="kr/år" step={5000} />
      </Section>

      <Section title="Kontant buffer" description="Tæller med i nettoformue, men investeres ikke og får intet afkast.">
        <NumField label="Buffer-saldo" value={inp.free.cashBuffer ?? 0} onChange={(v) => set("free", { ...inp.free, cashBuffer: v })} suffix="kr" step={5000} />
        <div className="space-y-1.5 flex flex-col justify-end">
          <label className="flex items-center gap-2 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/40">
            <input
              type="checkbox"
              checked={inp.free.bufferUsableForShortfall}
              onChange={(e) => set("free", { ...inp.free, bufferUsableForShortfall: e.target.checked })}
            />
            <span className="text-sm">Buffer må bruges til shortfall</span>
          </label>
          <p className="text-[11px] text-muted-foreground">Hvis aktiveret bruges buffer som sidste udvej før shortfall registreres.</p>
        </div>
      </Section>

      <Section title="Ratepension" description="Kapitalpulje der udbetales over en fast periode (fx 10–30 år). Beskattes som personlig indkomst.">
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/40">
            <input
              type="checkbox"
              checked={inp.pension.ratePensionEnabled ?? true}
              onChange={(e) => set("pension", { ...inp.pension, ratePensionEnabled: e.target.checked })}
            />
            <span className="text-sm">Aktivér ratepension</span>
          </label>
        </div>
        <NumField label="Nuværende saldo" value={inp.pension.balance} onChange={(v) => set("pension", { ...inp.pension, balance: v })} suffix="kr" step={10000} />
        <NumField label="Egen indbetaling" value={inp.pension.monthlyContribution} onChange={(v) => set("pension", { ...inp.pension, monthlyContribution: v })} suffix="kr/md" step={500} />
        <NumField label="Arbejdsgiverbidrag" value={inp.pension.employerContribution} onChange={(v) => set("pension", { ...inp.pension, employerContribution: v })} suffix="kr/md" step={500} />
        <NumField
          label="Tilgængelig fra alder"
          value={inp.pension.payoutFromAge ?? 64}
          onChange={(v) => set("pension", { ...inp.pension, payoutFromAge: v })}
          suffix="år"
          hint="For nye ordninger typisk knyttet til folkepensionsalder − 3 år."
        />
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Udbetalingsperiode</Label>
          <select
            className="h-10 px-3 rounded-md border border-border bg-background text-sm w-full"
            value={inp.pension.ratePensionPayoutYears ?? 15}
            onChange={(e) => set("pension", { ...inp.pension, ratePensionPayoutYears: Number(e.target.value) })}
          >
            {[10, 15, 20, 25, 30].map((y) => (
              <option key={y} value={y}>{y} år</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">Saldoen fordeles ligeligt over perioden.</p>
        </div>
        <PctField
          label="Effektiv skat ved udbetaling"
          value={inp.pension.ratePensionEffectiveTaxRate ?? 0.4}
          onChange={(v) => set("pension", { ...inp.pension, ratePensionEffectiveTaxRate: v })}
        />
        <p className="md:col-span-2 text-xs text-muted-foreground">
          Ratepension udbetales som en årlig strøm over den valgte periode. Eventuelt overskud i et år går til fri kapital. Ekstra udtræk ud over planlagt udbetaling kan ske ved shortfall (afhænger af holdingstrategi).
        </p>
      </Section>

      <Section title="Livsvarig pension / livrente" description="Stream af udbetalinger fra startalder til levealder. Behandles ikke som en kapitalpulje der kan løbe tør.">
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/40">
            <input
              type="checkbox"
              checked={inp.pension.lifeAnnuity?.enabled ?? false}
              onChange={(e) => set("pension", { ...inp.pension, lifeAnnuity: { ...inp.pension.lifeAnnuity, enabled: e.target.checked } })}
            />
            <span className="text-sm">Aktivér livsvarig pension</span>
          </label>
        </div>
        <div className="md:col-span-2 flex gap-2">
          {(["gross", "net"] as const).map((m) => (
            <label
              key={m}
              className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${
                (inp.pension.lifeAnnuity?.mode ?? "gross") === m ? "border-accent bg-accent/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="laMode"
                checked={(inp.pension.lifeAnnuity?.mode ?? "gross") === m}
                onChange={() => set("pension", { ...inp.pension, lifeAnnuity: { ...inp.pension.lifeAnnuity, mode: m } })}
              />
              {m === "gross" ? "Brutto/år (skat beregnes)" : "Netto/år (bruges direkte)"}
            </label>
          ))}
        </div>
        {(inp.pension.lifeAnnuity?.mode ?? "gross") === "gross" ? (
          <>
            <NumField
              label="Forventet brutto/år"
              value={inp.pension.lifeAnnuity?.annualGross ?? 0}
              onChange={(v) => set("pension", { ...inp.pension, lifeAnnuity: { ...inp.pension.lifeAnnuity, annualGross: v } })}
              suffix="kr/år"
              step={5000}
            />
            <PctField
              label="Effektiv pensionsskat"
              value={inp.pension.lifeAnnuity?.effectiveTaxRate ?? 0.4}
              onChange={(v) => set("pension", { ...inp.pension, lifeAnnuity: { ...inp.pension.lifeAnnuity, effectiveTaxRate: v } })}
            />
          </>
        ) : (
          <NumField
            label="Forventet netto/år"
            value={inp.pension.lifeAnnuity?.annualNet ?? 0}
            onChange={(v) => set("pension", { ...inp.pension, lifeAnnuity: { ...inp.pension.lifeAnnuity, annualNet: v } })}
            suffix="kr/år"
            step={5000}
          />
        )}
        <NumField
          label="Startalder"
          value={inp.pension.lifeAnnuity?.fromAge ?? 67}
          onChange={(v) => set("pension", { ...inp.pension, lifeAnnuity: { ...inp.pension.lifeAnnuity, fromAge: v } })}
          suffix="år"
        />
        <p className="md:col-span-2 text-xs text-muted-foreground">
          Livsvarig pension fortsætter til forventet levealder ({inp.person.lifeExpectancy}). Den indgår ikke i pensionssaldoen og kan ikke løbe tør.
        </p>
      </Section>

      <Section title="Holding" description="Selskabskapital. Udlodning beskattes som aktieindkomst.">
        <NumField label="Nuværende holdingkapital" value={inp.holding.balance} onChange={(v) => set("holding", { ...inp.holding, balance: v })} suffix="kr" step={50000} />
        <NumField label="Forventet exitværdi" value={inp.holding.expectedExitValue} onChange={(v) => set("holding", { ...inp.holding, expectedExitValue: v })} suffix="kr" step={100000} hint="Tilføjes til holding i exit-året (efter selskabsskat)" />
        <NumField label="Exit-år (kalenderår)" value={inp.holding.exitYear} onChange={(v) => set("holding", { ...inp.holding, exitYear: v })} step={1} />
        <NumField label="Planlagt årlig udlodning" value={inp.holding.annualDistribution} onChange={(v) => set("holding", { ...inp.holding, annualDistribution: v })} suffix="kr/år" step={10000} />
        <NumField
          label="Holdingudlodning fra alder"
          value={inp.holding.distributionFromAge}
          onChange={(v) => set("holding", { ...inp.holding, distributionFromAge: v })}
          suffix="år"
          hint={inp.holding.startDistributionAtStopAge ? `Følger stopalder (${inp.stopAge})` : "Ignoreres når toggle er aktiv"}
        />
        {/* "Pension tilgængelig fra alder" er flyttet til Privat pension-sektionen */}
        <div className="space-y-1.5 flex flex-col justify-end">
          <label className="flex items-center gap-2 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/40">
            <input
              type="checkbox"
              checked={inp.holding.startDistributionAtStopAge}
              onChange={(e) => set("holding", { ...inp.holding, startDistributionAtStopAge: e.target.checked, distributionFromAge: e.target.checked ? inp.stopAge : inp.holding.distributionFromAge })}
            />
            <span className="text-sm">Start holdingudlodning ved stopalder</span>
          </label>
        </div>
        <div className="md:col-span-2 space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Holdingudtræksstrategi</Label>
          {([
            { v: "planned_only", t: "Kun planlagt årlig udlodning", d: "Ingen ekstra udtræk fra holding ved shortfall." },
            { v: "up_to_low_threshold", t: "Udlod op til lav aktieindkomstgrænse", d: "Udlodder automatisk op til lav-sats grænsen pr. år (efter udlodningsalder)." },
            { v: "allow_extra_on_shortfall", t: "Tillad ekstra holdingudtræk ved shortfall", d: "Holding kan bruges til at dække shortfall ud over planlagt udlodning." },
            { v: "pension_before_extra_holding", t: "Brug pension før ekstra holdingudtræk", d: "Når pension er tilgængelig, prioriteres pension før ekstra holding." },
          ] as { v: HoldingWithdrawalStrategy; t: string; d: string }[]).map((opt) => (
            <label
              key={opt.v}
              className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${
                (inp.holding.withdrawalStrategy ?? "planned_only") === opt.v ? "border-accent bg-accent/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="holdingStrategy"
                checked={(inp.holding.withdrawalStrategy ?? "planned_only") === opt.v}
                onChange={() => set("holding", { ...inp.holding, withdrawalStrategy: opt.v })}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-sm">{opt.t}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.d}</div>
              </div>
            </label>
          ))}
        </div>
      </Section>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Gæld (poster)</h2>
          <Button size="sm" variant="outline" onClick={addDebt}>+ Tilføj gæld</Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Hver post har egen rente, ydelse og angiver hvor den påvirker cashflow.
        </p>
        <div className="space-y-3">
          {inp.debts.map((d, i) => (
            <div key={d.id} className="border border-border rounded-md p-4 space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Navn</Label>
                  <Input value={d.name} onChange={(e) => updateDebt(i, { name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
                  <select
                    className="h-10 px-3 rounded-md border border-border bg-background text-sm"
                    value={d.kind}
                    onChange={(e) => updateDebt(i, { kind: e.target.value as DebtKind })}
                  >
                    {Object.entries(DEBT_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Påvirker</Label>
                  <select
                    className="h-10 px-3 rounded-md border border-border bg-background text-sm"
                    value={d.impact}
                    onChange={(e) => updateDebt(i, { impact: e.target.value as DebtCashflowImpact })}
                  >
                    {Object.entries(IMPACT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeDebt(i)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <NumField label="Restgæld" value={d.balance} onChange={(v) => updateDebt(i, { balance: v })} suffix="kr" step={10000} />
                <PctField label="Rente" value={d.interestRate} onChange={(v) => updateDebt(i, { interestRate: v })} />
                <NumField label="Månedlig ydelse" value={d.monthlyPayment} onChange={(v) => updateDebt(i, { monthlyPayment: v })} suffix="kr/md" step={500} />
              </div>
              {d.kind === "holding" && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Holdinggæld – finansiering</Label>
                  <select
                    className="h-10 px-3 rounded-md border border-border bg-background text-sm w-full"
                    value={d.holdingFinancing ?? "holding_capital"}
                    onChange={(e) => updateDebt(i, { holdingFinancing: e.target.value as any })}
                  >
                    <option value="holding_capital">Betales af holdingens eksisterende kapital</option>
                    <option value="private_cashflow">Betales af privat cashflow</option>
                    <option value="external_company">Betales af ekstern selskabscashflow (uden for modellen)</option>
                    <option value="exit_only">Afdrages først ved exit</option>
                    <option value="display_only">Kun visning/risiko</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">Hvis holdingkapital er for lille til at dække ydelsen, vises shortfall i sanity check.</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/40 text-sm">
                  <input
                    type="checkbox"
                    checked={d.includeInNetWorth ?? (d.impact !== "risk_only")}
                    onChange={(e) => updateDebt(i, { includeInNetWorth: e.target.checked })}
                  />
                  <span>Medregn i nettoformue {d.kind === "personal_liability" && <span className="text-muted-foreground">(default fra for hæftelse)</span>}</span>
                </label>
                {d.kind === "personal_liability" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Knyttet til gældspost</Label>
                    <select
                      className="h-10 px-3 rounded-md border border-border bg-background text-sm w-full"
                      value={d.linkedDebtId ?? ""}
                      onChange={(e) => updateDebt(i, { linkedDebtId: e.target.value || undefined })}
                    >
                      <option value="">— Ingen kobling —</option>
                      {inp.debts.filter((o) => o.id !== d.id && o.kind !== "personal_liability").map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">Hæftelsessaldo spejler den underliggende gæld.</p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {inp.debts.length === 0 && <p className="text-sm text-muted-foreground">Ingen gældsposter. Klik “Tilføj gæld”.</p>}
        </div>
      </Card>

      <Section title="Indkomst (løn & familie)">
        <NumField label="Bruttoløn (årlig)" value={inp.income.salaryGross} onChange={(v) => set("income", { ...inp.income, salaryGross: v })} suffix="kr/år" step={10000} hint="Skat beregnes automatisk" />
        <NumField label="Familiefond (netto/år)" value={inp.income.familyFundAnnualNet} onChange={(v) => set("income", { ...inp.income, familyFundAnnualNet: v })} suffix="kr/år" step={5000} />
        <NumField label="Familiefond stopper før alder" value={inp.income.familyFundUntilAge} onChange={(v) => set("income", { ...inp.income, familyFundUntilAge: v })} suffix="år" hint="Sidste udbetaling sker året før denne alder." />
      </Section>

      <Section title="Deltidsindtægt" description="Vælg om beløbet er angivet som brutto/år (skat beregnes) eller netto/md (bruges direkte).">
        <div className="md:col-span-2 flex gap-2">
          {(["net_monthly", "gross_annual"] as PartTimeMode[]).map((m) => (
            <label
              key={m}
              className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${
                inp.income.partTime.mode === m ? "border-accent bg-accent/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="ptMode"
                checked={inp.income.partTime.mode === m}
                onChange={() => set("income", { ...inp.income, partTime: { ...inp.income.partTime, mode: m } })}
              />
              {m === "net_monthly" ? "Netto/md (bruges direkte)" : "Brutto/år (skat beregnes)"}
            </label>
          ))}
        </div>
        {inp.income.partTime.mode === "gross_annual" ? (
          <NumField
            label="Deltid – brutto/år"
            value={inp.income.partTime.grossAnnual}
            onChange={(v) => set("income", { ...inp.income, partTime: { ...inp.income.partTime, grossAnnual: v } })}
            suffix="kr/år"
            step={10000}
          />
        ) : (
          <NumField
            label="Deltid – netto/md"
            value={inp.income.partTime.netMonthly}
            onChange={(v) => set("income", { ...inp.income, partTime: { ...inp.income.partTime, netMonthly: v } })}
            suffix="kr/md"
            step={1000}
          />
        )}
        <NumField
          label="Deltid fra alder"
          value={inp.income.partTime.fromAge}
          onChange={(v) => set("income", { ...inp.income, partTime: { ...inp.income.partTime, fromAge: v } })}
          suffix="år"
        />
        <NumField
          label="Deltid stopper før alder"
          value={inp.income.partTime.untilAge}
          onChange={(v) => set("income", { ...inp.income, partTime: { ...inp.income.partTime, untilAge: v } })}
          suffix="år"
          hint="Sidste år med deltidsindtægt er året før denne alder."
        />
      </Section>

      <Section title="Folkepension" description="Vælg metode. Folkepension beskattes ikke med privat pensions-sats.">
        <div className="md:col-span-2 space-y-2">
          {([
            { v: "none", t: "Ingen folkepension", d: "Modellen indregner ikke folkepension." },
            { v: "baseOnly", t: "Kun grundbeløb (brutto − effektiv skat)", d: "Bruger 2026-grundbeløb ca. 90.528 kr brutto/år. Net = brutto × (1 − effektiv skat)." },
            { v: "manualNet", t: "Manuelt nettobeløb", d: "Bruger dit indtastede nettobeløb direkte uden yderligere skat." },
          ] as { v: StatePensionMode; t: string; d: string }[]).map((opt) => (
            <label
              key={opt.v}
              className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${
                inp.income.statePension.mode === opt.v ? "border-accent bg-accent/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="spMode"
                checked={inp.income.statePension.mode === opt.v}
                onChange={() => set("income", { ...inp.income, statePension: { ...inp.income.statePension, mode: opt.v } })}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-sm">{opt.t}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.d}</div>
              </div>
            </label>
          ))}
        </div>
        <NumField
          label="Folkepension fra alder"
          value={inp.income.statePension.fromAge}
          onChange={(v) => set("income", { ...inp.income, statePension: { ...inp.income.statePension, fromAge: v } })}
          suffix="år"
        />
        {inp.income.statePension.mode === "baseOnly" && (
          <>
            <NumField
              label="Folkepension brutto/år"
              value={inp.income.statePension.baseGrossAnnual}
              onChange={(v) => set("income", { ...inp.income, statePension: { ...inp.income.statePension, baseGrossAnnual: v } })}
              suffix="kr/år"
              step={1000}
              hint="2026-grundbeløb ca. 90.528 kr brutto/år — ikke netto."
            />
            <PctField
              label="Effektiv skat på folkepension"
              value={inp.income.statePension.effectiveTaxRate}
              onChange={(v) => set("income", { ...inp.income, statePension: { ...inp.income.statePension, effectiveTaxRate: v } })}
            />
            <div className="md:col-span-2 text-xs text-muted-foreground">
              Beregnet netto:{" "}
              <strong>
                {Math.round(inp.income.statePension.baseGrossAnnual * (1 - inp.income.statePension.effectiveTaxRate)).toLocaleString("da-DK")} kr/år
              </strong>
            </div>
          </>
        )}
        {inp.income.statePension.mode === "manualNet" && (
          <NumField
            label="Folkepension netto/år (manuelt)"
            value={inp.income.statePension.manualNetAnnual}
            onChange={(v) => set("income", { ...inp.income, statePension: { ...inp.income.statePension, manualNetAnnual: v } })}
            suffix="kr/år"
            step={1000}
            hint="Bruges direkte uden yderligere skat."
          />
        )}
      </Section>

      <Section title="Forbrug">
        <NumField label="Ønsket forbrug (netto)" value={inp.spending.desiredMonthlyNet} onChange={(v) => set("spending", { ...inp.spending, desiredMonthlyNet: v })} suffix="kr/md" step={1000} hint="I nutidskroner" />
      </Section>

      <Section title="Målsætning" description="Bruges til at beregne tidligste bæredygtige stopalder.">
        <NumField
          label="Minimum nettoformue ved slutalder"
          value={inp.target?.minNetWorthAtEnd ?? 0}
          onChange={(v) => set("target", { ...(inp.target ?? { minNetWorthAtEnd: 0 }), minNetWorthAtEnd: v })}
          suffix="kr"
          step={100000}
          hint={`Mindste nettoformue ved alder ${inp.person.lifeExpectancy}.`}
        />
      </Section>

      <Section title="Opsparingslogik" description="Hvordan modellen håndterer opsparing før stopalder.">
        <div className="md:col-span-2 space-y-2">
          {([
            { v: "planned", t: "Planlagt opsparing", d: "Kun månedlig opsparing + årligt ekstra investeres." },
            { v: "cashflow", t: "Cashflow-baseret", d: "Hele nettoindkomst minus forbrug investeres automatisk." },
            { v: "hybrid", t: "Hybrid", d: "Planlagt opsparing bruges, cashflow-overskud/-underskud vises." },
          ] as { v: SavingsLogic; t: string; d: string }[]).map((opt) => (
            <label
              key={opt.v}
              className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${
                inp.savingsLogic === opt.v ? "border-accent bg-accent/5" : "border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="savingsLogic"
                checked={inp.savingsLogic === opt.v}
                onChange={() => set("savingsLogic", opt.v)}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-sm">{opt.t}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.d}</div>
              </div>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}

