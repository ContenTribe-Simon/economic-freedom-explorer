import { ReactNode, useState, useEffect } from "react";
import { useActiveScenario, useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ScenarioInputs,
  Scenario,
  SavingsLogic,
  DebtItem,
  DebtKind,
  DebtCashflowImpact,
  PartTimeMode,
  StatePensionMode,
} from "@/lib/finance/types";
import { resolveCapitalWithdrawal } from "@/lib/finance/capitalWithdrawal";
import { decimalToPctString, parsePctInput } from "@/lib/format";
import { NumberInput } from "@/components/NumberInput";
import { Trash2, Link2, GitBranch } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const resolved = useResolvedActiveScenario();
  const updateRaw = useFinanceStore((s) => s.updateScenario);
  const renameRaw = useFinanceStore((s) => s.renameScenario);
  const convertToCustom = useFinanceStore((s) => s.convertToCustom);
  const rebase = useFinanceStore((s) => s.rebaseOnCurrentBase);
  const isLinked = scenario.type === "linked_stress_test";

  const [pendingEdit, setPendingEdit] = useState<null | (() => void)>(null);

  // Wrap mutations: hvis scenariet er et linket stress-test, vis dialog først.
  const guard = (fn: () => void) => {
    if (!isLinked) return fn();
    setPendingEdit(() => fn);
  };
  const update: typeof updateRaw = (id, updater) => guard(() => updateRaw(id, updater));
  const rename: typeof renameRaw = (id, name) => guard(() => renameRaw(id, name));

  const set = <K extends keyof ScenarioInputs>(key: K, value: ScenarioInputs[K]) =>
    update(scenario.id, (s) => ({ ...s, inputs: { ...s.inputs, [key]: value } }));

  // Display-data: for linked scenarier vises resolved.inputs (basecase + modifiers).
  // For base/custom vises rå inputs som vanligt.
  const inp = isLinked ? resolved.inputs : scenario.inputs;

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

  const confirmConvert = () => {
    convertToCustom(scenario.id);
    // Anvend den ventede ændring efter konvertering — inputs henter nyt scenarie i næste render.
    const fn = pendingEdit;
    setPendingEdit(null);
    if (fn) setTimeout(fn, 0);
  };

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

      {isLinked && (
        <Card className="p-4 border-l-4 border-l-primary">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-sm">Linket stress-test</div>
              <p className="text-xs text-muted-foreground mt-1">
                Dette scenarie beregnes ud fra den aktuelle basecase
                {scenario.baseScenarioName ? ` (${scenario.baseScenarioName})` : ""} plus stress-modifiers.
                Hvis basecase ændres, opdateres dette scenarie automatisk. Manuelle ændringer her vil
                konvertere scenariet til et frit, custom scenarie.
              </p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => convertToCustom(scenario.id)}>
                  Konvertér til custom
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {scenario.type === "custom" && scenario.baseScenarioId && (
        <Card className="p-4 border-l-4 border-l-muted-foreground">
          <div className="flex items-start gap-3">
            <GitBranch className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-sm">Manuelt scenarie</div>
              <p className="text-xs text-muted-foreground mt-1">
                Dette scenarie følger ikke længere automatisk basecase
                {scenario.baseScenarioName ? ` (${scenario.baseScenarioName})` : ""}.
                Du kan rebasér det for at gendanne et rent stress-test ud fra aktuel basecase
                — manuelle ændringer går da tabt.
              </p>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (confirm("Rebasér scenariet på aktuel basecase? Manuelle ændringer går tabt.")) {
                      rebase(scenario.id);
                    }
                  }}
                >
                  Rebasér på aktuel basecase
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <AlertDialog open={pendingEdit !== null} onOpenChange={(open) => !open && setPendingEdit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konvertér linket stress-test?</AlertDialogTitle>
            <AlertDialogDescription>
              Dette er et linket stress-test scenarie. Hvis du ændrer dette felt, bliver scenariet
              konverteret til et manuelt scenarie og følger ikke længere automatisk basecase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingEdit(null)}>Annullér</AlertDialogCancel>
            <AlertDialogAction onClick={confirmConvert}>Konvertér til custom</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Stop planlagt opsparing</label>
          <select
            value={inp.free.contributionStopRule ?? "stopAge"}
            onChange={(e) => set("free", { ...inp.free, contributionStopRule: e.target.value as any })}
            className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
          >
            <option value="stopAge">Ved jobstop / stopalder ({inp.stopAge})</option>
            <option value="fullRetireAge">Ved fuld pension ({inp.fullRetireAge})</option>
            <option value="customAge">Brugerdefineret alder</option>
            <option value="never">Fortsæt hele livet</option>
          </select>
          <p className="text-[11px] text-muted-foreground">Bestemmer hvornår den planlagte fri opsparing ophører.</p>
        </div>
        {(inp.free.contributionStopRule ?? "stopAge") === "customAge" && (
          <NumField label="Stop ved alder" value={inp.free.contributionStopAge ?? inp.stopAge} onChange={(v) => set("free", { ...inp.free, contributionStopAge: v })} suffix="år" />
        )}
      </Section>

      <AskSection inp={inp} set={set} />

      <DepotTaxSection inp={inp} set={set} />

      <CapitalWithdrawalSection inp={inp} set={set} />





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

      <Section title="Holding" description="Selskabskapital. Udlodning beskattes som personlig aktieindkomst.">
        <NumField label="Nuværende holdingkapital" value={inp.holding.balance} onChange={(v) => set("holding", { ...inp.holding, balance: v })} suffix="kr" step={50000} />
        <NumField label="Forventet exitværdi" value={inp.holding.expectedExitValue} onChange={(v) => set("holding", { ...inp.holding, expectedExitValue: v })} suffix="kr" step={100000} hint="Tilføjes til holding i exit-året (efter selskabsskat)" />
        <NumField label="Exit-år (kalenderår)" value={inp.holding.exitYear} onChange={(v) => set("holding", { ...inp.holding, exitYear: v })} step={1} />
        <div className="md:col-span-2 p-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
          Holdingens udtræksrækkefølge og planlagte udlodning styres nu under <strong>Kapitaludtræk &amp; nedsparing</strong>. Udlodning fra holding beskattes som personlig aktieindkomst og deler 27/42 %-grænsen med realiserede depotgevinster.
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
                    <option value="holding_capital">Betales af holdingkapital / holding cashflow</option>
                    <option value="private_cashflow">Betales af privat cashflow</option>
                    <option value="external_company">Eksternt finansieret / uden for modellen</option>
                    <option value="exit_only">Afdrages først ved exit</option>
                    <option value="display_only">Kun visning/risiko</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Holdingkapital: modellen tester år-for-år om holding har dækning — ellers vises holding-shortfall.
                    Privat cashflow: belaster privatøkonomien som privat gæld.
                    Eksternt finansieret: påvirker ikke modellens cashflow og udløser ikke shortfall-warning.
                  </p>
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


function AskSection({ inp, set }: { inp: ScenarioInputs; set: <K extends keyof ScenarioInputs>(k: K, v: ScenarioInputs[K]) => void }) {
  const ask = inp.free.ask;
  const enabled = !!ask?.enabled;
  const totalFree = inp.free.balance ?? 0;
  const currentValue = ask?.currentValue ?? 0;
  const depot = Math.max(0, totalFree - Math.min(currentValue, totalFree));
  const overflow = currentValue > totalFree;

  const updateAsk = (patch: Partial<NonNullable<typeof ask>>) => {
    const base = ask ?? {
      enabled: false,
      currentValue: 0,
      priorYearEndValue: 0,
      depositLimit: 174_200,
      taxRate: 0.17,
      autoFillFirst: false,
      taxCreditCarryForward: 0,
      taxPaymentMode: "deductFromASK" as const,
    };
    set("free", { ...inp.free, ask: { ...base, ...patch } });
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Aktiesparekonto (ASK)</h2>
          <p className="text-sm text-muted-foreground mt-1">
            ASK indgår som en del af fri kapital. Beløbet her skal derfor ikke lægges oven i fri kapital, hvis det allerede er inkluderet.
          </p>
        </div>
        <label className="flex items-center gap-2 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/40 shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => updateAsk({ enabled: e.target.checked })}
          />
          <span className="text-sm">Brug ASK i modellen</span>
        </label>
      </div>
      {enabled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <NumField
            label="Nuværende ASK-værdi (heraf ASK)"
            value={currentValue}
            onChange={(v) => updateAsk({ currentValue: v })}
            suffix="kr"
            step={1000}
            hint={`Almindeligt frit depot beregnet: ${depot.toLocaleString("da-DK")} kr.`}
          />
          <NumField
            label="ASK-værdi ved sidste årsskifte"
            value={ask?.priorYearEndValue ?? 0}
            onChange={(v) => updateAsk({ priorYearEndValue: v })}
            suffix="kr"
            step={1000}
            hint="Bruges til at beregne årets indskudsrum."
          />
          <NumField
            label="Indskudsloft"
            value={ask?.depositLimit ?? 174_200}
            onChange={(v) => updateAsk({ depositLimit: v })}
            suffix="kr"
            step={100}
          />
          <NumField
            label="Fremført negativ ASK-skat"
            value={ask?.taxCreditCarryForward ?? 0}
            onChange={(v) => updateAsk({ taxCreditCarryForward: v })}
            suffix="kr"
            step={500}
            hint="Tab fra tidligere år der kan modregnes i fremtidige gevinster."
          />
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/40">
              <input
                type="checkbox"
                checked={ask?.autoFillFirst ?? false}
                onChange={(e) => updateAsk({ autoFillFirst: e.target.checked })}
              />
              <span className="text-sm">Fyld ASK før almindeligt depot ved planlagt opsparing</span>
            </label>
          </div>
          <div className="md:col-span-2 p-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
            ASK indgår i den generelle udtræksrækkefølge under <strong>Kapitaludtræk &amp; nedsparing</strong>. ASK beskattes fortsat separat med 17 % lagerbeskatning.
          </div>
          <div className="md:col-span-2 p-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
            ASK kan vokse over indskudsloftet via afkast. Det betyder ikke, at der skal hæves penge — det betyder blot, at der ikke kan indskydes yderligere, før der igen er indskudsrum.
          </div>

          {overflow && (
            <div className="md:col-span-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-sm text-destructive">
              ASK-værdi ({currentValue.toLocaleString("da-DK")} kr.) er højere end samlet fri kapital ({totalFree.toLocaleString("da-DK")} kr.). Modellen begrænser ASK til den samlede fri kapital.
            </div>
          )}

        </div>
      )}
    </Card>
  );
}

