import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Sliders, Settings2, Table, GitCompareArrows, Download, Upload, FileText, Layers, Camera, Cloud, Calendar, Flame, Globe } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFinanceStore } from "@/store/financeStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/inputs", label: "Variabler", icon: Sliders },
  { to: "/life-events", label: "Livsfaser", icon: Calendar },
  { to: "/projection", label: "År-for-år", icon: Table },
  { to: "/scenarios", label: "Scenarier", icon: GitCompareArrows },
  { to: "/fire", label: "FIRE", icon: Flame },
  { to: "/assumptions", label: "Antagelser", icon: Settings2 },
  { to: "/report", label: "Rapport", icon: FileText },
  { to: "/snapshots", label: "Snapshots", icon: Camera },
  { to: "/cloud", label: "Cloud", icon: Cloud },
];

function formatRelative(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 5_000) return "lige nu";
  if (diff < 60_000) return `${Math.round(diff / 1000)} sek siden`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min siden`;
  return new Date(ts).toLocaleString("da-DK", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { scenarios, activeScenarioId, setActive, addScenario, duplicateScenario, exportJson, importJson, addStandardScenarios } =
    useFinanceStore();
  const snapshotCount = useFinanceStore((s) => s.snapshots.length);
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const isReport = location.pathname === "/report";

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => Date.now());
  const [_, force] = useState(0);
  const [pendingImport, setPendingImport] = useState<string | null>(null);

  // Track local persistence: zustand persist writes on every state change.
  useEffect(() => {
    const unsub = useFinanceStore.subscribe(() => setLastSavedAt(Date.now()));
    return unsub;
  }, []);

  // Re-render the relative timestamp every 30s.
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const handleExport = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Eksporteret som JSON");
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPendingImport(reader.result as string);
    reader.onerror = () => toast.error("Kunne ikke læse filen");
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    try {
      importJson(pendingImport);
      toast.success("Importeret — nuværende data er erstattet");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke importere fil");
    } finally {
      setPendingImport(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAddStandard = () => {
    const { added, skipped } = addStandardScenarios();
    if (added === 0) toast.info("Standard-scenarierne findes allerede");
    else toast.success(`Tilføjet ${added} standard-scenarie${added === 1 ? "" : "r"}${skipped ? ` (${skipped} fandtes allerede)` : ""}`);
  };

  // Print/report mode: render only the page content, no chrome.
  if (isReport) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col print:hidden">
        <div className="p-6 border-b border-sidebar-border">
          <div className="text-xs uppercase tracking-[0.2em] text-sidebar-foreground/60 mb-1">Personlig Økonomi</div>
          <div className="font-display text-2xl font-semibold leading-tight">Frihedsmodel</div>
        </div>

        <div className="p-4 border-b border-sidebar-border space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Aktivt scenarie</label>
          <Select value={activeScenarioId} onValueChange={setActive}>
            <SelectTrigger className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scenarios.map((s) => {
                const tag =
                  s.type === "linked_stress_test" ? " · linket" :
                  s.type === "custom" ? (s.manuallyEdited ? " · custom*" : " · custom") :
                  "";
                return (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}<span className="text-[10px] text-muted-foreground ml-1">{tag}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {(() => {
            const active = scenarios.find((s) => s.id === activeScenarioId);
            const label =
              active?.type === "linked_stress_test" ? "Linket stress-test" :
              active?.type === "custom" ? (active.manuallyEdited ? "Custom (redigeret)" : "Custom") :
              "Base";
            return (
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
                Type: <span className="text-sidebar-foreground/80">{label}</span>
              </p>
            );
          })()}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 text-xs"
              onClick={() => addScenario(`Scenarie ${scenarios.length + 1}`)}
            >
              + Nyt
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 text-xs"
              onClick={() => duplicateScenario(activeScenarioId)}
            >
              Dupliker
            </Button>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`
              }
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50 px-2 pb-1">Data &amp; rapport</div>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleExport}
          >
            <Download className="h-4 w-4 mr-2" /> Eksporter JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" /> Importer JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleAddStandard}
          >
            <Layers className="h-4 w-4 mr-2" /> Tilføj standard-scenarier
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
          />
          <div className="pt-3 mt-2 border-t border-sidebar-border space-y-1">
            <p className="text-[10px] text-sidebar-foreground/60" data-testid="last-saved">
              Sidst gemt lokalt: <span className="font-medium">{formatRelative(lastSavedAt)}</span>
            </p>
            <p className="text-[10px] text-sidebar-foreground/60" data-testid="snapshot-count">
              Gemte snapshots: <span className="font-medium">{snapshotCount}</span>
            </p>
            <p className="text-[10px] text-sidebar-foreground/60" data-testid="cloud-status">
              {user ? <>Cloud: <span className="font-medium">{user.email}</span></> : <>Cloud: <span className="font-medium">ikke logget ind</span></>}
            </p>
            <p className="text-[10px] text-sidebar-foreground/50 leading-relaxed">
              Data gemmes lokalt i din browser. Modellen er forsimplet og udgør ikke rådgivning.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">{children}</div>
      </main>

      <AlertDialog open={pendingImport !== null} onOpenChange={(open) => !open && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importer model?</AlertDialogTitle>
            <AlertDialogDescription>
              Dette erstatter alle nuværende scenarier, antagelser og sikkerhedsvurderinger med indholdet af filen.
              Eksportér først hvis du vil bevare en kopi af dine nuværende data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingImport(null)}>Annullér</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Erstat data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
