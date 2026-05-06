import { useMemo, useState } from "react";
import { useActiveScenario, useFinanceStore } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDKK } from "@/lib/format";
import { YearRow } from "@/lib/finance/types";
import { X } from "lucide-react";

function Row({ label, value, strong, indent }: { label: string; value: number | string; strong?: boolean; indent?: boolean }) {
  return (
    <div className={`flex justify-between text-sm py-1.5 ${strong ? "font-semibold border-t border-border pt-2 mt-1" : ""} ${indent ? "pl-4 text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="num">{typeof value === "number" ? formatDKK(value) : value}</span>
    </div>
  );
}

function AuditPanel({ y, onClose }: { y: YearRow; onClose: () => void }) {
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
          {f.ratePension?.active && (
            <>
              <Row label="Ratepension netto" value={f.ratePension.net} indent />
              <Row label="  – brutto" value={f.ratePension.gross} indent />
              <Row label="  – skat" value={-f.ratePension.tax} indent />
            </>
          )}
          {f.lifeAnnuity?.active && (
            <>
              <Row label="Livsvarig pension netto" value={f.lifeAnnuity.net} indent />
              {f.lifeAnnuity.tax > 0 && (
                <>
                  <Row label="  – brutto" value={f.lifeAnnuity.gross} indent />
                  <Row label="  – skat" value={-f.lifeAnnuity.tax} indent />
                </>
              )}
            </>
          )}
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
          <Row label="Opsparing til fri" value={f.freeContribution} />
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
          <Row label="Udtræk pension (brutto)" value={-f.withdrawalsGross.pension} />
          <Row label="Udtræk pension (netto)" value={f.withdrawals.pension} indent />
          {f.withdrawals.buffer > 0 && <Row label="Udtræk fra buffer" value={-f.withdrawals.buffer} />}
          {f.cashflowSurplus !== 0 && (
            <Row label="Cashflow vs. planlagt opsparing" value={f.cashflowSurplus} indent />
          )}
        </section>

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
          <Row label="Vækst fri" value={f.growth.free} indent />
          <Row label="Vækst pension" value={f.growth.pension} indent />
          <Row label="Vækst holding" value={f.growth.holding} indent />
        </section>

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
  const scenario = useActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);
  const years = useMemo(() => project(scenario, assumptions), [scenario, assumptions]);
  const [selectedAge, setSelectedAge] = useState<number | null>(null);
  const selected = years.find((y) => y.age === selectedAge) ?? null;

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
            <AuditPanel y={selected} onClose={() => setSelectedAge(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
