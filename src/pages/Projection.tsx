import { useMemo } from "react";
import { useActiveScenario, useFinanceStore } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDKK } from "@/lib/format";

export default function Projection() {
  const scenario = useActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);
  const years = useMemo(() => project(scenario, assumptions), [scenario, assumptions]);

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">År-for-år</div>
        <h1 className="font-display text-4xl font-semibold mt-1">{scenario.name}</h1>
        <p className="text-muted-foreground mt-2">Komplet fremskrivning. Alle beløb i nutidskroner.</p>
      </header>

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
              <TableRow key={y.age} className={y.shortfall ? "bg-destructive/10" : ""}>
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
    </div>
  );
}
