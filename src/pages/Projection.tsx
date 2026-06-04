import { useMemo, useState } from "react";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDKK } from "@/lib/format";
import { ScenarioInputs, YearRow } from "@/lib/finance/types";
import { isLifeEventValid } from "@/lib/finance/lifeEvents";
import { computeFireAnalysis, type FireYearStatus } from "@/lib/finance/fire";
import { X } from "lucide-react";

function Row({ label, value, strong, indent }: { label: string; value: number | string; strong?: boolean; indent?: boolean }) {
  return (
    <div className={`flex justify-between text-sm py-1.5 ${strong ? "font-semibold border-t border-border pt-2 mt-1" : ""} ${indent ? "pl-4 text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="num">{typeof value === "number" ? formatDKK(value) : value}</span>
    </div>
  );
}

export function ratePensionStatusText(
  age: number,
  inputs: ScenarioInputs,
  active: boolean,
): { kind: "payout" | "info"; text: string } {
  const enabled = inputs.pension.ratePensionEnabled ?? true;
  if (!enabled) return { kind: "info", text: "Deaktiveret" };
  if (active) return { kind: "payout", text: "udbetales i år" };
  const fromAge = inputs.pension.payoutFromAge;
  const years = Math.max(1, inputs.pension.ratePensionPayoutYears ?? 15);
  if (age < fromAge) return { kind: "info", text: `Aktiv – starter fra alder ${fromAge}` };
  if (age >= fromAge + years) return { kind: "info", text: "Aktiv – udbetalingsperiode afsluttet" };
  return { kind: "info", text: "Aktiv – ingen udbetaling i år" };
}

export function lifeAnnuityStatusText(
  age: number,
  inputs: ScenarioInputs,
  active: boolean,
): { kind: "payout" | "info"; text: string } {
  const la = inputs.pension.lifeAnnuity;
  if (!la?.enabled) return { kind: "info", text: "Deaktiveret" };
  if (active) return { kind: "payout", text: "udbetales i år" };
  if (age < la.fromAge) return { kind: "info", text: `Aktiv – starter fra alder ${la.fromAge}` };
  if (age > inputs.person.lifeExpectancy) return { kind: "info", text: "Aktiv – udbetalingsperiode afsluttet" };
  return { kind: "info", text: "Aktiv – ingen udbetaling i år" };
}

export function AuditPanel({ y, inputs, fireYear, onClose }: { y: YearRow; inputs: ScenarioInputs; fireYear?: FireYearStatus; onClose: () => void }) {
  const f = y.flows;
  const incomeTotal =
    f.salaryNet + f.partTimeNet + f.familyFundNet + f.statePensionNet +
    (f.ratePension?.net ?? 0) + (f.lifeAnnuity?.net ?? 0) + f.holdingDistributionNet;
  return (
    <Card className="p-6 sticky top-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Calculation audit</div>
          <h3 className="font-display text-2xl font-semibold">Alder {y.age}</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-3">
        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Indgående saldi</div>
          <Row label="Fri kapital (start)" value={y.opening.free} />
          <Row label="Buffer (start)" value={y.opening.buffer} />
          <Row label="Pension (start)" value={y.opening.pension} />
          <Row label="Holding (start)" value={y.opening.holding} />
          <Row label="Gæld (start)" value={y.opening.debt} />
        </section>

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Indkomst (netto)</div>
          {f.salaryNet > 0 && <Row label="Løn netto" value={f.salaryNet} indent />}
          {f.partTimeNet > 0 && <Row label="Deltid netto" value={f.partTimeNet} indent />}
          {f.familyFundNet > 0 && <Row label="Familiefond" value={f.familyFundNet} indent />}
          {f.statePensionNet > 0 && <Row label="Folkepension netto" value={f.statePensionNet} indent />}
          {f.statePensionGross > 0 && (
            <>
              <Row label="  – brutto" value={f.statePensionGross} indent />
              <Row label="  – skat" value={-f.statePensionTax} indent />
            </>
          )}
          {(() => {
            const status = ratePensionStatusText(y.age, inputs, !!f.ratePension?.active);
            if (status.kind === "payout") {
              return (
                <>
                  <Row label="Ratepension brutto" value={f.ratePension.gross} indent />
                  <Row label={`Ratepension skat (${f.ratePension.gross > 0 ? Math.round((f.ratePension.tax / f.ratePension.gross) * 100) : 0} %)`} value={-f.ratePension.tax} indent />
                  <Row label="Ratepension netto (til cashflow)" value={f.ratePension.net} indent />
                </>
              );
            }
            return <Row label="Ratepension" value={status.text} indent />;
          })()}
          {(() => {
            const status = lifeAnnuityStatusText(y.age, inputs, !!f.lifeAnnuity?.active);
            if (status.kind === "payout") {
              return (
                <>
                  <Row label="Livsvarig pension brutto" value={f.lifeAnnuity.gross} indent />
                  <Row label={`Livsvarig pension skat (${f.lifeAnnuity.gross > 0 ? Math.round((f.lifeAnnuity.tax / f.lifeAnnuity.gross) * 100) : 0} %)`} value={-f.lifeAnnuity.tax} indent />
                  <Row label="Livsvarig pension netto (til cashflow)" value={f.lifeAnnuity.net} indent />
                </>
              );
            }
            return <Row label="Livsvarig pension" value={status.text} indent />;
          })()}
          {f.holdingDistributionNet > 0 && <Row label="Holdingudlodning netto" value={f.holdingDistributionNet} indent />}
          <Row label="Indkomst i alt" value={incomeTotal} strong />
          <Row label="Skat i alt" value={-f.taxes} indent />
        </section>

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Forbrug & gæld</div>
          <Row label="Forbrug" value={-f.spending} />
          <Row label="Renter" value={-f.debtInterest} />
          <Row label="Afdrag" value={-f.debtPrincipal} />
        </section>

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Opsparing & udtræk</div>
          <Row label="Pensionsindbetaling (egen)" value={f.ownPensionContribution} />
          <Row label="Pensionsindbetaling (arb.giver)" value={f.employerPensionContribution} />
          <Row label="Udtræk fri" value={-f.withdrawals.free} />
          <Row label="Planlagt holdingudl. (brutto)" value={-f.holdingPlanned.gross} indent />
          <Row label="Planlagt holdingudl. (skat)" value={-f.holdingPlanned.tax} indent />
          <Row label="Planlagt holdingudl. (netto)" value={f.holdingPlanned.net} indent />
          <Row label="Ekstra holdingudtræk (brutto)" value={-f.holdingExtra.gross} indent />
          <Row label="Ekstra holdingudtræk (skat)" value={-f.holdingExtra.tax} indent />
          <Row label="Ekstra holdingudtræk (netto)" value={f.holdingExtra.net} indent />
          <Row label="Holding-saldo efter udtræk" value={y.closing.holding - f.growth.holding} indent />
          {f.pensionExtra && f.pensionExtra.gross > 0 && (
            <>
              <Row label="Ekstra bruttoudtræk fra ratepensionsdepot" value={-f.pensionExtra.gross} indent />
              <Row label="  – skat" value={-f.pensionExtra.tax} indent />
              <Row label="  – netto til cashflow" value={f.pensionExtra.net} indent />
            </>
          )}
          <Row label="Pensionsindkomst i alt (netto, sum af ovenstående)" value={f.pensionPayoutNet} indent />
          {f.withdrawals.buffer > 0 && <Row label="Udtræk fra buffer" value={-f.withdrawals.buffer} />}
        </section>

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Årets overskud/underskud og investering</div>
          <Row label="Indkomst netto" value={incomeTotal} indent />
          <Row label="Forbrug" value={-f.spending} indent />
          <Row label="Renter + afdrag (privat)" value={-(f.debtInterest + f.debtPrincipal)} indent />
          {(() => {
            const logic = inputs.savingsLogic ?? "planned";
            const logicLabel = logic === "planned" ? "Planlagt opsparing" : logic === "cashflow" ? "Cashflow-baseret" : "Hybrid";
            const rule = inputs.free.contributionStopRule ?? "stopAge";
            const ruleLabel =
              rule === "stopAge" ? `Stop ved jobstop (alder ${inputs.stopAge})`
              : rule === "fullRetireAge" ? `Stop ved fuld pension (alder ${inputs.fullRetireAge})`
              : rule === "customAge" ? `Stop ved alder ${inputs.free.contributionStopAge ?? inputs.stopAge}`
              : "Fortsætter hele livet";
            const active = f.plannedContributionsActive;
            const stopAge = f.plannedContributionStopAge;
            return (
              <>
                <Row label={`Stopregel for fri opsparing`} value={ruleLabel} indent />
                <Row label="Planlagt opsparing aktiv" value={active ? "Ja" : "Nej"} indent />
                <Row label={`Planlagt opsparing (${logicLabel})`} value={f.plannedFreeContribution} indent />
                {!active && stopAge !== null && (
                  <div className="text-[11px] text-muted-foreground italic mt-1 pl-4">
                    Planlagt opsparing: 0 kr — stoppet ved alder {stopAge}.
                  </div>
                )}
                <Row label="Faktisk investeret i fri kapital" value={f.investedAmount} strong />
                {f.ask && (
                  <div data-testid="audit-ask-allocation">
                    <Row label="Heraf til ASK" value={f.ask.contribution} indent />
                    <Row label="Heraf til almindeligt frit depot" value={Math.max(0, f.investedAmount - f.ask.contribution)} indent />
                    {!f.ask.autoFillFirst && (
                      <div className="text-[11px] text-muted-foreground italic mt-1 pl-4">
                        ASK auto-fill er slået fra — opsparing går til almindeligt depot.
                      </div>
                    )}
                    {f.ask.autoFillFirst && f.investedAmount > 0 && f.ask.contribution < f.investedAmount && (
                      <div className="text-[11px] text-muted-foreground italic mt-1 pl-4">
                        ASK-indskudsloft nået — resten går til almindeligt depot.
                      </div>
                    )}
                  </div>
                )}
                {f.unallocatedCashflow > 0.5 && (
                  <Row label="Ikke-allokeret cashflow" value={f.unallocatedCashflow} indent />
                )}
                {y.shortfallAmount > 0.5 && (
                  <Row label="Cashflow-shortfall (udækket)" value={-y.shortfallAmount} indent />
                )}
                {f.unallocatedCashflow > 0.5 && logic !== "cashflow" && (
                  <div className="text-[11px] text-muted-foreground italic mt-1 pl-4">
                    Beløbet investeres ikke automatisk under {logicLabel.toLowerCase()} og indgår derfor ikke i formuefremskrivningen.
                  </div>
                )}
              </>
            );
          })()}
        </section>

        {f.lifeEventEffects && f.lifeEventEffects.items.length > 0 && (
          <section>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Livsfaser aktive i året</div>
            {f.lifeEventEffects.items.map((it) => {
              const where =
                it.effectTarget === "privateIncome" ? "indkomst"
                : it.effectTarget === "privateSpending" ? "forbrug"
                : it.effectTarget === "freeCapital" ? "fri kapital"
                : it.effectTarget === "privateDebt" ? "privat gæld"
                : String(it.effectTarget);
              return (
                <Row key={it.id} label={`${it.name} (${where})`} value={it.signedAmount} indent />
              );
            })}
          </section>
        )}
        {(() => {
          const ignored = (inputs.lifeEvents ?? []).filter(
            (e) => e.enabled && !isLifeEventValid(e),
          );
          if (ignored.length === 0) return null;
          return (
            <section>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Livsfaser ignoreret</div>
              {ignored.map((e) => (
                <div key={e.id} className="text-xs text-muted-foreground italic pl-4 py-0.5">
                  {e.name} — ignoreret pga. ugyldig aldersperiode (slutalder før startalder).
                </div>
              ))}
            </section>
          );
        })()}

        {f.debtsDetail.length > 0 && (
          <section>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Gældsposter</div>
            <div className="space-y-2">
              {f.debtsDetail.map((d) => {
                const linkedParent = d.linkedDebtId ? f.debtsDetail.find((p) => p.id === d.linkedDebtId) : null;
                return (
                  <div key={d.id} className="border border-border rounded-md p-2 text-xs">
                    <div className="flex justify-between font-medium">
                      <span>{d.name}</span>
                      <span className="text-muted-foreground">
                        {d.impact === "private" ? "Privat" : d.impact === "holding" ? "Holding" : "Risiko"}
                        {d.includeInNetWorth ? " · i NW" : " · kun risiko (ej i NW)"}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 mt-1 text-muted-foreground">
                      <div>Start<div className="num text-foreground">{formatDKK(d.opening, { compact: true })}</div></div>
                      <div>Rente<div className="num text-foreground">{formatDKK(d.interest, { compact: true })}</div></div>
                      <div>Afdrag<div className="num text-foreground">{formatDKK(d.principal, { compact: true })}</div></div>
                      <div>Slut<div className="num text-foreground">{formatDKK(d.closing, { compact: true })}</div></div>
                    </div>
                    {d.financingNote && (
                      <div className="mt-1 text-[11px] text-muted-foreground italic">{d.financingNote}</div>
                    )}
                    {linkedParent && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Hæftelse koblet til <strong className="text-foreground">{linkedParent.name}</strong> · underliggende saldo {formatDKK(linkedParent.closing, { compact: true })} · hæftelsesbeløb {formatDKK(d.closing, { compact: true })} · {d.includeInNetWorth ? "indgår i nettoformue" : "vises kun som risiko"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Vækst (realafkast)</div>
          {f.ask ? (
            <>
              <Row label="Vækst fri i alt (efter ASK-skat)" value={f.growth.free} strong />
              <Row label="ASK-afkast før skat" value={f.ask.growthGross} indent />
              <Row label="ASK-skat" value={-f.ask.tax} indent />
              <Row label="ASK-afkast efter skat" value={f.ask.growthGross - f.ask.tax} indent />
              <Row label="Almindeligt depot-afkast (brutto)" value={f.growth.free - (f.ask.growthGross - f.ask.tax)} indent />
            </>
          ) : (
            <Row label="Vækst fri" value={f.growth.free} indent />
          )}
          <Row label="Vækst pension" value={f.growth.pension} indent />
          <Row label="Vækst holding" value={f.growth.holding} indent />
        </section>

        {fireYear && (
          <section data-testid="audit-fire">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">FIRE-status i året</div>
            <Row label="FIRE-kapitalgrundlag" value={fireYear.fireBaseCapital} indent />
            <Row label="Standard FI mål" value={fireYear.standardFiTarget} indent />
            <Row label="Gap til Standard FI" value={fireYear.gapToStandardFi} indent />
            <Row label="Coast FI" value={fireYear.meets.coast ? "Ja" : "Nej"} indent />
            <Row label="Lean FI" value={fireYear.meets.lean ? "Ja" : "Nej"} indent />
            <Row label="Standard FI" value={fireYear.meets.standard ? "Ja" : "Nej"} indent />
            <Row label="Fat FI" value={fireYear.meets.fat ? "Ja" : "Nej"} indent />
            <Row label="Barista FI" value={fireYear.meets.barista ? "Ja" : "Nej"} indent />
          </section>
        )}

        {f.ask && (
          <section data-testid="audit-ask">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Aktiesparekonto (ASK)</div>
            <Row label="ASK primo" value={f.ask.opening} indent />
            <Row label="Almindeligt frit depot primo" value={y.opening.free - f.ask.opening} indent />
            <Row label="ASK-indskud" value={f.ask.contribution} indent />
            <Row label="Indskudsrum anvendt" value={f.ask.contribution} indent />
            <Row label="Resterende indskudsrum" value={Math.max(0, f.ask.depositRoom - f.ask.contribution)} indent />
            <Row label="ASK-afkast før skat" value={f.ask.growthGross} indent />
            <Row label="ASK-skat" value={-f.ask.tax} indent />
            <Row label="Brugt af fremført negativ skat" value={f.ask.carryForwardUsed} indent />
            <Row label="Fremført negativ skat (ultimo)" value={f.ask.carryForwardEnd} indent />
            <Row label="ASK-udtræk" value={-f.ask.withdrawal} indent />
            <Row label="ASK ultimo" value={f.ask.closing} strong />
            <Row label="Almindeligt frit depot ultimo" value={f.ask.freeDepotClosing} indent />
            <Row label="Samlet fri kapital ultimo (ASK + depot)" value={f.ask.closing + f.ask.freeDepotClosing} strong />
          </section>
        )}

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Udgående saldi</div>
          <Row label="Fri kapital (slut)" value={y.closing.free} strong />
          <Row label="Buffer (slut)" value={y.closing.buffer} />
          <Row label="Pension (slut)" value={y.closing.pension} strong />
          <Row label="Holding (slut)" value={y.closing.holding} strong />
          <Row label="Gæld (slut)" value={y.closing.debt} />
          <Row label="Nettoformue" value={y.netWorth} strong />
        </section>

        {y.shortfall && (
          <div className="bg-destructive/10 border border-destructive/30 text-sm rounded-md p-3 text-destructive">
            Shortfall: {formatDKK(y.shortfallAmount)} ({formatDKK(y.monthlyGap)}/md)
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Projection() {
  const scenario = useResolvedActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);
  const years = useMemo(() => project(scenario, assumptions), [scenario, assumptions]);
  const fire = useMemo(() => computeFireAnalysis(scenario, years, assumptions), [scenario, years, assumptions]);
  const [selectedAge, setSelectedAge] = useState<number | null>(null);
  const selected = years.find((y) => y.age === selectedAge) ?? null;
  const selectedFire = selectedAge !== null ? fire.yearStatus.find((s) => s.age === selectedAge) : undefined;

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">År-for-år</div>
        <h1 className="font-display text-4xl font-semibold mt-1">{scenario.name}</h1>
        <p className="text-muted-foreground mt-2">Komplet fremskrivning. Alle beløb i nutidskroner. Klik en række for fuld beregningsoversigt.</p>
      </header>

      <div className={`grid gap-6 ${selected ? "lg:grid-cols-[1fr_400px]" : ""}`}>
        <Card className="p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Alder</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Indkomst netto</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Forbrug</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Udtræk fri</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Udtræk holding</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Udtræk pension</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Fri</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Pension</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Holding</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Gæld</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Nettoformue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((y) => (
                <TableRow
                  key={y.age}
                  onClick={() => setSelectedAge(y.age)}
                  className={`cursor-pointer ${y.shortfall ? "bg-destructive/10" : ""} ${selectedAge === y.age ? "ring-1 ring-accent bg-accent/5" : ""}`}
                >
                  <TableCell className="font-medium">{y.age}</TableCell>
                  <TableCell className="text-right num text-sm">{formatDKK(y.totalIncomeNet, { compact: true })}</TableCell>
                  <TableCell className="text-right num text-sm">{formatDKK(y.flows.spending, { compact: true })}</TableCell>
                  <TableCell className="text-right num text-sm text-muted-foreground">{y.flows.withdrawals.free ? formatDKK(y.flows.withdrawals.free, { compact: true }) : "—"}</TableCell>
                  <TableCell className="text-right num text-sm text-muted-foreground">{y.flows.withdrawals.holding ? formatDKK(y.flows.withdrawals.holding, { compact: true }) : "—"}</TableCell>
                  <TableCell className="text-right num text-sm text-muted-foreground">{y.flows.withdrawals.pension ? formatDKK(y.flows.withdrawals.pension, { compact: true }) : "—"}</TableCell>
                  <TableCell className="text-right num text-sm">{formatDKK(y.closing.free, { compact: true })}</TableCell>
                  <TableCell className="text-right num text-sm">{formatDKK(y.closing.pension, { compact: true })}</TableCell>
                  <TableCell className="text-right num text-sm">{formatDKK(y.closing.holding, { compact: true })}</TableCell>
                  <TableCell className="text-right num text-sm">{y.closing.debt > 0.5 ? formatDKK(y.closing.debt, { compact: true }) : "—"}</TableCell>
                  <TableCell className="text-right num text-sm font-semibold">{formatDKK(y.netWorth, { compact: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {selected && (
          <div>
            <AuditPanel y={selected} inputs={scenario.inputs} fireYear={selectedFire} onClose={() => setSelectedAge(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
