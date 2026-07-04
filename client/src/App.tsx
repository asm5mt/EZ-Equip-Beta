import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/lib/app-context";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
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
import InventoryForm from "@/pages/InventoryForm";
import InventoryStockForm from "@/pages/InventoryStockForm";
import Reports from "@/pages/Reports";
import Search from "@/pages/Search";
import Admin from "@/pages/Admin";
import FleetSettings from "@/pages/FleetSettings";

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
      <Route path="/events/:id/edit">{() => <RequireEdit fallback="/events"><ServiceForm /></RequireEdit>}</Route>
      <Route path="/assets/:id" component={AssetDetail} />
      <Route path="/meter-readings" component={MeterReadings} />
      <Route path="/events" component={Events} />
      <Route path="/maintenance" component={Maintenance} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/inventory/new">{() => <RequireEdit fallback="/inventory"><InventoryForm mode="new" /></RequireEdit>}</Route>
      <Route path="/inventory/:id/add-stock">{(params) => <RequireEdit fallback="/inventory"><InventoryStockForm itemId={Number(params.id)} /></RequireEdit>}</Route>
      <Route path="/inventory/:id/edit">{(params) => <RequireEdit fallback="/inventory"><InventoryForm mode="edit" itemId={Number(params.id)} /></RequireEdit>}</Route>
      <Route path="/reports" component={Reports} />
      <Route path="/search" component={Search} />
      <Route path="/settings/fleets/:id">{(params) => <FleetSettings fleetId={Number(params.id)} />}</Route>
      <Route path="/settings" component={Admin} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppErrorBoundary>
          <AppProvider>
            <Toaster />
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          </AppProvider>
        </AppErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