function DepotTaxSection({ inp, set }: { inp: ScenarioInputs; set: <K extends keyof ScenarioInputs>(k: K, v: ScenarioInputs[K]) => void }) {
  const depotTax = inp.free.depotTax;
  const enabled = !!depotTax?.enabled;
  const method = depotTax?.method ?? "legacy";
  const askValue = inp.free.ask?.enabled ? Math.min(inp.free.ask.currentValue ?? 0, inp.free.balance) : 0;
  const depotValue = Math.max(0, inp.free.balance - askValue);
  const costBasis = depotTax?.costBasis ?? depotValue;
  const unrealized = Math.max(0, depotValue - costBasis);
  const lowRate = 0.27, highRate = 0.42;
  const effRate = (lowRate + highRate) / 2;
  const deferredTax = unrealized * effRate;

  const updateDepotTax = (patch: Partial<NonNullable<typeof depotTax>>) => {
    const base = depotTax ?? {
      enabled: false,
      method: "legacy" as const,
      costBasis: null,
      showDeferredTax: true,
    };
    set("free", { ...inp.free, depotTax: { ...base, ...patch } });
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Almindeligt frit depot</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Beregnet som fri kapital minus ASK. Vælg om modellen skal lave en simpel skatteberegning på depotet.
          </p>
        </div>
        <label className="flex items-center gap-2 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/40 shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => updateDepotTax({ enabled: e.target.checked })}
          />
          <span className="text-sm">Aktivér depot-skat</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="p-3 rounded-md border border-border bg-muted/30 text-xs space-y-1">
          <div className="flex justify-between"><span>Almindeligt frit depot</span><strong className="text-foreground">{depotValue.toLocaleString("da-DK")} kr.</strong></div>
          <div className="flex justify-between"><span>Skattemæssig kostpris</span><strong className="text-foreground">{costBasis.toLocaleString("da-DK")} kr.</strong></div>
          <div className="flex justify-between"><span>Urealiseret gevinst</span><strong className="text-foreground">{unrealized.toLocaleString("da-DK")} kr.</strong></div>
          {enabled && (
            <div className="flex justify-between"><span>Latent skat (grov indikator)</span><strong className="text-foreground">{Math.round(deferredTax).toLocaleString("da-DK")} kr.</strong></div>
          )}
        </div>
        {enabled && (
          <>
            <div className="md:col-span-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Skattebehandling af almindeligt depot</label>
              <select
                data-testid="depot-tax-method"
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={method}
                onChange={(e) => updateDepotTax({ method: e.target.value as "legacy" | "realizationSimple" | "annualShareIncomeTax" })}
              >
                <option value="legacy">Uden eksplicit depot-skat</option>
                <option value="realizationSimple">Simpel realisationsskat ved udtræk</option>
                <option value="annualShareIncomeTax">Simpel årlig aktieindkomstskat af positivt afkast</option>
              </select>
              {method === "legacy" ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Modellen beregner ikke særskilt skat på almindeligt depot i denne indstilling. Brug en af de andre metoder, hvis depotafkast eller realiserede gevinster skal beskattes i fremskrivningen.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Holdingudlodning og realiserede depotgevinster deler den personlige aktieindkomstgrænse (27/42 %).
                </p>
              )}
            </div>
            <NumField
              label="Skattemæssig kostpris"
              value={depotTax?.costBasis ?? depotValue}
              onChange={(v) => updateDepotTax({ costBasis: v })}
              suffix="kr"
              step={1000}
              hint="Hvis du ikke kender kostprisen, kan du lade den være lig depotværdien. Så antager modellen ingen latent gevinst ved start."
            />
            <div className="md:col-span-2 p-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
              Rækkefølgen mellem depot, holding, ASK og pension styres under <strong>Kapitaludtræk &amp; nedsparing</strong>. ASK indgår ikke i aktieindkomst-puljen — ASK beskattes fortsat særskilt med 17 % lagerbeskatning.
            </div>

          </>
        )}
      </div>
    </Card>
  );
}

