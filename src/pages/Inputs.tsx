import { ReactNode } from "react";
import { useActiveScenario, useFinanceStore } from "@/store/financeStore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScenarioInputs } from "@/lib/finance/types";

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
        <Input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
          className="num"
        />
        {suffix && <span className="text-sm text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function Inputs() {
  const scenario = useActiveScenario();
  const update = useFinanceStore((s) => s.updateScenario);
  const rename = useFinanceStore((s) => s.renameScenario);

  const set = <K extends keyof ScenarioInputs>(key: K, value: ScenarioInputs[K]) =>
    update(scenario.id, (s) => ({ ...s, inputs: { ...s.inputs, [key]: value } }));

  const inp = scenario.inputs;

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

      <Section title="Fri kapital" description="Likvide midler uden for pension og holding.">
        <NumField label="Nuværende saldo" value={inp.free.balance} onChange={(v) => set("free", { ...inp.free, balance: v })} suffix="kr" step={10000} />
        <NumField label="Månedlig opsparing" value={inp.free.monthlyContribution} onChange={(v) => set("free", { ...inp.free, monthlyContribution: v })} suffix="kr/md" step={500} />
        <NumField label="Årligt ekstra (bonus mv.)" value={inp.free.annualExtraContribution} onChange={(v) => set("free", { ...inp.free, annualExtraContribution: v })} suffix="kr/år" step={5000} />
      </Section>

      <Section title="Pension" description="Bundet kapital med 40 % afgift ved udbetaling.">
        <NumField label="Nuværende saldo" value={inp.pension.balance} onChange={(v) => set("pension", { ...inp.pension, balance: v })} suffix="kr" step={10000} />
        <NumField label="Egen indbetaling" value={inp.pension.monthlyContribution} onChange={(v) => set("pension", { ...inp.pension, monthlyContribution: v })} suffix="kr/md" step={500} />
        <NumField label="Arbejdsgiverbidrag" value={inp.pension.employerContribution} onChange={(v) => set("pension", { ...inp.pension, employerContribution: v })} suffix="kr/md" step={500} />
      </Section>

      <Section title="Holding" description="Selskabskapital. Udlodning beskattes som aktieindkomst.">
        <NumField label="Nuværende holdingkapital" value={inp.holding.balance} onChange={(v) => set("holding", { ...inp.holding, balance: v })} suffix="kr" step={50000} />
        <NumField label="Forventet exitværdi" value={inp.holding.expectedExitValue} onChange={(v) => set("holding", { ...inp.holding, expectedExitValue: v })} suffix="kr" step={100000} hint="Tilføjes til holding i exit-året (efter selskabsskat)" />
        <NumField label="Exit-år (kalenderår)" value={inp.holding.exitYear} onChange={(v) => set("holding", { ...inp.holding, exitYear: v })} step={1} />
        <NumField label="Planlagt årlig udlodning" value={inp.holding.annualDistribution} onChange={(v) => set("holding", { ...inp.holding, annualDistribution: v })} suffix="kr/år" step={10000} />
      </Section>

      <Section title="Gæld">
        <NumField label="Restgæld" value={inp.debt.balance} onChange={(v) => set("debt", { ...inp.debt, balance: v })} suffix="kr" step={10000} />
        <NumField label="Effektiv rente" value={inp.debt.interestRate} onChange={(v) => set("debt", { ...inp.debt, interestRate: v })} suffix="(0,04 = 4%)" step={0.005} />
        <NumField label="Månedlig ydelse" value={inp.debt.monthlyPayment} onChange={(v) => set("debt", { ...inp.debt, monthlyPayment: v })} suffix="kr/md" step={500} />
      </Section>

      <Section title="Indkomst">
        <NumField label="Bruttoløn (årlig)" value={inp.income.salaryGross} onChange={(v) => set("income", { ...inp.income, salaryGross: v })} suffix="kr/år" step={10000} hint="Skat beregnes automatisk" />
        <NumField label="Deltid – brutto/år" value={inp.income.partTimeAnnualGross} onChange={(v) => set("income", { ...inp.income, partTimeAnnualGross: v })} suffix="kr/år" step={10000} />
        <NumField label="Deltid fra alder" value={inp.income.partTimeFromAge} onChange={(v) => set("income", { ...inp.income, partTimeFromAge: v })} suffix="år" />
        <NumField label="Deltid indtil alder" value={inp.income.partTimeUntilAge} onChange={(v) => set("income", { ...inp.income, partTimeUntilAge: v })} suffix="år" />
        <NumField label="Familiefond (netto/år)" value={inp.income.familyFundAnnualNet} onChange={(v) => set("income", { ...inp.income, familyFundAnnualNet: v })} suffix="kr/år" step={5000} />
        <NumField label="Familiefond indtil alder" value={inp.income.familyFundUntilAge} onChange={(v) => set("income", { ...inp.income, familyFundUntilAge: v })} suffix="år" />
        <NumField label="Folkepension fra alder" value={inp.income.statePensionFromAge} onChange={(v) => set("income", { ...inp.income, statePensionFromAge: v })} suffix="år" />
      </Section>

      <Section title="Forbrug">
        <NumField label="Ønsket forbrug (netto)" value={inp.spending.desiredMonthlyNet} onChange={(v) => set("spending", { ...inp.spending, desiredMonthlyNet: v })} suffix="kr/md" step={1000} hint="I nutidskroner – antages at følge inflationen" />
      </Section>
    </div>
  );
}
