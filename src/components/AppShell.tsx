import { NavLink } from "react-router-dom";
import { LayoutDashboard, Sliders, Settings2, Table, GitCompareArrows, Download, Upload } from "lucide-react";
import { useFinanceStore } from "@/store/financeStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRef } from "react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/inputs", label: "Variabler", icon: Sliders },
  { to: "/projection", label: "År-for-år", icon: Table },
  { to: "/scenarios", label: "Scenarier", icon: GitCompareArrows },
  { to: "/assumptions", label: "Antagelser", icon: Settings2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { scenarios, activeScenarioId, setActive, addScenario, duplicateScenario, exportJson, importJson } =
    useFinanceStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importJson(reader.result as string);
        toast.success("Importeret");
      } catch {
        toast.error("Kunne ikke læse fil");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
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
              {scenarios.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        <div className="p-3 border-t border-sidebar-border space-y-2">
          <Button size="sm" variant="ghost" className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Eksporter
          </Button>
          <Button size="sm" variant="ghost" className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Importer
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
          />
          <p className="text-[10px] text-sidebar-foreground/50 leading-relaxed pt-2">
            Data gemmes lokalt i din browser. Modellen er forsimplet og udgør ikke rådgivning.
          </p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">{children}</div>
      </main>
    </div>
  );
}
