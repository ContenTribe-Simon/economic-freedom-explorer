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
    f.salaryNet + f.partTimeNet + f.familyFundNet + f.statePensionNet + f.holdingDistributionNet;
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
          <Row label="Pension (start)" value={y.opening.pension} />
          <Row label="Holding (start)" value={y.opening.holding} />
          <Row label="Gæld (start)" value={y.opening.debt} />
        </section>

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Indkomst (netto)</div>
          <Row label="Løn netto" value={f.salaryNet} indent />
          <Row label="Deltid netto" value={f.partTimeNet} indent />
          <Row label="Familiefond" value={f.familyFundNet} indent />
          <Row label="Folkepension" value={f.statePensionNet} indent />
          <Row label="Holdingudlodning netto" value={f.holdingDistributionNet} indent />
          <Row label="Indkomst i alt" value={incomeTotal} strong />
          <Row label="Skat (løn + aktieindk.)" value={-f.taxes} indent />
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
          <Row label="Udtræk holding (brutto)" value={-f.withdrawalsGross.holding} />
          <Row label="Udtræk holding (netto)" value={f.withdrawals.holding} indent />
          <Row label="Udtræk pension (brutto)" value={-f.withdrawalsGross.pension} />
          <Row label="Udtræk pension (netto)" value={f.withdrawals.pension} indent />
          {f.cashflowSurplus !== 0 && (
            <Row label="Cashflow vs. planlagt opsparing" value={f.cashflowSurplus} indent />
          )}
        </section>

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Vækst (realafkast)</div>
          <Row label="Vækst fri" value={f.growth.free} indent />
          <Row label="Vækst pension" value={f.growth.pension} indent />
          <Row label="Vækst holding" value={f.growth.holding} indent />
        </section>

        <section>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Udgående saldi</div>
          <Row label="Fri kapital (slut)" value={y.closing.free} strong />
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
