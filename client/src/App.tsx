import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/app-context";
import type { CurrentUser } from "@/lib/app-context";
import { DiagnosticsProvider } from "@/lib/diagnostics-context";
import { DiagnosticsOverlay } from "@/components/DiagnosticsOverlay";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { NoFleetAssigned } from "@/components/NoFleetAssigned";
import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Assets from "@/pages/Assets";
import AssetDetail from "@/pages/AssetDetail";
import AssetForm from "@/pages/AssetForm";
import ScheduleForm from "@/pages/ScheduleForm";
import MeterForm from "@/pages/MeterForm";
import ServiceForm from "@/pages/ServiceForm";
import MeterReadings from "@/pages/MeterReadings";
import Events from "@/pages/Events";
import Maintenance from "@/pages/Maintenance";
import Inventory from "@/pages/Inventory";
import ServiceFacilities from "@/pages/ServiceFacilities";
import InventoryForm from "@/pages/InventoryForm";
import InventoryStockForm from "@/pages/InventoryStockForm";
import Reports from "@/pages/Reports";
import Search from "@/pages/Search";
import Settings from "@/pages/Settings";
import FleetSettings from "@/pages/FleetSettings";
import Fleets from "@/pages/Fleets";

function RequireEdit({ children, fallback = "/" }: { children: ReactNode; fallback?: string }) {
  const { canEdit, isLoaded } = useAppContext();
  const [, navigate] = useHashLocation();

  useEffect(() => {
    if (isLoaded && !canEdit) navigate(fallback);
  }, [canEdit, fallback, isLoaded, navigate]);

  if (!isLoaded || !canEdit) return null;
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/assets" component={Assets} />
      <Route path="/assets/new">{() => <RequireEdit fallback="/assets"><AssetForm mode="new" /></RequireEdit>}</Route>
      <Route path="/assets/:id/edit">{(params) => <RequireEdit fallback={`/assets/${params.id}`}><AssetForm mode="edit" /></RequireEdit>}</Route>
      <Route path="/assets/:id/schedules/new">{(params) => <RequireEdit fallback={`/assets/${params.id}`}><ScheduleForm mode="new" scope="asset" /></RequireEdit>}</Route>
      <Route path="/assets/:assetId/schedules/:id/edit">{(params) => <RequireEdit fallback={`/assets/${params.assetId}`}><ScheduleForm mode="edit" scope="asset" /></RequireEdit>}</Route>
      <Route path="/maintenance/schedules/new">{() => <RequireEdit fallback="/maintenance"><ScheduleForm mode="new" scope="fleet" /></RequireEdit>}</Route>
      <Route path="/maintenance/schedules/:id/edit">{() => <RequireEdit fallback="/maintenance"><ScheduleForm mode="edit" scope="fleet" /></RequireEdit>}</Route>
      <Route path="/assets/:id/meter/new">{(params) => <RequireEdit fallback={`/assets/${params.id}`}><MeterForm /></RequireEdit>}</Route>
      <Route path="/assets/:assetId/meter/:id/edit">{(params) => <RequireEdit fallback={`/assets/${params.assetId}`}><MeterForm /></RequireEdit>}</Route>
      <Route path="/assets/:id/meter">{(params) => <RequireEdit fallback={`/assets/${params.id}`}><MeterForm /></RequireEdit>}</Route>
      <Route path="/assets/:id/services/new">{(params) => <RequireEdit fallback={`/assets/${params.id}`}><ServiceForm /></RequireEdit>}</Route>
      <Route path="/assets/:id/service/new">{(params) => <RequireEdit fallback={`/assets/${params.id}`}><ServiceForm /></RequireEdit>}</Route>
      <Route path="/events/:id/edit">{() => <RequireEdit fallback="/"><ServiceForm /></RequireEdit>}</Route>
      <Route path="/assets/:id" component={AssetDetail} />
      <Route path="/meter-readings" component={MeterReadings} />
      <Route path="/events" component={Events} />
      <Route path="/maintenance" component={Maintenance} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/inventory/new">{() => <RequireEdit fallback="/inventory"><InventoryForm mode="new" /></RequireEdit>}</Route>
      <Route path="/inventory/:id/add-stock">{(params) => <RequireEdit fallback="/inventory"><InventoryStockForm itemId={Number(params.id)} /></RequireEdit>}</Route>
      <Route path="/inventory/:id/edit">{(params) => <RequireEdit fallback="/inventory"><InventoryForm mode="edit" itemId={Number(params.id)} /></RequireEdit>}</Route>
      <Route path="/service-facilities" component={ServiceFacilities} />
      <Route path="/reports" component={Reports} />
      <Route path="/search" component={Search} />
      <Route path="/fleets" component={Fleets} />
      <Route path="/settings/fleets/:id">{(params) => <FleetSettings fleetId={Number(params.id)} />}</Route>
      <Route path="/settings" component={Settings} />
      <Route path="/admin" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const setupQ = useQuery<{ needsSetup: boolean }>({
    queryKey: ["/api/auth/setup-status"],
  });
  const meQ = useQuery<CurrentUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: setupQ.isSuccess && !setupQ.data.needsSetup,
  });

  if (setupQ.isLoading) {
    return <div className="min-h-screen bg-background" />;
  }
  if (setupQ.data?.needsSetup) {
    return <Setup onComplete={() => { setupQ.refetch(); meQ.refetch(); }} />;
  }
  if (meQ.isLoading) {
    return <div className="min-h-screen bg-background" />;
  }
  if (!meQ.data) {
    return <Login onLoggedIn={() => meQ.refetch()} />;
  }
  if (!meQ.data.systemAdmin && meQ.data.fleetIds.length === 0) {
    return (
      <NoFleetAssigned
        onLogout={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        }}
      />
    );
  }
  return (
    <AppProvider me={meQ.data}>
      <DiagnosticsProvider>{children}</DiagnosticsProvider>
    </AppProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppErrorBoundary>
          <AuthGate>
            <Toaster />
            <Router hook={useHashLocation}>
              <AppRouter />
              <DiagnosticsOverlay />
            </Router>
          </AuthGate>
        </AppErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
