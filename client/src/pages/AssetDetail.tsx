import { Link, useRoute, useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, CalendarDays, Car, CheckCircle2, Clock3, Copy, Gauge, Info, Loader2, MessageSquareWarning, Package, Plus, Search, Settings2, Trash2, Wrench, X, Edit, Sparkles, Wand2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Asset, MaintenanceSchedule, ServiceEvent, MeterReading, ServiceLineItem, FleetEquipmentType, FleetFuelType } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ScopeBadge } from "@/pages/Maintenance";
import { scheduleIntervalSummary, meterIntervalSuffix, formatWithCommas } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { evaluateSchedule, statusClass, statusLabel } from "@/lib/schedule";
import type { MaintenanceScheduleAssignment } from "@shared/schema";
import { formatDate, formatNumber, meterFullLabel, meterUnitLabel } from "@/lib/format";
import { assetTypeBadgeClass, tintedBadgeStyle } from "@/lib/badges";
import { useAppContext } from "@/lib/app-context";
import { LicensePlateDisplay } from "@/components/LicensePlateDisplay";
import { VinDisplay } from "@/components/VinDisplay";
import { EquipmentTypeIcon, normalizeEquipmentIcon } from "@/lib/equipment-icons";
import { FuelTypeIcon, fuelTypeByName, tintedFuelStyle } from "@/lib/fuel-types";
import { fetchRecallCacheEntry, getRecallCacheEntry, isRecallCacheEntryForVehicle, isRecallCacheFresh, type RecallCacheEntry, type VehicleSafetyLookup, type NhtsaRecallRecord, type NhtsaComplaintRecord } from "@/lib/recall-cache";
import {
  DateRangeFilter,
  MeterFilterControls,
  MeterHistoryModal,
  ServiceHistoryModal,
  defaultRange,
  filterEventsByRange,
  filterReadingsByMeterWindow,
  filterReadingsByRange,
  type DateRangeState,
  type MeterFilterMode,
  type MeterWindowOption,
} from "@/components/AssetHistoryModals";

const meterPrimaryActionClass =
  "h-10 w-36 border-[hsl(var(--action-meter)/0.3)] bg-[hsl(var(--action-meter))] text-[hsl(var(--action-meter-foreground))] hover:opacity-90";
const meterSecondaryActionClass =
  "h-10 w-36 border-[hsl(var(--action-meter)/0.35)] bg-[hsl(var(--action-meter)/0.12)] text-[hsl(var(--action-meter))] hover:bg-[hsl(var(--action-meter)/0.2)]";
const servicePrimaryActionClass =
  "h-10 w-36 border-[hsl(var(--action-service)/0.3)] bg-[hsl(var(--action-service))] text-[hsl(var(--action-service-foreground))] hover:opacity-90";
const serviceSecondaryActionClass =
  "h-10 w-36 border-[hsl(var(--action-service)/0.35)] bg-[hsl(var(--action-service)/0.12)] text-[hsl(var(--action-service))] hover:bg-[hsl(var(--action-service)/0.2)]";

type VinDecodeField = {
  Variable?: string;
  Value?: string | null;
};

type VinDecodeState = {
  loading: boolean;
  error: string | null;
  fields: VinDecodeField[];
};