function CapitalWithdrawalSection({ inp, set }: { inp: ScenarioInputs; set: <K extends keyof ScenarioInputs>(k: K, v: ScenarioInputs[K]) => void }) {
  // Source of truth: inp.capitalWithdrawal. Hvis ikke sat, vis resolved (migreret) værdier
  // ud fra eksisterende legacy-felter — første brugerændring persisterer capitalWithdrawal.
  const resolved = resolveCapitalWithdrawal(inp);
  const view = inp.capitalWithdrawal ?? resolved;
  const update = (patch: Partial<typeof view>) => {
    set("capitalWithdrawal", { ...view, ...patch });
  };
  return (
    <Card className="p-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Kapitaludtræk & nedsparing</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Denne sektion styrer, hvilke kapitalpuljer modellen bruger først ved nedsparing og shortfall.
          Skatten afhænger stadig af kilden: holding og realiserede depotgevinster bruger personlig aktieindkomst,
          ASK beskattes separat, og pension følger pensionslogikken.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="md:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Udtræksrækkefølge</Label>
          <select
            data-testid="capital-withdrawal-strategy"
            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={view.strategy}
            onChange={(e) => update({ strategy: e.target.value as any })}
          >
            <option value="depotFirst">Almindeligt depot → Holding → ASK → Pension</option>
            <option value="holdingFirst">Holding → Almindeligt depot → ASK → Pension</option>
            <option value="askFirst">ASK → Almindeligt depot → Holding → Pension</option>
            <option value="pensionFirst">Pension (når tilgængelig) → Almindeligt depot → Holding → ASK</option>
            <option value="pensionThenHolding">Pension (når tilgængelig) → Holding → Almindeligt depot → ASK</option>
            <option value="proRata">Pro rata mellem depot, holding og ASK</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Planlagt årligt kapitaludtræk</Label>
          <select
            data-testid="capital-withdrawal-policy"
            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={view.plannedWithdrawalPolicy}
            onChange={(e) => update({ plannedWithdrawalPolicy: e.target.value as any })}
          >
            <option value="none">Træk kun ved behov</option>
            <option value="fixedAnnual">Fast årligt brutto kapitaludtræk</option>
            <option value="fillLowShareIncomeBracket">Udnyt lav personlig aktieindkomstgrænse</option>
          </select>
          {view.plannedWithdrawalPolicy === "none" && (
            <p className="text-[11px] text-muted-foreground mt-1" data-testid="cw-policy-help-none">
              Modellen hæver kun kapital, hvis årets cashflow ikke kan dække forbruget. Kilden vælges efter udtræksrækkefølgen, og udtrækket gross-up’es efter behov for at dække skat.
            </p>
          )}
          {view.plannedWithdrawalPolicy === "fixedAnnual" && (
            <p className="text-[11px] text-muted-foreground mt-1" data-testid="cw-policy-help-fixed">
              Dette beløb trækkes årligt fra den valgte startalder, uanset om der er cashflow-behov. Brug “Træk kun ved behov”, hvis modellen kun skal hæve kapital for at dække underskud.
            </p>
          )}
          {view.plannedWithdrawalPolicy === "fillLowShareIncomeBracket" && (
            <p className="text-[11px] text-muted-foreground mt-1" data-testid="cw-policy-help-fill">
              Modellen forsøger fra startalderen at bruge aktieindkomstkilder (holding og realiserede depotgevinster) op til lav sats-grænsen. ASK og pension bruges ikke til dette.
            </p>
          )}
        </div>
        {view.plannedWithdrawalPolicy === "fixedAnnual" && (
          <NumField
            label="Fast årligt brutto kapitaludtræk"
            value={view.plannedWithdrawalAmount}
            onChange={(v) => update({ plannedWithdrawalAmount: v })}
            suffix="kr/år"
            step={10000}
          />
        )}
        {(view.plannedWithdrawalPolicy === "fixedAnnual" || view.plannedWithdrawalPolicy === "fillLowShareIncomeBracket") && (
          <>
            {view.startAtStopAge ? (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Startalder for planlagt kapitaludtræk</Label>
                <div
                  data-testid="capital-withdrawal-start-age-locked"
                  className="mt-1 w-full h-10 rounded-md border border-dashed border-input bg-muted/40 px-3 text-sm flex items-center text-muted-foreground"
                >
                  Starter ved stopalder: {inp.stopAge} år
                </div>
              </div>
            ) : (
              <NumField
                label="Startalder for planlagt kapitaludtræk"
                value={view.startAge ?? inp.stopAge}
                onChange={(v) => update({ startAge: v })}
                suffix="år"
              />
            )}
            <div className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-2 p-3 rounded-md border border-border cursor-pointer hover:bg-muted/40">
                <input type="checkbox" checked={view.startAtStopAge} onChange={(e) => update({ startAtStopAge: e.target.checked })} />
                <span className="text-sm">Start ved stopalder ({inp.stopAge})</span>
              </label>
            </div>
          </>
        )}
        <div className="md:col-span-2 p-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
          Denne sektion er source of truth for udtræksrækkefølge og planlagt kapitaludtræk. Gamle felter på holding, ASK og depot-skat bevares kun i data af hensyn til bagudkompatibilitet og bruges udelukkende til migration af ældre modeller.
        </div>
      </div>
    </Card>
  );
}

