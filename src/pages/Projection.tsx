import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDKK } from "@/lib/format";
import { ScenarioInputs, YearRow } from "@/lib/finance/types";
import { isLifeEventValid } from "@/lib/finance/lifeEvents";
import { computeFireAnalysis, type FireYearStatus, type FireAnalysis } from "@/lib/finance/fire";
import { buildProjectionExport, buildProjectionCsv, buildYearAuditJson } from "@/lib/finance/exportProjection";
import { toast } from "sonner";
import { Copy, Download, X } from "lucide-react";

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

export function AuditPanel({ y, inputs, fireYear, onClose, scenarioId, scenarioName }: { y: YearRow; inputs: ScenarioInputs; fireYear?: FireYearStatus; onClose: () => void; scenarioId?: string; scenarioName?: string }) {
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            data-testid="copy-audit-json"
            onClick={async () => {
              try {
                const json = buildYearAuditJson(
                  { id: scenarioId ?? "", name: scenarioName ?? "" } as never,
                  y,
                );
                await navigator.clipboard.writeText(json);
                toast.success("Audit JSON kopieret.");
              } catch {
                toast.error("Kunne ikke kopiere");
              }
            }}
          >
            <Copy className="h-4 w-4 mr-1" /> JSON
          </Button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-5 w-5" />
          </button>
        </div>
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
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Årets cashflow før opsparing</div>
          {f.cashflowBridge ? (
            <>
              <Row label="Grundindkomst netto" value={f.cashflowBridge.baseIncomeNet} indent />
              {Math.abs(f.cashflowBridge.lifeEventIncome) > 0.5 && (
                <Row label="Livsfase-indkomst" value={f.cashflowBridge.lifeEventIncome} indent />
              )}
              <Row label="Indkomst i alt til cashflow" value={f.cashflowBridge.totalIncomeToCashflow} strong />
              <Row label="Forbrug" value={-f.spending} indent />
              <Row label="Renter + afdrag (privat)" value={-(f.debtInterest + f.debtPrincipal)} indent />
              {Math.abs(f.cashflowBridge.lifeEventSpending) > 0.5 && (
                <Row label="Livsfase-forbrug (delta)" value={-f.cashflowBridge.lifeEventSpending} indent />
              )}
              <Row label="Cashflow før opsparing" value={f.cashflowBridge.cashflowBeforeSavings} strong />
            </>
          ) : (
            <>
              <Row label="Indkomst netto" value={incomeTotal} indent />
              <Row label="Forbrug" value={-f.spending} indent />
              <Row label="Renter + afdrag (privat)" value={-(f.debtInterest + f.debtPrincipal)} indent />
            </>
          )}
        </section>

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Opsparing og overskud</div>
          {(() => {
            const ca = inputs.cashflowAllocation;
            const method = ca?.plannedInvestmentMethod
              ?? (inputs.savingsLogic === "cashflow" ? "cashflow" : "planned");
            const methodLabel =
              method === "cashflow" ? "Investér alt disponibelt cashflow"
              : method === "none" ? "Ingen automatisk investering"
              : "Brug planlagt opsparing";
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
                <Row label="Valgt opsparingsmetode" value={methodLabel} indent />
                <Row label="Stopregel for fri opsparing" value={ruleLabel} indent />
                <Row label="Planlagt opsparing aktiv" value={active ? "Ja" : "Nej"} indent />
                <Row label="Planlagt opsparing" value={f.plannedFreeContribution} indent />
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
                {f.plannedSavingsShortfall && (() => {
                  const ps = f.plannedSavingsShortfall!;
                  const polLabel =
                    ps.policy === "useBuffer" ? "Brug kontant buffer"
                    : ps.policy === "showShortfall" ? "Vis manglende opsparing"
                    : "Begræns investering til disponibelt cashflow";
                  return (
                    <div className="mt-2" data-testid="audit-planned-savings-shortfall">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Planlagt opsparing kunne ikke dækkes</div>
                      <Row label={`Policy: ${polLabel}`} value="" indent />
                      <Row label="Planlagt beløb" value={ps.plannedAmount} indent />
                      <Row label="Disponibelt cashflow" value={ps.availableCashflow} indent />
                      {ps.coveredByBuffer > 0.5 && <Row label="Dækket af buffer" value={ps.coveredByBuffer} indent />}
                      {ps.unmetPlannedInvestment > 0.5 && (
                        <>
                          <Row label="Ikke gennemført planlagt opsparing" value={ps.unmetPlannedInvestment} indent />
                          <div className="text-[11px] text-muted-foreground italic mt-1 pl-4">
                            Bemærk: dette er ikke et forbrugs-shortfall. Forbrug og gæld er dækket.
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
                {f.surplusAllocation && f.surplusAllocation.surplus > 0.5 && method !== "cashflow" && (() => {
                  const sa = f.surplusAllocation!;
                  const policyLabel =
                    sa.policy === "toBuffer" ? "Til kontant buffer"
                    : sa.policy === "bufferThenInvest" ? "Fyld buffer til mål, investér resten"
                    : sa.policy === "investExtra" ? "Investér ekstra automatisk"
                    : sa.policy === "extraSpending" ? "Ekstra forbrug/livsstil"
                    : "Uden for model";
                  return (
                    <div className="mt-2" data-testid="audit-surplus-allocation">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Overskud efter planlagt opsparing</div>
                      <Row label="Overskud efter plan" value={sa.surplus} indent />
                      <Row label={`Håndtering: ${policyLabel}`} value="" indent />
                      {sa.toBuffer > 0.5 && <Row label="Til buffer" value={sa.toBuffer} indent />}
                      {sa.toFreeInvestment > 0.5 && <Row label="Ekstra investeret fri kapital" value={sa.toFreeInvestment} indent />}
                      {sa.extraSpending > 0.5 && <Row label="Ekstra forbrug/livsstil" value={sa.extraSpending} indent />}
                      {sa.outOfModel > 0.5 && (
                        <>
                          <Row label="Uden for model" value={sa.outOfModel} indent />
                          <div className="text-[11px] text-muted-foreground italic mt-1 pl-4">
                            Beløbet medregnes ikke i balancefremskrivningen.
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
                {method === "cashflow" && f.investedAmount > 0 && (
                  <div className="text-[11px] text-muted-foreground italic mt-1 pl-4">
                    Hele disponible cashflow investeres — separat overskudshåndtering bruges ikke.
                  </div>
                )}
                {y.shortfallAmount > 0.5 && (
                  <Row label="Cashflow-shortfall (udækket forbrug)" value={-y.shortfallAmount} indent />
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
            <Row label="Resterende indskudsrum før årets afkast" value={Math.max(0, f.ask.depositRoom - f.ask.contribution)} indent />
            <Row label="ASK-afkast før skat" value={f.ask.growthGross} indent />
            <Row label="ASK-skat" value={-f.ask.tax} indent />
            <Row label="Brugt af fremført negativ skat" value={f.ask.carryForwardUsed} indent />
            <Row label="Fremført negativ skat (ultimo)" value={f.ask.carryForwardEnd} indent />
            <div className="mt-2 p-2 rounded-md border border-border bg-muted/30" data-testid="audit-ask-withdrawal">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Nedsparingsrækkefølge: {f.ask.withdrawalStrategy === "askFirst" ? "ASK først" : f.ask.withdrawalStrategy === "proRata" ? "Pro rata" : "Almindeligt depot først"}
              </div>
              <Row label="Udtræk fra almindeligt depot" value={-f.ask.withdrawalFreeDepot} indent />
              <Row label="Udtræk fra ASK" value={-f.ask.withdrawal} indent />
              {f.ask.withdrawalStrategy === "depotFirst" && f.ask.withdrawalFreeDepot > 0 && f.ask.withdrawal === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">ASK blev ikke brugt, fordi almindeligt depot dækkede årets frie udtræk.</p>
              )}
              {f.ask.withdrawalFreeDepot === 0 && f.ask.withdrawal === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">Ingen udtræk fra fri kapital i året.</p>
              )}
            </div>
            <Row label="ASK ultimo" value={f.ask.closing} strong />
            <Row label="Almindeligt frit depot ultimo" value={f.ask.freeDepotClosing} indent />
            <Row label="Samlet fri kapital ultimo (ASK + depot)" value={f.ask.closing + f.ask.freeDepotClosing} strong />
          </section>
        )}

        {f.shareIncome && (
          <section data-testid="audit-share-income">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Personlig aktieindkomstskat</div>
            {f.shareIncome.fundingStrategy && (
              <div className="mb-2 p-2 rounded-md border border-border bg-muted/30" data-testid="audit-share-income-funding">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  Udbetalingsrækkefølge: {f.shareIncome.fundingStrategy === "holdingFirst" ? "Holding først" : f.shareIncome.fundingStrategy === "depotFirst" ? "Depot først" : "Pro rata"}
                </div>
                <p className="text-[11px] text-muted-foreground mb-2 italic">
                  {f.shareIncome.fundingStrategy === "holdingFirst" && "Modellen bruger holdingudlodning før almindeligt depot."}
                  {f.shareIncome.fundingStrategy === "depotFirst" && "Modellen bruger almindeligt depot før holdingudlodning."}
                  {f.shareIncome.fundingStrategy === "proRata" && "Modellen fordeler cashflow mellem holding og depot proportionalt med deres saldi."}
                </p>
                <Row label="Netto fra holding" value={f.shareIncome.fundedFromHolding ?? 0} indent />
                <Row label="Brutto holdingudlodning" value={f.shareIncome.holdingGross + f.shareIncome.extraHoldingGross} indent />
                <Row label="Skat allokeret til holding" value={-(f.shareIncome.taxAllocatedHolding ?? 0)} indent />
                <Row label="Netto fra depot" value={f.shareIncome.fundedFromDepot ?? 0} indent />
                <Row label="Brutto depotsalg + realiseret gevinst" value={f.shareIncome.realizedDepotGain} indent />
                <Row label="Skat allokeret til depot" value={-(f.shareIncome.taxAllocatedDepot ?? 0)} indent />
              </div>
            )}
            <Row label="Holdingudlodning brutto" value={f.shareIncome.holdingGross} indent />
            <Row label="Ekstra holdingudlodning brutto" value={f.shareIncome.extraHoldingGross} indent />
            <Row label="Realiseret depotgevinst" value={f.shareIncome.realizedDepotGain} indent />
            {f.shareIncome.annualDepotTaxable > 0 && (
              <Row label="Årligt skattepligtigt depotafkast" value={f.shareIncome.annualDepotTaxable} indent />
            )}
            <Row label="Samlet aktieindkomst" value={f.shareIncome.totalShareIncome} strong />
            <Row label={`Beskattet ved lav sats (${Math.round(f.shareIncome.lowRate * 100)} %)`} value={f.shareIncome.taxedAtLow} indent />
            <Row label={`Beskattet ved høj sats (${Math.round(f.shareIncome.highRate * 100)} %)`} value={f.shareIncome.taxedAtHigh} indent />
            <Row label="Skat ved lav sats" value={-f.shareIncome.taxLow} indent />
            <Row label="Skat ved høj sats" value={-f.shareIncome.taxHigh} indent />
            <Row label="Aktieindkomstskat i alt" value={-f.shareIncome.taxTotal} strong />
            <p className="text-[11px] text-muted-foreground mt-2 italic">
              27/42 %-grænsen bruges kun én gang pr. år, uanset rækkefølge. Lav-grænsen brugt af holding: {Math.round(f.shareIncome.thresholdUsedByHolding).toLocaleString("da-DK")} kr. Resterende lav-grænse til depot: {Math.round(f.shareIncome.thresholdRemainingForDepot).toLocaleString("da-DK")} kr.
            </p>
          </section>
        )}

        {f.depot && f.depot.method !== "legacy" && (
          <section data-testid="audit-depot">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Almindeligt frit depot</div>
            <Row label="Depot primo" value={f.depot.opening} indent />
            <Row label="Skattemæssig kostpris primo" value={f.depot.costBasisOpening} indent />
            <Row label="Urealiseret gevinst primo" value={f.depot.unrealizedGainOpening} indent />
            <Row label="Latent skat primo (indikator)" value={f.depot.deferredTaxOpening} indent />
            <Row label="Indskud til depot" value={f.depot.contribution} indent />
            <Row label="Depot-afkast før skat" value={f.depot.growthGross} indent />
            {f.depot.annualTax > 0 && (
              <Row label="Årlig aktieindkomstskat (depot)" value={-f.depot.annualTax} indent />
            )}
            {f.depot.grossSale > 0 && (
              <>
                <Row label="Brutto salg fra depot" value={-f.depot.grossSale} indent />
                <Row label="Realiseret depotgevinst" value={f.depot.realizedGain} indent />
                <Row label="Skat af depotgevinst" value={-f.depot.saleTax} indent />
                <Row label="Netto fra depot til cashflow" value={f.depot.netToCashflow} indent />
                <Row label="Kostpris reduceret ved salg" value={-f.depot.costBasisReduction} indent />
              </>
            )}
            <Row label="Depot ultimo" value={f.depot.closing} strong />
            <Row label="Skattemæssig kostpris ultimo" value={f.depot.costBasisClosing} indent />
            <Row label="Urealiseret gevinst ultimo" value={f.depot.unrealizedGainClosing} indent />
            <Row label="Latent skat ultimo (indikator)" value={f.depot.deferredTaxClosing} indent />
          </section>
        )}




        {f.capitalWithdrawal && (() => {
          const policyKey = f.capitalWithdrawal.plannedPolicy;
          const policyLabel =
            policyKey === "none" ? "Træk kun ved behov" :
            policyKey === "fixedAnnual" ? "Fast årligt brutto kapitaludtræk" :
            policyKey === "fillLowShareIncomeBracket" ? "Udnyt lav personlig aktieindkomstgrænse" :
            String(policyKey);
          const policyDesc =
            policyKey === "none" ? "Der er ikke planlagt fast kapitaludtræk. Modellen trækker kun fra kapitalpuljer, hvis årets cashflow kræver det." :
            policyKey === "fixedAnnual" ? `Modellen trækker ${Math.round(f.capitalWithdrawal!.plannedAmount ?? 0).toLocaleString("da-DK")} kr. brutto årligt fra valgt startalder.` :
            policyKey === "fillLowShareIncomeBracket" ? "Modellen forsøger at bruge holding/depotgevinster op til lav sats-grænsen." :
            "";
          return (
            <section data-testid="audit-capital-withdrawal">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Kapitaludtræksstrategi</div>
              <div className="text-[11px] text-muted-foreground mb-1">
                Strategi: <strong>{f.capitalWithdrawal!.strategy}</strong> · Planlagt politik: <strong data-testid="audit-cw-policy-label">{policyLabel}</strong> · Startalder: <strong>{f.capitalWithdrawal!.startAge ?? "—"}</strong> · Rækkefølge: {f.capitalWithdrawal!.effectiveOrder.join(" → ")}
              </div>
              {policyDesc && (
                <p className="text-[11px] text-muted-foreground mb-2 italic" data-testid="audit-cw-policy-desc">{policyDesc}</p>
              )}
              <Row label="Brutto fra depot" value={-f.capitalWithdrawal!.grossBySource.depot} indent />
              <Row label="Netto fra depot" value={f.capitalWithdrawal!.netBySource.depot} indent />
              <Row label="Skat depot" value={-f.capitalWithdrawal!.taxBySource.depot} indent />
              <Row label="Brutto fra holding" value={-f.capitalWithdrawal!.grossBySource.holding} indent />
              <Row label="Netto fra holding" value={f.capitalWithdrawal!.netBySource.holding} indent />
              <Row label="Skat holding" value={-f.capitalWithdrawal!.taxBySource.holding} indent />
              <Row label="Brutto fra ASK" value={-f.capitalWithdrawal!.grossBySource.ask} indent />
              <Row label="Brutto fra pension" value={-f.capitalWithdrawal!.grossBySource.pension} indent />
              <Row label="Skat pension" value={-f.capitalWithdrawal!.taxBySource.pension} indent />
              <Row label="Samlet netto kapitaludtræk" value={f.capitalWithdrawal!.totalNet} strong />
            </section>
          );
        })()}

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

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const slug = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scenario";
  const date = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">År-for-år</div>
          <h1 className="font-display text-4xl font-semibold mt-1">{scenario.name}</h1>
          <p className="text-muted-foreground mt-2">Komplet fremskrivning. Alle beløb i nutidskroner. Klik en række for fuld beregningsoversigt.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            data-testid="export-projection-json"
            onClick={() => {
              const payload = buildProjectionExport(scenario, assumptions, years, fire as FireAnalysis);
              downloadFile(`projection-${slug}-${date}.json`, JSON.stringify(payload, null, 2), "application/json");
              toast.success("Projection eksporteret som JSON");
            }}
          >
            <Download className="h-4 w-4 mr-2" /> JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="export-projection-csv"
            onClick={() => {
              const csv = buildProjectionCsv(years, fire as FireAnalysis);
              downloadFile(`projection-${slug}-${date}.csv`, csv, "text/csv");
              toast.success("Projection eksporteret som CSV");
            }}
          >
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/debug/model-validation">Model validation</Link>
          </Button>
        </div>
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