export default function AssetDetail() {
  const [, params] = useRoute("/assets/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canEdit, fleet } = useAppContext();
  const assetId = params ? Number(params.id) : 0;
  const [serviceSort, setServiceSort] = useState<"date" | "meter" | "title">("date");
  const [serviceDir, setServiceDir] = useState<"asc" | "desc">("desc");
  const [serviceSnapshotRange, setServiceSnapshotRange] = useState<DateRangeState>(() => defaultRange());
  const [meterSnapshotMode, setMeterSnapshotMode] = useState<MeterFilterMode>("date");
  const [meterSnapshotRange, setMeterSnapshotRange] = useState<DateRangeState>(() => defaultRange());
  const [meterSnapshotWindow, setMeterSnapshotWindow] = useState<MeterWindowOption>("10k");
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [meterModalOpen, setMeterModalOpen] = useState(false);
  const [vinDrawerOpen, setVinDrawerOpen] = useState(false);
  const [vinDecode, setVinDecode] = useState<VinDecodeState>({ loading: false, error: null, fields: [] });
  const [addScheduleOpen, setAddScheduleOpen] = useState(false);
  const [fleetPickerOpen, setFleetPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  useEffect(() => { setActiveTab("overview"); }, [assetId]);
  const [pendingDeleteScheduleId, setPendingDeleteScheduleId] = useState<number | null>(null);
  const [safetyEntry, setSafetyEntry] = useState<RecallCacheEntry | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);

  const assetQ = useQuery<Asset>({ queryKey: ["/api/assets", assetId], enabled: !!assetId });
  const assetTypeFleetId = assetQ.data?.fleetId ?? fleet?.id;
  const typesQ = useQuery<FleetEquipmentType[]>({ queryKey: ["/api/fleet-equipment-types", { fleetId: assetTypeFleetId }], enabled: !!assetTypeFleetId });
  const fuelTypesQ = useQuery<FleetFuelType[]>({ queryKey: ["/api/fleet-fuel-types", { fleetId: assetTypeFleetId }], enabled: !!assetTypeFleetId });
  const configuredTypeForQueries = assetQ.data ? (typesQ.data ?? []).find(t => t.name === assetQ.data?.assetType) : undefined;
  const vinFeaturesEnabled = Boolean(configuredTypeForQueries?.enableVinFeatures);
  const schedulesQ = useQuery<MaintenanceSchedule[]>({
    queryKey: ["/api/schedules", { assetId }],
    enabled: !!assetId,
  });
  const eventsQ = useQuery<ServiceEvent[]>({
    queryKey: ["/api/service-events", { assetId }],
    enabled: !!assetId,
  });
  const readingsQ = useQuery<MeterReading[]>({
    queryKey: ["/api/meter-readings", { assetId }],
    enabled: !!assetId,
  });
  const lineItemsQ = useQuery<ServiceLineItem[]>({ queryKey: ["/api/service-line-items", { assetId }], enabled: !!assetId });
  const vinDecodeQ = useQuery<VinDecodeField[]>({
    queryKey: ["nhtsa-vpic-decode", assetQ.data?.vin],
    enabled: !!assetQ.data?.vin && vinFeaturesEnabled,
    retry: false,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const vin = assetQ.data!.vin!;
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`);
      if (!res.ok) throw new Error(`NHTSA vPIC returned ${res.status}`);
      const data = await res.json();
      return Array.isArray(data?.Results) ? data.Results : [];
    },
  });
  const decodedVehicleInfo = useMemo(() => getDecodedVehicleInfo(vinDecodeQ.data ?? []), [vinDecodeQ.data]);

  const deleteSchedule = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-assignments"] });
      toast({ title: "Schedule removed" });
    },
  });
  // Remove only this asset's assignment from a fleet schedule (the template stays in the library).
  const unassignFleetSchedule = useMutation({
    mutationFn: async (scheduleId: number) => {
      const r = await apiRequest("GET", `/api/schedules/${scheduleId}/assignments`);
      const current: MaintenanceScheduleAssignment[] = await r.json();
      const next = current.filter(a => a.assetId !== assetId).map(a => a.assetId);
      return apiRequest("PUT", `/api/schedules/${scheduleId}/assignments`, { assetIds: next });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-assignments"] });
      toast({ title: "Removed from this asset" });
    },
  });
  // Assign an existing fleet schedule to this asset.
  const assignFleetSchedule = useMutation({
    mutationFn: async (scheduleId: number) => {
      const r = await apiRequest("GET", `/api/schedules/${scheduleId}/assignments`);
      const current: MaintenanceScheduleAssignment[] = await r.json();
      const next = new Set<number>();
      current.forEach(a => next.add(a.assetId));
      next.add(assetId);
      return apiRequest("PUT", `/api/schedules/${scheduleId}/assignments`, { assetIds: Array.from(next) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-assignments"] });
      toast({ title: "Fleet schedule assigned" });
      setFleetPickerOpen(false);
    },
    onError: (e) => toast({ title: "Assignment failed", description: String(e), variant: "destructive" }),
  });
  // Available fleet schedules to assign (must belong to this fleet, scope = fleet, not already assigned).
  const fleetSchedulesQ = useQuery<MaintenanceSchedule[]>({
    queryKey: ["/api/schedules", { fleetId: assetQ.data?.fleetId }],
    enabled: !!assetQ.data?.fleetId,
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/schedules?fleetId=${assetQ.data!.fleetId}`);
      return r.json();
    },
  });
  const deleteService = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/service-events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-line-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meter-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Service entry removed" });
    },
    onError: (e) => toast({ title: "Delete failed", description: String(e), variant: "destructive" }),
  });
  const deleteMeterReading = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/meter-readings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meter-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Meter reading removed" });
    },
    onError: (e) => toast({ title: "Delete failed", description: String(e), variant: "destructive" }),
  });
  const onDeleteServiceEvent = (id: number) => {
    if (!window.confirm("Delete this service entry? Related line items will be removed and consumed stock will be restored.")) return;
    deleteService.mutate(id);
  };
  const onDeleteMeterReading = (id: number) => {
    if (!window.confirm("Delete this meter reading? The asset's current meter will be recalculated from remaining readings.")) return;
    deleteMeterReading.mutate(id);
  };

  if (!assetId) return null;
  const asset = assetQ.data;
  const configuredType = configuredTypeForQueries;
  const schedules = schedulesQ.data ?? [];
  const events = eventsQ.data ?? [];
  const readings = readingsQ.data ?? [];
  const lines = lineItemsQ.data ?? [];
  const pendingDeleteSchedule = schedules.find(s => s.id === pendingDeleteScheduleId) ?? null;

  const evaluations = asset
    ? schedules.map(s => ({ schedule: s, eval: evaluateSchedule(s, asset, events) }))
    : [];
  const linesByEvent = useMemo(() => {
    const map = new Map<number, ServiceLineItem[]>();
    for (const line of lines) {
      if (!map.has(line.serviceEventId)) map.set(line.serviceEventId, []);
      map.get(line.serviceEventId)!.push(line);
    }
    return map;
  }, [lines]);
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const mult = serviceDir === "asc" ? 1 : -1;
      if (serviceSort === "meter") return ((a.meterAtService ?? 0) - (b.meterAtService ?? 0)) * mult;
      if (serviceSort === "title") return a.title.localeCompare(b.title) * mult;
      return (new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()) * mult;
    });
  }, [events, serviceSort, serviceDir]);
  const sortBy = (key: typeof serviceSort) => {
    if (serviceSort === key) setServiceDir(d => d === "asc" ? "desc" : "asc");
    else { setServiceSort(key); setServiceDir("asc"); }
  };
  const manualVehicleSafetyLookup = useMemo<VehicleSafetyLookup | null>(() => {
    if (!vinFeaturesEnabled) return null;
    if (!asset?.year || !asset.make || !asset.model) return null;
    return { modelYear: String(asset.year), make: asset.make, model: asset.model, lookupSource: "manual" };
  }, [asset?.year, asset?.make, asset?.model, vinFeaturesEnabled]);
  const vehicleSafetyLookup = useMemo<VehicleSafetyLookup | null>(() => {
    if (decodedVehicleInfo) return { ...decodedVehicleInfo, lookupSource: "vpic", strictModel: true };
    return manualVehicleSafetyLookup;
  }, [decodedVehicleInfo, manualVehicleSafetyLookup]);

  useEffect(() => {
    if (!vinDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVinDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [vinDrawerOpen]);
  useEffect(() => {
    if (!vinDrawerOpen) return;
    if (vinDecodeQ.isLoading || vinDecodeQ.isFetching) {
      setVinDecode({ loading: true, error: null, fields: [] });
      return;
    }
    if (vinDecodeQ.isError) {
      setVinDecode({
        loading: false,
        error: "We couldn’t decode this VIN right now. Please try again in a moment.",
        fields: [],
      });
      return;
    }
    if (vinDecodeQ.data) {
      setVinDecode({ loading: false, error: null, fields: vinDecodeQ.data });
    }
  }, [vinDrawerOpen, vinDecodeQ.isLoading, vinDecodeQ.isFetching, vinDecodeQ.isError, vinDecodeQ.data]);
  useEffect(() => {
    if (!asset?.id) return;
    const cached = getRecallCacheEntry(asset.id);
    setSafetyEntry(cached);
    if (!vinFeaturesEnabled) return;
    if (!vehicleSafetyLookup || (isRecallCacheFresh(cached) && isRecallCacheEntryForVehicle(cached, vehicleSafetyLookup))) return;
    fetchRecallCacheEntry(asset.id, vehicleSafetyLookup, { cacheErrors: false })
      .then(entry => setSafetyEntry(entry))
      .catch(() => {
        // Background safety fetches intentionally fail silently so the button stays neutral.
      });
  }, [asset?.id, vehicleSafetyLookup, vinFeaturesEnabled]);

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Could not copy ${label.toLowerCase()}`, variant: "destructive" });
    }
  };
  const decodeVin = (vin: string) => {
    setVinDrawerOpen(true);
    if (vinDecodeQ.data) {
      setVinDecode({ loading: false, error: null, fields: vinDecodeQ.data });
      return;
    }
    if (vinDecodeQ.isError) {
      setVinDecode({
        loading: false,
        error: "We couldn’t decode this VIN right now. Please try again in a moment.",
        fields: [],
      });
      void vinDecodeQ.refetch();
      return;
    }
    setVinDecode({ loading: true, error: null, fields: [] });
    if (!vinDecodeQ.isFetching) {
      void vinDecodeQ.refetch();
    }
  };
  const loadSafetyDetail = async () => {
    setSafetyError(null);
    let lookup = vehicleSafetyLookup;
    if (!vinFeaturesEnabled) {
      setSafetyError("VIN features are disabled for this asset type.");
      return;
    }
    if (asset?.vin && !decodedVehicleInfo) {
      setSafetyLoading(true);
      try {
        const decoded = await vinDecodeQ.refetch();
        const decodedLookup = getDecodedVehicleInfo(decoded.data ?? []);
        if (decodedLookup) lookup = { ...decodedLookup, lookupSource: "vpic", strictModel: true };
      } catch {
        // If vPIC is unavailable, fall back to the manually entered year/make/model below.
      }
    }
    if (!asset?.id || !lookup) {
      setSafetyError("Year, make, and model are required before EZ-EQUIP can check NHTSA recalls and complaints.");
      setSafetyLoading(false);
      return;
    }
    const cached = getRecallCacheEntry(asset.id);
    if (isRecallCacheFresh(cached) && isRecallCacheEntryForVehicle(cached, lookup)) {
      setSafetyEntry(cached);
      setSafetyLoading(false);
      return;
    }
    setSafetyLoading(true);
    try {
      const entry = await fetchRecallCacheEntry(asset.id, lookup, { force: true, cacheErrors: true });
      setSafetyEntry(entry);
    } catch {
      setSafetyError("We couldn’t load recalls and complaints from NHTSA right now. Please try again in a moment.");
    } finally {
      setSafetyLoading(false);
    }
  };

  if (!asset) {
    return (
      <AppShell title="Asset" subtitle="ASSET DETAIL">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" size="sm" className="h-10" onClick={() => navigate("/assets")} data-testid="button-back-to-assets">
                <ArrowLeft className="size-4 mr-1.5" /> Back
              </Button>
              <div>
                <div className="font-semibold" data-testid="text-asset-fallback-title">
                  {assetQ.isLoading ? "Loading asset…" : "Asset unavailable"}
                </div>
                <p className="text-sm text-muted-foreground mt-1" data-testid="text-asset-fallback-description">
                  {assetQ.isLoading
                    ? "Fetching the asset record before loading schedules, services, and meter history."
                    : "This asset may have been deleted or is no longer available in the selected fleet."}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={asset?.friendlyName ?? "Asset"} subtitle="Asset details, meter, service history, and maintenance rules">
      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex items-start gap-4 min-w-0">
            <Button variant="outline" size="sm" className="h-10 shrink-0" onClick={() => navigate("/assets")} data-testid="button-back-to-assets">
              <ArrowLeft className="size-4 mr-1.5" /> Back
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-semibold tracking-tight" data-testid="text-asset-name">{asset.friendlyName}</h2>
                <Badge
                  variant="outline"
                  className={`inline-flex items-center gap-1.5 text-[10px] tracking-wide ${configuredType ? "" : assetTypeBadgeClass(asset.assetType)}`}
                  style={configuredType ? tintedBadgeStyle(configuredType.color) : undefined}
                >
                  <EquipmentTypeIcon icon={configuredType?.icon ?? normalizeEquipmentIcon(asset.assetType)} className="size-3" />
                  {asset.assetType}
                </Badge>
                {asset.isActive === false && (
                  <Badge variant="outline" className="border-border bg-muted/60 text-[10px] tracking-wide text-muted-foreground" data-testid="badge-asset-inactive">
                    Inactive{asset.inactiveReason ? ` · ${asset.inactiveReason}` : ""}
                  </Badge>
                )}
                {canEdit ? (
                  <Link href={`/assets/${asset.id}/edit`}>
                    <Button variant="ghost" size="sm" data-testid="button-edit-asset" aria-label="Edit asset">
                      <Edit className="size-4" />
                    </Button>
                  </Link>
                ) : (
                  <Button variant="ghost" size="sm" disabled data-testid="button-edit-asset" aria-label="Edit asset">
                    <Edit className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
        <VinDecodeDrawer
          open={vinDrawerOpen}
          vin={asset.vin ?? ""}
          state={vinDecode}
          onClose={() => setVinDrawerOpen(false)}
        />

        <Tabs
          value={activeTab}
          onValueChange={value => {
            setActiveTab(value);
            if (value === "safety") loadSafetyDetail();
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-4 h-auto" data-testid="tabs-asset-detail">
            <TabsTrigger value="overview" data-testid="tab-asset-overview">Overview</TabsTrigger>
            <TabsTrigger value="maintenance" data-testid="tab-asset-maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="meters" data-testid="tab-asset-meters">Meters</TabsTrigger>
            <TabsTrigger value="safety" data-testid="tab-asset-safety">Safety</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5">
            <Card className="p-5">
              {vinFeaturesEnabled && (
                <div className="text-sm font-medium">{[asset.year, asset.make, asset.model, asset.trim].filter(Boolean).join(" ")}</div>
              )}
              <AssetHeaderPills asset={asset} fuelTypes={fuelTypesQ.data ?? []} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {vinFeaturesEnabled && asset.vin && (
                  <div className="group/vin">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">VIN</div>
                    <div className="flex items-center gap-1.5">
                      <VinDisplay vin={asset.vin} className="text-[15px]" testId="text-asset-vin" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 opacity-0 transition-opacity group-hover/vin:opacity-100 focus:opacity-100"
                        onClick={() => copyToClipboard(asset.vin!, "VIN")}
                        aria-label="Copy VIN"
                        data-testid="button-copy-asset-vin"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full border-border bg-background/60 px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => decodeVin(asset.vin!)}
                        data-testid="button-decode-vin"
                      >
                        <Search className="mr-1.5 size-3" /> Decode VIN <Info className="ml-1 size-3" />
                      </Button>
                      <RecallsComplaintsButton
                        entry={safetyEntry}
                        onClick={() => { setActiveTab("safety"); loadSafetyDetail(); }}
                      />
                    </div>
                  </div>
                )}
                {vinFeaturesEnabled && asset.plateNumber && (
                  <div>
                    <LicensePlateDisplay jurisdiction={asset.plateJurisdiction} plateNumber={asset.plateNumber} />
                  </div>
                )}
                {asset.serial && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Serial</div>
                    <div className="font-mono text-sm" data-testid="text-asset-serial">{asset.serial}</div>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="maintenance" className="mt-5 space-y-4">
            <div className="flex justify-end">
              <div className="grid gap-2 w-full sm:w-36">
                {canEdit ? (
                  <Link href={`/assets/${asset.id}/services/new`}>
                    <Button className={servicePrimaryActionClass} data-testid="button-add-service"><Wrench className="size-4 mr-1.5" /> Add Service</Button>
                  </Link>
                ) : (
                  <Button className={servicePrimaryActionClass} disabled data-testid="button-add-service"><Wrench className="size-4 mr-1.5" /> Add Service</Button>
                )}
                <Button className={serviceSecondaryActionClass} variant="outline" onClick={() => setServiceModalOpen(true)} data-testid="button-service-history">Service History</Button>
              </div>
            </div>
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div>
                  <h3 className="font-semibold">Maintenance Schedules</h3>
                  <p className="text-sm text-muted-foreground mt-1">Fleet Schedules and Asset Schedules tracked for this asset. Schedules become due when either the meter or day interval is reached.</p>
                </div>
                {canEdit ? (
                  <Button size="sm" onClick={() => setAddScheduleOpen(true)} data-testid="button-add-schedule-inline"><Plus className="size-4 mr-1.5" /> Add Schedule</Button>
                ) : (
                  <Button size="sm" disabled data-testid="button-add-schedule-inline"><Plus className="size-4 mr-1.5" /> Add Schedule</Button>
                )}
              </div>
              {schedules.length === 0 && <p className="text-sm text-muted-foreground">No schedules yet.</p>}
              <div className="space-y-3">
                {evaluations.map(({ schedule, eval: ev }) => (
                  <div
                    key={schedule.id}
                    className={`p-4 rounded-md border border-border bg-[hsl(var(--background))] dark:bg-[hsl(var(--muted)/0.28)] shadow-sm border-l-4 ${scheduleStatusBorderClass(ev.status)}`}
                    data-testid={`schedule-row-${schedule.id}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{toTitleCase(schedule.name)}</span>
                          <ScopeBadge schedule={schedule} />
                        </div>
                        {schedule.notes && (
                          <div className="text-xs italic text-foreground/70 mt-0.5">
                            {schedule.notes}
                            {isPossiblyRedundant(schedule.name, schedule.notes) && (
                              <span className="ml-2 rounded-full border border-[hsl(var(--status-warn)/0.35)] bg-[hsl(var(--status-warn)/0.10)] px-2 py-0.5 not-italic text-[10px] tracking-wide text-[hsl(var(--status-warn))]">
                                Review description
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] tracking-wide ${statusClass(ev.status)}`}>{statusLabel(ev.status)}</Badge>
                        {canEdit ? (
                          <Link href={schedule.scope === "fleet" ? `/maintenance/schedules/${schedule.id}/edit` : `/assets/${assetId}/schedules/${schedule.id}/edit`}>
                            <Button variant="ghost" size="icon" className="size-10 hover:bg-[hsl(var(--primary)/0.08)] hover:text-[hsl(var(--primary))]" data-testid={`button-edit-schedule-${schedule.id}`} aria-label="Edit schedule"><Edit className="size-4" /></Button>
                          </Link>
                        ) : (
                          <Button variant="ghost" disabled size="icon" className="size-10" data-testid={`button-edit-schedule-${schedule.id}`} aria-label="Edit schedule"><Edit className="size-4" /></Button>
                        )}
                        <Button variant="ghost" disabled={!canEdit} size="icon" className="size-10 hover:bg-[hsl(var(--destructive)/0.08)] hover:text-[hsl(var(--destructive))]" onClick={() => setPendingDeleteScheduleId(schedule.id)} data-testid={`button-delete-schedule-${schedule.id}`} aria-label="Delete schedule">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <Field label="Interval">
                        <IntervalChips schedule={schedule} asset={asset!} />
                      </Field>
                      {ev.status === "no-history" ? (
                        <div className="lg:col-span-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm italic text-muted-foreground">
                          No completions logged yet — add one to start tracking
                        </div>
                      ) : (
                        <>
                          <Field label="Last Completed">
                            {ev.lastCompletedAt ? (
                              <>
                                <div className="num">{formatDate(ev.lastCompletedAt)}</div>
                                {ev.lastCompletedMeter != null && (
                                  <div className="text-xs text-muted-foreground num">at {formatNumber(ev.lastCompletedMeter)} {meterUnitLabel(asset!.meterType, asset?.meterLabel)}</div>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </Field>
                          <Field label={`Current ${meterFullLabel(asset!.meterType, asset?.meterLabel)}`}>
                            <span className="num">{formatNumber(asset?.currentMeter)} <span className="text-xs text-muted-foreground">{meterUnitLabel(asset!.meterType, asset?.meterLabel)}</span></span>
                          </Field>
                          <Field label="Remaining">
                            <Remaining ev={ev} asset={asset!} schedule={schedule} />
                          </Field>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5" id="asset-service-history">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <h3 className="font-semibold">Recent Service History</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Snapshot preview · click headings to sort · open the full modal for exports and detail.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <DateRangeFilter
                    value={serviceSnapshotRange}
                    onChange={setServiceSnapshotRange}
                    testIdPrefix="service-snapshot-filter"
                  />
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setServiceModalOpen(true)} data-testid="button-open-service-history-modal">View all</Button>
                </div>
              </div>
              {events.length === 0 && <p className="text-sm text-muted-foreground">No service history yet.</p>}
              {events.length > 0 && (() => {
                const filteredEvents = filterEventsByRange(events, serviceSnapshotRange);
                const previewEvents = filteredEvents
                  .slice()
                  .sort((a, b) => {
                    const mult = serviceDir === "asc" ? 1 : -1;
                    if (serviceSort === "meter") return ((a.meterAtService ?? 0) - (b.meterAtService ?? 0)) * mult;
                    if (serviceSort === "title") return a.title.localeCompare(b.title) * mult;
                    return (new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()) * mult;
                  })
                  .slice(0, 10);
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3 cursor-pointer" onClick={() => sortBy("date")}>Date</th>
                          <th className="py-2 pr-3 cursor-pointer" onClick={() => sortBy("meter")}>{meterFullLabel(asset!.meterType, asset?.meterLabel)}</th>
                          <th className="py-2 pr-3 cursor-pointer" onClick={() => sortBy("title")}>Service</th>
                          <th className="py-2 pr-3">Oil / Fluid</th>
                          <th className="py-2 pr-3">Filter / Part</th>
                          <th className="py-2 pr-3">Notes</th>
                          <th className="py-2 pr-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="[&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:pr-3">
                        {previewEvents.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-4 text-center text-sm text-muted-foreground">No services in the selected range.</td>
                          </tr>
                        )}
                        {previewEvents.map(e => {
                          const eventLines = linesByEvent.get(e.id) ?? [];
                          const fluids = eventLines.filter(l => /oil|fluid|atf|coolant/i.test(`${l.itemName} ${l.spec ?? ""}`)).map(l => `${l.itemName} (${formatNumber(l.quantity)} ${l.unit ?? ""})`);
                          const parts = eventLines.filter(l => !/oil|fluid|atf|coolant/i.test(l.itemName)).map(l => l.partNumber ? `${l.itemName} ${l.partNumber}` : l.itemName);
                          return (
                            <tr key={e.id} data-testid={`history-event-${e.id}`}>
                              <td className="num whitespace-nowrap">{formatDate(e.performedAt)}</td>
                              <td className="num whitespace-nowrap">{formatNumber(e.meterAtService)} {meterUnitLabel(asset!.meterType, asset?.meterLabel)}</td>
                              <td className="font-medium">{e.title}</td>
                              <td>{fluids.join(", ") || "—"}</td>
                              <td>{parts.join(", ") || "—"}</td>
                              <td className="max-w-xs">{e.notes ?? "—"}</td>
                              <td>
                                <div className="flex items-center gap-1 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 hover:bg-[hsl(var(--primary)/0.08)] hover:text-[hsl(var(--primary))]"
                                    disabled={!canEdit}
                                    onClick={() => navigate(`/events/${e.id}/edit`)}
                                    data-testid={`button-edit-service-${e.id}`}
                                    aria-label="Edit service entry"
                                    title="Edit service entry"
                                  >
                                    <Edit className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 hover:bg-[hsl(var(--destructive)/0.08)] hover:text-[hsl(var(--destructive))]"
                                    disabled={!canEdit}
                                    onClick={() => onDeleteServiceEvent(e.id)}
                                    data-testid={`button-delete-service-${e.id}`}
                                    aria-label="Delete service entry"
                                    title="Delete service entry"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </Card>
          </TabsContent>

          <TabsContent value="meters" className="mt-5 space-y-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="w-full sm:w-[clamp(198px,18vw,224px)] rounded-md border border-[hsl(var(--primary)/0.32)] bg-gradient-to-br from-[hsl(var(--primary)/0.10)] to-[hsl(var(--card))] p-3 flex flex-col justify-between min-h-[104px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground leading-tight">
                    Current {meterFullLabel(asset.meterType, asset.meterLabel)}
                  </div>
                  <Gauge className="size-4 text-[hsl(var(--primary))] shrink-0" />
                </div>
                <div>
                  <div className="text-3xl lg:text-[2rem] leading-none font-semibold num text-[hsl(var(--primary))] mt-2" data-testid="text-asset-meter">
                    {formatNumber(asset.currentMeter)} <span className="text-sm font-normal">{meterUnitLabel(asset.meterType, asset.meterLabel)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">As of {formatDate(asset.meterAsOf)}</div>
                </div>
                {asset.acquisitionDate && (
                  <div className="text-[11px] text-muted-foreground mt-2">Acquired {formatDate(asset.acquisitionDate)}</div>
                )}
              </div>
              <div className="grid gap-2 w-full sm:w-36">
                {canEdit ? (
                  <Link href={`/assets/${asset.id}/meter/new`}>
                    <Button className={meterPrimaryActionClass} data-testid="button-add-meter"><Gauge className="size-4 mr-1.5" /> Add Meter</Button>
                  </Link>
                ) : (
                  <Button className={meterPrimaryActionClass} disabled data-testid="button-add-meter"><Gauge className="size-4 mr-1.5" /> Add Meter</Button>
                )}
                <Button className={meterSecondaryActionClass} variant="outline" onClick={() => setMeterModalOpen(true)} data-testid="button-meter-history">Meter History</Button>
              </div>
            </div>
            <Card className="p-5" id="asset-meter-history">
              <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
                <div>
                  <h3 className="font-semibold">Recent Meter History</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Snapshot preview.</p>
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setMeterModalOpen(true)} data-testid="button-open-meter-history-modal">View all</Button>
              </div>
              <div className="mb-3">
                <MeterFilterControls
                  mode={meterSnapshotMode}
                  onModeChange={setMeterSnapshotMode}
                  range={meterSnapshotRange}
                  onRangeChange={setMeterSnapshotRange}
                  meterWindow={meterSnapshotWindow}
                  onMeterWindowChange={setMeterSnapshotWindow}
                  unitLabel={meterUnitLabel(asset.meterType, asset.meterLabel) || "mi"}
                  testIdPrefix="meter-snapshot-filter"
                />
              </div>
              {readings.length === 0 && <p className="text-sm text-muted-foreground">No meter readings recorded.</p>}
              {readings.length > 0 && (() => {
                const filteredReadings = meterSnapshotMode === "date"
                  ? filterReadingsByRange(readings, meterSnapshotRange)
                  : filterReadingsByMeterWindow(readings, asset.currentMeter, meterSnapshotWindow);
                const previewReadings = filteredReadings
                  .slice()
                  .sort((a, b) => new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime())
                  .slice(0, 8);
                if (previewReadings.length === 0) {
                  return <p className="text-xs text-muted-foreground">No readings in the selected range.</p>;
                }
                return (
                  <ul className="divide-y divide-border">
                    {previewReadings.map(r => (
                      <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm" data-testid={`history-meter-${r.id}`}>
                        <div className="text-xs text-muted-foreground">{formatDate(r.readingDate)}</div>
                        <div className="flex items-center gap-3">
                          <div className="num font-medium">{formatNumber(r.value)} <span className="text-xs text-muted-foreground">{meterUnitLabel(r.readingType, asset?.meterLabel)}</span></div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 hover:bg-[hsl(var(--primary)/0.08)] hover:text-[hsl(var(--primary))]"
                              disabled={!canEdit}
                              onClick={() => navigate(`/assets/${assetId}/meter/${r.id}/edit`)}
                              data-testid={`button-edit-meter-${r.id}`}
                              aria-label="Edit meter reading"
                              title="Edit meter reading"
                            >
                              <Edit className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 hover:bg-[hsl(var(--destructive)/0.08)] hover:text-[hsl(var(--destructive))]"
                              disabled={!canEdit}
                              onClick={() => onDeleteMeterReading(r.id)}
                              data-testid={`button-delete-meter-${r.id}`}
                              aria-label="Delete meter reading"
                              title="Delete meter reading"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </Card>
          </TabsContent>

          <TabsContent value="safety" className="mt-5">
            <Card className="p-5">
              <SafetyPanel
                asset={asset}
                entry={safetyEntry}
                lookup={safetyEntry?.lookup ?? vehicleSafetyLookup}
                loading={safetyLoading}
                error={safetyError}
              />
            </Card>
          </TabsContent>
        </Tabs>

        <ServiceHistoryModal
          open={serviceModalOpen}
          onOpenChange={setServiceModalOpen}
          asset={asset}
          events={events}
          lineItems={lines}
          fuelTypes={fuelTypesQ.data ?? []}
          configuredType={configuredType}
          vinFeaturesEnabled={vinFeaturesEnabled}
          canEdit={canEdit}
        />
        <MeterHistoryModal
          open={meterModalOpen}
          onOpenChange={setMeterModalOpen}
          asset={asset}
          readings={readings}
          fuelTypes={fuelTypesQ.data ?? []}
          configuredType={configuredType}
          vinFeaturesEnabled={vinFeaturesEnabled}
          canEdit={canEdit}
        />
      </div>

      {/* Add Schedule modal */}
      <Dialog open={addScheduleOpen} onOpenChange={setAddScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Schedule</DialogTitle>
            <DialogDescription>
              Use a shared Fleet Schedule, or create a one-off Asset Schedule for this asset.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <button
              type="button"
              className="text-left rounded-md border border-border p-4 hover:bg-muted/40"
              onClick={() => { setAddScheduleOpen(false); setFleetPickerOpen(true); }}
              data-testid="button-add-schedule-fleet"
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="size-4" />
                <span className="font-semibold">Use Fleet Schedule</span>
              </div>
              <p className="text-xs text-muted-foreground">Pick from shared templates already in your library and assign this asset.</p>
            </button>
            <Link
              href={`/assets/${assetId}/schedules/new`}
              onClick={() => setAddScheduleOpen(false)}
              className="text-left rounded-md border border-border p-4 hover:bg-muted/40"
              data-testid="button-add-schedule-custom"
            >
              <div className="flex items-center gap-2 mb-1">
                <Wand2 className="size-4" />
                <span className="font-semibold">Create Asset Schedule</span>
              </div>
              <p className="text-xs text-muted-foreground">A one-off rule only for this asset. Can be promoted to a Fleet Schedule later.</p>
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fleet schedule picker */}
      <Dialog open={fleetPickerOpen} onOpenChange={setFleetPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Fleet Schedule</DialogTitle>
            <DialogDescription>Select a Fleet Schedule to attach to {asset?.friendlyName ?? "this asset"}.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto divide-y divide-border/60 rounded-md border border-border/60">
            {(fleetSchedulesQ.data ?? []).filter(s => s.scope === "fleet").length === 0 && (
              <p className="text-sm text-muted-foreground p-3">No Fleet Schedules yet. Create one from the Maintenance page.</p>
            )}
            {(fleetSchedulesQ.data ?? []).filter(s => s.scope === "fleet").map(s => {
              const alreadyAssigned = schedules.some(x => x.id === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={alreadyAssigned || assignFleetSchedule.isPending}
                  onClick={() => assignFleetSchedule.mutate(s.id)}
                  className="w-full text-left p-3 hover:bg-muted/40 disabled:opacity-50"
                  data-testid={`button-assign-fleet-${s.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground num">{s.category ?? "Uncategorized"} · {scheduleIntervalSummary(s, asset?.meterLabel)}</div>
                    </div>
                    {alreadyAssigned && <Badge variant="outline" className="text-[10px]">Already assigned</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFleetPickerOpen(false)} data-testid="button-fleet-picker-cancel">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDeleteScheduleId != null} onOpenChange={open => { if (!open) setPendingDeleteScheduleId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDeleteSchedule?.scope === "fleet" ? `Remove ${pendingDeleteSchedule?.name}?` : `Delete ${pendingDeleteSchedule?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteSchedule?.scope === "fleet"
                ? "This removes the Fleet Schedule from this asset only. The Fleet Schedule remains available for other assets."
                : "This permanently deletes the Asset Schedule."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-schedule">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteScheduleId == null) return;
                if (pendingDeleteSchedule?.scope === "fleet") unassignFleetSchedule.mutate(pendingDeleteScheduleId);
                else deleteSchedule.mutate(pendingDeleteScheduleId);
                setPendingDeleteScheduleId(null);
              }}
              data-testid="button-confirm-delete-schedule"
            >
              {pendingDeleteSchedule?.scope === "fleet" ? "Remove" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function AssetHeaderPills({ asset, fuelTypes }: { asset: Asset; fuelTypes: FleetFuelType[] }) {
  const vinFields = parseVinDecodedFields(asset.vinDecodedFields);
  const fuel = fuelTypeByName(fuelTypes, asset.fuelType);
  const engine = enginePillValue(asset);
  const pills: Array<{
    key: string;
    label: string;
    icon: ReactNode;
    sourceFields: string[];
    style?: CSSProperties;
  }> = [];

  if (asset.fuelType) {
    pills.push({
      key: "fuel",
      label: asset.fuelType,
      icon: <FuelTypeIcon icon={fuel?.icon} className="size-3.5 shrink-0" style={{ color: fuel?.color }} />,
      sourceFields: ["fuelType"],
      style: tintedFuelStyle(fuel?.color),
    });
  }
  if (engine) {
    pills.push({
      key: "engine",
      label: engine,
      icon: <Gauge className="size-3.5 shrink-0" />,
      sourceFields: ["engineConfiguration", "engineCylinders", "engine", "displacementLiters"],
    });
  }
  if (asset.drivetrain) {
    pills.push({
      key: "drivetrain",
      label: asset.drivetrain,
      icon: <Car className="size-3.5 shrink-0" />,
      sourceFields: ["drivetrain"],
    });
  }
  if (asset.transmission) {
    pills.push({
      key: "transmission",
      label: asset.transmission,
      icon: <Settings2 className="size-3.5 shrink-0" />,
      sourceFields: ["transmission"],
    });
  }
  if (asset.gvwr) {
    pills.push({
      key: "gvwr",
      label: asset.gvwr,
      icon: <Package className="size-3.5 shrink-0" />,
      sourceFields: ["gvwr"],
    });
  }

  if (!pills.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5" data-testid="display-asset-specs">
      {pills.map(pill => (
        <Tooltip key={pill.key} delayDuration={300}>
          <TooltipTrigger asChild>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/45 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              style={pill.style}
              data-testid={`pill-asset-${pill.key}`}
            >
              {pill.icon}
              {pill.label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {pill.sourceFields.some(field => vinFields.has(field)) ? "Auto-populated from VIN decode" : "Manually entered"}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function enginePillValue(asset: Asset) {
  const descriptor = engineCylinderDescriptor(asset.engineConfiguration, asset.engineCylinders);
  const parts = [
    descriptor,
    asset.engine,
    asset.displacementLiters != null ? `${formatCompactNumber(asset.displacementLiters)}L` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function engineCylinderDescriptor(configuration?: string | null, cylinders?: number | null) {
  const config = String(configuration ?? "").toLowerCase();
  if (config.includes("rotary")) return "Rotary";
  if (config.includes("single")) return "Single-cylinder";
  if (config.includes("inline")) return cylinders ? `I${cylinders}` : "Inline";
  if (config === "v" || config.includes("v")) return cylinders ? `V${cylinders}` : "V";
  if (config.includes("opposed") || config.includes("flat")) return cylinders ? `H${cylinders}` : "Flat";
  if (config === "w" || config.includes("w")) return cylinders ? `W${cylinders}` : "W";
  return cylinders ? `${cylinders}-cyl` : "";
}

function formatCompactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function parseVinDecodedFields(value?: string | null) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map(item => String(item)));
  } catch {
    return new Set<string>();
  }
}

function RecallsComplaintsButton({
  entry,
  onClick,
}: {
  entry: RecallCacheEntry | null;
  onClick: () => void;
}) {
  const recallCount = entry?.recalls.length ?? 0;
  const complaintCount = entry?.complaints.length ?? 0;
  const base = "h-7 rounded-full px-2.5 text-[11px] font-medium";
  if (!entry || entry.status === "error") {
    return (
      <Button variant="outline" size="sm" className={`${base} border-border bg-background/60 text-muted-foreground hover:text-foreground`} onClick={onClick} data-testid="button-safety-open">
        <MessageSquareWarning className="mr-1.5 size-3" /> Recalls & Complaints
      </Button>
    );
  }
  if (recallCount > 0) {
    return (
      <Button variant="outline" size="sm" className={`${base} border-[hsl(var(--status-overdue)/0.25)] bg-[hsl(var(--status-overdue)/0.1)] text-[hsl(var(--status-overdue))] hover:bg-[hsl(var(--status-overdue)/0.15)]`} onClick={onClick} data-testid="button-safety-open">
        <AlertTriangle className="mr-1.5 size-3" /> Recalls & Complaints
        <span className="ml-1.5 rounded-full bg-[hsl(var(--status-overdue))] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[hsl(var(--status-overdue-foreground))]">{recallCount}</span>
      </Button>
    );
  }
  if (complaintCount > 0) {
    return (
      <Button variant="outline" size="sm" className={`${base} border-[hsl(var(--status-warn)/0.3)] bg-[hsl(var(--status-warn)/0.1)] text-[hsl(var(--status-warn))] hover:bg-[hsl(var(--status-warn)/0.15)]`} onClick={onClick} data-testid="button-safety-open">
        <MessageSquareWarning className="mr-1.5 size-3" /> Recalls & Complaints
        <span className="ml-1.5 rounded-full bg-[hsl(var(--status-warn))] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[hsl(var(--status-warn-foreground))]">{complaintCount}</span>
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" className={`${base} border-border bg-muted/35 text-muted-foreground hover:text-foreground`} onClick={onClick} data-testid="button-safety-open">
      <CheckCircle2 className="mr-1.5 size-3 text-[hsl(var(--status-ok))]" /> Recalls & Complaints
    </Button>
  );
}

function SafetyPanel({
  asset,
  entry,
  lookup,
  loading,
  error,
}: {
  asset: Asset;
  entry: RecallCacheEntry | null;
  lookup: VehicleSafetyLookup | null;
  loading: boolean;
  error: string | null;
}) {
  const recalls = entry?.recalls ?? [];
  const complaints = entry?.complaints ?? [];
  return (
    <div data-testid="panel-safety">
      <div className="mb-4">
        <h3 className="font-semibold" data-testid="text-safety-vehicle">
          {[asset.year, asset.make, asset.model].filter(Boolean).join(" ") || "Recalls & Complaints"}
        </h3>
        {lookup && (
          <p className="mt-1 text-xs font-medium text-muted-foreground" data-testid="text-safety-query">
            Showing results for: {lookupLabel(lookup)}
          </p>
        )}
      </div>

      {loading && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground" data-testid="state-safety-loading">
          <Loader2 className="mr-2 inline size-4 animate-spin" /> Loading recalls and complaints…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-[hsl(var(--status-overdue)/0.25)] bg-[hsl(var(--status-overdue)/0.1)] p-4 text-sm text-[hsl(var(--status-overdue))]" data-testid="state-safety-error">
          {error}
        </div>
      )}

      {!loading && !error && (
        <Tabs defaultValue="recalls" className="w-full">
          <TabsList className="grid w-full grid-cols-2" data-testid="tabs-safety">
            <TabsTrigger value="recalls">Recalls ({recalls.length})</TabsTrigger>
            <TabsTrigger value="complaints">Complaints ({complaints.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="recalls" className="mt-4">
            <RecallList recalls={recalls} />
          </TabsContent>
          <TabsContent value="complaints" className="mt-4">
            <ComplaintList complaints={complaints} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function lookupLabel(lookup: VehicleSafetyLookup) {
  return [lookup.modelYear, lookup.make, lookup.model].filter(Boolean).join(" ");
}

function RecallList({ recalls }: { recalls: NhtsaRecallRecord[] }) {
  if (recalls.length === 0) {
    return <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">No recalls on record for this vehicle.</div>;
  }
  return (
    <div className="space-y-3">
      {recalls.map((recall, index) => {
        const campaign = fieldString(recall, ["NHTSACampaignNumber", "NHTSA Campaign Number", "CampaignNumber"]) || "Unknown campaign";
        const component = fieldString(recall, ["Component", "component"]);
        const summary = fieldString(recall, ["Summary", "DefectSummary"]);
        const consequence = fieldString(recall, ["Consequence", "ConsequenceSummary"]);
        const remedy = fieldString(recall, ["Remedy", "CorrectiveAction"]);
        return (
          <article key={`${campaign}-${index}`} className="rounded-lg border border-border bg-background p-3 text-xs shadow-sm" data-testid={`card-recall-${index}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[11px] font-semibold text-[hsl(var(--status-overdue))]">{campaign}</div>
                {component && <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{component}</div>}
              </div>
              <a className="shrink-0 text-[11px] font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline" href={`https://www.nhtsa.gov/recalls?nhtsaId=${encodeURIComponent(campaign)}`} target="_blank" rel="noreferrer">
                View on NHTSA
              </a>
            </div>
            {summary && <SafetyBlock label="Defect Summary" value={summary} />}
            {consequence && <SafetyBlock label="Consequence" value={consequence} />}
            {remedy && (
              <div className="mt-3 rounded-md border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.08)] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--primary))]">Remedy</div>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">{remedy}</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ComplaintList({ complaints }: { complaints: NhtsaComplaintRecord[] }) {
  if (complaints.length === 0) {
    return <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">No complaints on record for this vehicle.</div>;
  }
  return (
    <div className="space-y-3">
      {complaints.map((complaint, index) => {
        const date = fieldString(complaint, ["DateComplaintFiled", "DateOfIncident", "dateComplaintFiled", "dateOfIncident"]);
        const component = fieldString(complaint, ["Component", "component"]);
        const summary = fieldString(complaint, ["Summary", "ComplaintDescription", "summary"]);
        const link = fieldString(complaint, ["URL", "Url", "Link", "ComplaintURL", "complaintUrl"]);
        return (
          <article key={`${fieldString(complaint, ["ODINumber", "odiNumber"]) || index}-${index}`} className="rounded-lg border border-border bg-background p-3 text-xs shadow-sm" data-testid={`card-complaint-${index}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{date || "Date unavailable"}</div>
                {component && <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{component}</div>}
              </div>
              {link && (
                <a className="shrink-0 text-[11px] font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline" href={link} target="_blank" rel="noreferrer">
                  View on NHTSA
                </a>
              )}
            </div>
            {summary && <p className="mt-3 leading-relaxed text-foreground/85">{summary}</p>}
          </article>
        );
      })}
    </div>
  );
}

function SafetyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <p className="mt-1 leading-relaxed text-foreground/85">{value}</p>
    </div>
  );
}

function fieldString(record: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = record[name];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

const VIN_SECTIONS: Array<{ label: string; fields: string[] }> = [
  {
    label: "Identity",
    fields: ["Model Year", "Make", "Model", "Trim", "Series", "Body Class", "Vehicle Type", "Manufacturer Name"],
  },
  {
    label: "Drivetrain",
    fields: [
      "Engine Number of Cylinders",
      "Displacement (L)",
      "Engine Configuration",
      "Engine Model",
      "Fuel Type - Primary",
      "Drive Type",
      "Transmission Style",
      "Wheels",
    ],
  },
  {
    label: "Weight & Size",
    fields: [
      "Gross Vehicle Weight Rating From",
      "Gross Vehicle Weight Rating To",
      "Curb Weight (pounds)",
      "Wheel Base (inches) From",
      "Wheel Base (inches) To",
      "Bed Length (inches)",
    ],
  },
];

const SAFETY_KEYWORDS = [
  "air bag",
  "airbag",
  "abs",
  "electronic stability control",
  "esc",
  "traction control",
  "tpms",
  "tire pressure monitoring",
  "seat belt",
  "brake",
  "crash",
  "pedestrian",
  "lane",
  "blind spot",
  "forward collision",
  "backup camera",
  "adaptive cruise",
];

function VinDecodeDrawer({
  open,
  vin,
  state,
  onClose,
}: {
  open: boolean;
  vin: string;
  state: VinDecodeState;
  onClose: () => void;
}) {
  if (!open) return null;
  const sections = buildVinSections(state.fields);
  const hasData = sections.some(section => section.rows.length > 0);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="vin-decode-title" data-testid="drawer-vin-decode">
      <button
        type="button"
        className="absolute inset-0 bg-[hsl(var(--overlay)/0.45)] backdrop-blur-[1px]"
        aria-label="Close VIN decode panel"
        onClick={onClose}
        data-testid="overlay-vin-decode"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <h2 id="vin-decode-title" className="text-lg font-semibold tracking-tight">VIN Decoded</h2>
            <div className="mt-1 font-mono text-xs tracking-[0.12em] text-muted-foreground break-all" data-testid="text-decoded-vin">{vin}</div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Close VIN decode panel" data-testid="button-close-vin-decode">
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {state.loading && (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground" data-testid="state-vin-decode-loading">
              Decoding VIN…
            </div>
          )}

          {!state.loading && state.error && (
            <div className="rounded-lg border border-[hsl(var(--status-overdue)/0.25)] bg-[hsl(var(--status-overdue)/0.1)] p-4 text-sm text-[hsl(var(--status-overdue))]" data-testid="state-vin-decode-error">
              {state.error}
            </div>
          )}

          {!state.loading && !state.error && !hasData && (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground" data-testid="state-vin-decode-empty">
              NHTSA returned a response, but it did not include any meaningful decoded fields for this VIN.
            </div>
          )}

          {!state.loading && !state.error && hasData && (
            <div className="space-y-5" data-testid="content-vin-decode-results">
              {sections.filter(section => section.rows.length > 0).map(section => (
                <section key={section.label}>
                  <div className="mb-2 flex items-center gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{section.label}</div>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="overflow-hidden rounded-md border border-border">
                    {section.rows.map((row, index) => (
                      <div
                        key={`${section.label}-${row.label}`}
                        className={`grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 px-3 py-2 text-xs ${index % 2 === 0 ? "bg-background" : "bg-muted/35"}`}
                      >
                        <div className="text-muted-foreground">{row.label}</div>
                        <div className="text-right font-semibold text-foreground break-words" data-testid={`text-vin-field-${section.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`}>
                          {row.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 text-xs text-muted-foreground">
          Data sourced from{" "}
          <a className="font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline" href="https://vpic.nhtsa.dot.gov" target="_blank" rel="noreferrer">
            NHTSA vPIC
          </a>{" "}
          database
        </div>
      </aside>
    </div>
  );
}

function buildVinSections(fields: VinDecodeField[]) {
  const data = new Map<string, string>();
  const orderedLabels: string[] = [];
  for (const field of fields) {
    const label = field.Variable?.trim();
    const value = field.Value?.trim();
    if (!label || !isMeaningfulVinValue(value)) continue;
    if (!data.has(label)) orderedLabels.push(label);
    data.set(label, value!);
  }

  const used = new Set<string>();
  const sections = VIN_SECTIONS.map(section => ({
    label: section.label,
    rows: section.fields
      .filter(label => data.has(label))
      .map(label => {
        used.add(label);
        return { label: displayVinLabel(label), value: data.get(label)! };
      }),
  }));

  const safetyRows = Array.from(data.entries())
    .filter(([label]) => !used.has(label) && isSafetyField(label))
    .map(([label, value]) => {
      used.add(label);
      return { label: displayVinLabel(label), value };
    });

  sections.push({ label: "Safety", rows: safetyRows });

  const additionalRows = orderedLabels
    .filter(label => !used.has(label))
    .map(label => ({ label: displayVinLabel(label), value: data.get(label)! }));

  sections.push({ label: "Additional Decoded Fields", rows: additionalRows });
  return sections;
}

function getDecodedVehicleInfo(fields: VinDecodeField[]) {
  const modelYear = vinFieldValue(fields, ["Model Year", "ModelYear"]);
  const make = vinFieldValue(fields, ["Make"]);
  const model = vinFieldValue(fields, ["Model"]);
  if (!modelYear || !make || !model) return null;
  return { make, model, modelYear };
}

function vinFieldValue(fields: VinDecodeField[], names: string[]) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  const match = fields.find(field => field.Variable && wanted.has(field.Variable.trim().toLowerCase()));
  const value = match?.Value?.trim();
  return isMeaningfulVinValue(value) ? value : null;
}

function isMeaningfulVinValue(value?: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== ""
    && normalized !== "not applicable"
    && normalized !== "n/a"
    && normalized !== "0";
}

function isSafetyField(label: string) {
  const normalized = label.toLowerCase();
  return SAFETY_KEYWORDS.some(keyword => normalized.includes(keyword));
}

function displayVinLabel(label: string) {
  const replacements: Record<string, string> = {
    "Model Year": "Year",
    "Body Class": "Body Type",
    "Engine Number of Cylinders": "Engine Cylinders",
    "Engine Configuration": "Engine Configuration",
    "Fuel Type - Primary": "Fuel Type",
    "Gross Vehicle Weight Rating From": "GVWR From",
    "Gross Vehicle Weight Rating To": "GVWR To",
    "Curb Weight (pounds)": "Curb Weight",
    "Wheel Base (inches) From": "Wheelbase From",
    "Wheel Base (inches) To": "Wheelbase To",
    "Bed Length (inches)": "Bed Length",
  };
  return replacements[label] ?? label;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-1">{children}</div>
    </div>
  );
}

function IntervalChips({ schedule, asset }: { schedule: MaintenanceSchedule; asset: Asset }) {
  // Use the schedule's own readingType so fleet schedules with kilometers/hours display correctly.
  const meterUnit = meterIntervalSuffix(schedule.readingType ?? asset.meterType, asset.meterLabel);
  const hasMeter = !!schedule.meterInterval;
  const hasDays = !!schedule.dayInterval;
  if (!hasMeter && !hasDays) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {hasMeter && (
        <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.08)] px-2 py-1 text-xs font-semibold text-[hsl(var(--primary))] num">
          <Clock3 className="size-3.5" /> {formatWithCommas(schedule.meterInterval)} {meterUnit}
        </span>
      )}
      {hasDays && (
        <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--status-warn)/0.28)] bg-[hsl(var(--status-warn)/0.09)] px-2 py-1 text-xs font-semibold text-[hsl(var(--status-warn))] num">
          <CalendarDays className="size-3.5" /> {formatWithCommas(schedule.dayInterval)} days
        </span>
      )}
    </div>
  );
}

function Remaining({ ev, asset, schedule }: { ev: ReturnType<typeof evaluateSchedule>; asset: Asset; schedule?: MaintenanceSchedule }) {
  if (ev.status === "no-history") return <span className="text-muted-foreground">Waiting for completion history</span>;
  const meterUnit = meterIntervalSuffix(schedule?.readingType ?? asset.meterType, asset.meterLabel);
  const parts: string[] = [];
  if (ev.remainingMeter != null) {
    parts.push(ev.remainingMeter <= 0
      ? `${formatWithCommas(Math.abs(ev.remainingMeter))} ${meterUnit} over`
      : `${formatWithCommas(ev.remainingMeter)} ${meterUnit} remaining`);
  }
  if (ev.remainingDays != null) {
    parts.push(ev.remainingDays <= 0 ? `${formatWithCommas(Math.abs(ev.remainingDays))} days late` : `${formatWithCommas(ev.remainingDays)} days`);
  }
  return <span className="num">{parts.join(" · ")}</span>;
}

function scheduleStatusBorderClass(status: ReturnType<typeof evaluateSchedule>["status"]) {
  switch (status) {
    case "ok": return "border-l-[hsl(var(--status-ok))]";
    case "due-soon": return "border-l-[hsl(var(--status-warn))]";
    case "overdue": return "border-l-[hsl(var(--status-overdue))]";
    default: return "border-l-border";
  }
}

function toTitleCase(value: string) {
  return value
    .split(/(\s+|-)/)
    .map(part => {
      if (/^\s+$|-$/.test(part)) return part;
      if (/^[A-Z0-9]{2,}$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

function isPossiblyRedundant(name: string, description: string) {
  const stop = new Set(["a", "an", "and", "the", "of", "for", "to", "with", "service", "routine", "scheduled"]);
  const normalize = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stop.has(word));
  const nameWords = normalize(name);
  const descriptionWords = normalize(description);
  if (nameWords.length === 0 || descriptionWords.length === 0) return false;
  const descriptionSet = new Set(descriptionWords);
  const overlap = nameWords.filter(word => descriptionSet.has(word)).length / nameWords.length;
  return overlap >= 0.8 && descriptionWords.length <= nameWords.length + 2;
}
