import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/AppShell";
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
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppShell>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
