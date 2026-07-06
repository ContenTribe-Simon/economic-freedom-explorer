import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/AppShell";
import Start from "./pages/public/Start";
import SimpleInputs from "./pages/public/SimpleInputs";
import Resultat from "./pages/public/Resultat";
import GemOgDel from "./pages/public/GemOgDel";
import Dashboard from "./pages/Dashboard";
import Inputs from "./pages/Inputs";
import Assumptions from "./pages/Assumptions";
import Projection from "./pages/Projection";
import Scenarios from "./pages/Scenarios";
import Report from "./pages/Report";
import Snapshots from "./pages/Snapshots";
import Auth from "./pages/Auth";
import CloudPage from "./pages/Cloud";
import LifeEventsPage from "./pages/LifeEvents";
import FirePage from "./pages/Fire";
import CountriesPage from "./pages/Countries";
import ModelValidation from "./pages/ModelValidation";
import { AuthProvider } from "@/hooks/useAuth";
import { AdvancedGate } from "./pages/AdvancedDoor";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

/**
 * The advanced app renders inside the AppShell chrome (sidebar + nav), behind the Advanced
 * door (product structure §4): the public flow is the default entry, and the advanced surface
 * is opt-in — same engine, same data, full functionality once through the door.
 */
const ShellLayout = () => (
  <AdvancedGate>
    <AppShell>
      <Outlet />
    </AppShell>
  </AdvancedGate>
);

const App = () => (
  // Outermost on purpose: the fallback has zero provider/router dependencies, so it can
  // contain a failure in ANY layer below, providers included (Phase 7 hardening).
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* The public Frihedsmodel flow is the DEFAULT entry (product structure §4):
                  "/" leads into it; full-bleed screens without the advanced chrome. */}
              <Route path="/" element={<Navigate to="/start" replace />} />
              <Route path="/start" element={<Start />} />
              <Route path="/simple-inputs" element={<SimpleInputs />} />
              <Route path="/resultat" element={<Resultat />} />
              <Route path="/gem-og-del" element={<GemOgDel />} />

              {/* Advanced app inside the shell, behind the Advanced door (see AdvancedDoor.tsx).
                  Paths are unchanged except the dashboard, which moves from "/" to /dashboard —
                  deep links keep working once the door has been opened on the device. The debug
                  route sits inside the same gate: nothing raw is reachable from the public path. */}
              <Route element={<ShellLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/cloud" element={<CloudPage />} />
                <Route path="/inputs" element={<Inputs />} />
                <Route path="/assumptions" element={<Assumptions />} />
                <Route path="/projection" element={<Projection />} />
                <Route path="/scenarios" element={<Scenarios />} />
                <Route path="/report" element={<Report />} />
                <Route path="/snapshots" element={<Snapshots />} />
                <Route path="/life-events" element={<LifeEventsPage />} />
                <Route path="/fire" element={<FirePage />} />
                <Route path="/countries" element={<CountriesPage />} />
                <Route path="/debug/model-validation" element={<ModelValidation />} />
              </Route>

              {/* Unknown URLs land on a plain 404 on the PUBLIC side of the door. */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
