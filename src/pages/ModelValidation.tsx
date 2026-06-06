import { useMemo, useState } from "react";
import { useFinanceStore, useResolvedActiveScenario } from "@/store/financeStore";
import { project } from "@/lib/finance/projection";
import { runModelValidation } from "@/lib/finance/modelValidation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, Copy } from "lucide-react";

export default function ModelValidation() {
  const scenario = useResolvedActiveScenario();
  const assumptions = useFinanceStore((s) => s.assumptions);
  const years = useMemo(() => project(scenario, assumptions), [scenario, assumptions]);
  const report = useMemo(() => runModelValidation(scenario, years), [scenario, years]);
  const [showOnlyFail, setShowOnlyFail] = useState(false);

  const visible = showOnlyFail ? report.results.filter((r) => r.status === "fail") : report.results;
  const groups = visible.reduce<Record<string, typeof report.results>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success("Validation report kopieret");
    } catch {
      toast.error("Kunne ikke kopiere");
    }
  };

  return (
    <div className="space-y-6" data-testid="model-validation-page">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Debug</div>
          <h1 className="font-display text-4xl font-semibold mt-1">Model validation</h1>
          <p className="text-muted-foreground mt-2">
            Sanity checks på det aktive scenarie ({scenario.name}). Påvirker ikke beregningen.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowOnlyFail((v) => !v)}>
            {showOnlyFail ? "Vis alle" : "Kun fejl"}
          </Button>
          <Button size="sm" onClick={copyReport} data-testid="copy-validation-report">
            <Copy className="h-4 w-4 mr-2" /> Kopiér report JSON
          </Button>
        </div>
      </header>

      <Card className="p-4 flex gap-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Checks</div>
          <div className="font-display text-2xl font-semibold">{report.totalChecks}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pass</div>
          <div className="font-display text-2xl font-semibold text-emerald-600" data-testid="validation-pass-count">
            {report.totalChecks - report.failed}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Fail</div>
          <div
            className={`font-display text-2xl font-semibold ${report.failed > 0 ? "text-destructive" : "text-muted-foreground"}`}
            data-testid="validation-fail-count"
          >
            {report.failed}
          </div>
        </div>
      </Card>

      {Object.entries(groups).map(([cat, items]) => (
        <Card key={cat} className="p-4">
          <h2 className="font-display text-lg font-semibold mb-3">{cat}</h2>
          <div className="space-y-1">
            {items.map((r) => (
              <div
                key={r.id}
                className={`flex items-start gap-3 text-sm py-2 border-b border-border last:border-0 ${
                  r.status === "fail" ? "bg-destructive/5" : ""
                }`}
                data-testid={`check-${r.id}`}
              >
                <div className="mt-0.5">
                  {r.status === "pass" ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <X className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium">
                    {r.name}
                    {r.age !== undefined && <span className="text-muted-foreground ml-2">@ alder {r.age}</span>}
                  </div>
                  {(r.expected !== undefined || r.actual !== undefined) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Forventet: <span className="num">{String(r.expected ?? "—")}</span>
                      <span className="mx-2">·</span>
                      Faktisk: <span className="num">{String(r.actual ?? "—")}</span>
                      {r.difference !== undefined && (
                        <>
                          <span className="mx-2">·</span>
                          Diff: <span className="num">{Math.round(r.difference)}</span>
                        </>
                      )}
                    </div>
                  )}
                  {r.detail && <div className="text-xs text-muted-foreground mt-0.5">{r.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
