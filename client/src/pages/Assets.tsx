import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Copy, Filter, LayoutGrid, List, Plus, X } from "lucide-react";
import type { Asset, FleetEquipmentType, FleetFuelType, MeterReading, MaintenanceSchedule, MaintenanceScheduleAssignment, ServiceEvent } from "@shared/schema";
import { useAppContext } from "@/lib/app-context";
import { expandScheduleEvaluations, worstStatus, sortByUrgency } from "@/lib/schedule";
import { formatDate, formatNumber, meterFullLabel, meterUnitLabel } from "@/lib/format";
import { assetTypeBadgeClass, tintedBadgeStyle } from "@/lib/badges";
import { EquipmentTypeIcon, normalizeEquipmentIcon } from "@/lib/equipment-icons";
import { FuelTypeIcon, fuelTypeByName, tintedFuelStyle } from "@/lib/fuel-types";
import { plateJurisdictionShort } from "@/lib/plates";
import { useToast } from "@/hooks/use-toast";
import { VinDisplay } from "@/components/VinDisplay";

export type ViewMode = "list" | "grid";
type StatusFilter = "active" | "inactive" | "all";
// Per-asset service-schedule status, reduced from schedule.ts's evaluation
// primitives (see scheduleStatusByAsset below) -- "no-status" covers both
// "nothing applies to this asset" and "applies but nothing meaningfully
// trackable" (schedule.ts's "no-history"), since neither should read as
// green/"ok" when nothing is actually being tracked.
interface AssetScheduleStatus {
  status: "ok" | "due-soon" | "overdue" | "no-status";
  scheduleName?: string;
}
type SortKey =
  | "name-asc"
  | "name-desc"
  | "year-desc"
  | "year-asc"
  | "type-asc"
  | "meter-desc"
  | "meter-asc"
  | "reading-desc"
  | "reading-asc"
  | "acquired-desc"
  | "acquired-asc";

const SORT_OPTIONS: Array<[SortKey, string]> = [
  ["name-asc", "Name (A → Z)"],
  ["name-desc", "Name (Z → A)"],
  ["year-desc", "Year (Newest first)"],
  ["year-asc", "Year (Oldest first)"],
  ["type-asc", "Asset Type (A → Z)"],
  ["meter-desc", "Current Meter (Highest first)"],
  ["meter-asc", "Current Meter (Lowest first)"],
  ["reading-desc", "Last Reading (Most recent first)"],
  ["reading-asc", "Last Reading (Oldest first)"],
  ["acquired-desc", "Acquisition Date (Newest first)"],
  ["acquired-asc", "Acquisition Date (Oldest first)"],
];

export default function Assets() {
  const { fleet, canEdit } = useAppContext();
  const { toast } = useToast();
  const fleetId = fleet?.id;
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [assetTypeFilters, setAssetTypeFilters] = useState<string[]>([]);
  const [fuelTypeFilters, setFuelTypeFilters] = useState<string[]>([]);

  const assetsQ = useQuery<Asset[]>({
    queryKey: ["/api/assets", { fleetId }],
    enabled: !!fleetId,
  });
  const typesQ = useQuery<FleetEquipmentType[]>({ queryKey: ["/api/fleet-equipment-types", { fleetId }], enabled: !!fleetId });
  const fuelTypesQ = useQuery<FleetFuelType[]>({ queryKey: ["/api/fleet-fuel-types", { fleetId }], enabled: !!fleetId });
  const readingsQ = useQuery<MeterReading[]>({ queryKey: ["/api/meter-readings", { fleetId }], enabled: !!fleetId });
  const schedulesQ = useQuery<MaintenanceSchedule[]>({ queryKey: ["/api/schedules", { fleetId }], enabled: !!fleetId });
  const assignmentsQ = useQuery<MaintenanceScheduleAssignment[]>({ queryKey: ["/api/schedule-assignments", { fleetId }], enabled: !!fleetId });
  const eventsQ = useQuery<ServiceEvent[]>({ queryKey: ["/api/service-events", { fleetId }], enabled: !!fleetId });

  const assets = assetsQ.data ?? [];
  const assetTypes = typesQ.data ?? [];
  const fuelTypes = fuelTypesQ.data ?? [];
  const schedules = schedulesQ.data ?? [];
  const assignments = assignmentsQ.data ?? [];
  const typeConfig = new Map(assetTypes.map(t => [t.name, t]));
  const latestReadingByAsset = useMemo(() => {
    const map = new Map<number, MeterReading>();
    for (const reading of readingsQ.data ?? []) {
      const existing = map.get(reading.assetId);
      if (!existing || new Date(reading.readingDate).getTime() > new Date(existing.readingDate).getTime()) {
        map.set(reading.assetId, reading);
      }
    }
    return map;
  }, [readingsQ.data]);

  // Same schedule-evaluation pattern Dashboard.tsx uses (expandScheduleEvaluations
  // + worstStatus + sortByUrgency), just grouped per asset instead of flattened
  // into one fleet-wide "upcoming" list.
  const fleetAssetIds = useMemo(() => new Set(assets.map(a => a.id)), [assets]);
  const fleetEvents = useMemo(() => (eventsQ.data ?? []).filter(e => fleetAssetIds.has(e.assetId)), [eventsQ.data, fleetAssetIds]);
  const scheduleStatusByAsset = useMemo(() => {
    const evaluations = expandScheduleEvaluations(schedules, assignments, assets, fleetEvents);
    const byAsset = new Map<number, typeof evaluations>();
    for (const row of evaluations) {
      const arr = byAsset.get(row.asset.id) ?? [];
      arr.push(row);
      byAsset.set(row.asset.id, arr);
    }
    const result = new Map<number, AssetScheduleStatus>();
    for (const asset of assets) {
      const rows = byAsset.get(asset.id) ?? [];
      if (rows.length === 0) {
        result.set(asset.id, { status: "no-status" });
        continue;
      }
      const worst = worstStatus(rows.map(r => r.evaluation.status));
      if (worst === "due-soon" || worst === "overdue") {
        result.set(asset.id, { status: worst, scheduleName: sortByUrgency(rows)[0].schedule.name });
      } else if (worst === "ok") {
        result.set(asset.id, { status: "ok" });
      } else {
        // "no-history" -- schedules exist but nothing meaningfully trackable
        // (no interval and no completions). Treat the same as no schedules
        // rather than defaulting to green.
        result.set(asset.id, { status: "no-status" });
      }
    }
    return result;
  }, [schedules, assignments, assets, fleetEvents]);

  const filteredAssets = useMemo(() => {
    return [...assets]
      .filter(asset => {
        const active = asset.isActive !== false;
        if (statusFilter === "active" && !active) return false;
        if (statusFilter === "inactive" && active) return false;
        if (assetTypeFilters.length && !assetTypeFilters.includes(asset.assetType)) return false;
        if (fuelTypeFilters.length && !fuelTypeFilters.includes(String(asset.fuelType ?? ""))) return false;
        return true;
      })
      .sort((a, b) => compareAssets(a, b, sortKey, latestReadingByAsset));
  }, [assets, assetTypeFilters, fuelTypeFilters, latestReadingByAsset, sortKey, statusFilter]);

  const hasFilters = statusFilter !== "active" || assetTypeFilters.length > 0 || fuelTypeFilters.length > 0;
  const clearAllFilters = () => {
    setStatusFilter("active");
    setAssetTypeFilters([]);
    setFuelTypeFilters([]);
  };
  const copyValue = async (value: string, key: string) => {
    const label = key.startsWith("plate") ? "Plate number" : "VIN";
    try {
      await navigator.clipboard?.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Could not copy ${label.toLowerCase()}`, variant: "destructive" });
    }
  };

  return (
    <AppShell title="Assets" subtitle="Add and manage vehicles, equipment, trailers, and serviceable assets">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="button-back-dashboard">
              <ArrowLeft className="size-4 mr-1.5" /> Back
            </Button>
          </Link>
          {canEdit ? (
            <Link href="/assets/new">
              <Button data-testid="button-add-asset"><Plus className="size-4 mr-1.5" /> Add Asset</Button>
            </Link>
          ) : (
            <Button disabled data-testid="button-add-asset"><Plus className="size-4 mr-1.5" /> Add Asset</Button>
          )}
        </div>

        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sort by:</span>
                <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                  <SelectTrigger className="h-9 w-[235px]" data-testid="select-asset-sort"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9" data-testid="button-open-asset-filters">
                    <Filter className="mr-1.5 size-4" /> Filter
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[320px] space-y-4" data-testid="popover-asset-filters">
                  <FilterGroup title="Asset Type">
                    {assetTypes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No configured asset types.</p>
                    ) : assetTypes.map(type => (
                      <CheckboxRow
                        key={type.id}
                        label={type.name}
                        checked={assetTypeFilters.includes(type.name)}
                        onCheckedChange={(checked) => setAssetTypeFilters(values => checked ? [...values, type.name] : values.filter(value => value !== type.name))}
                        testId={`checkbox-filter-type-${type.id}`}
                      />
                    ))}
                  </FilterGroup>
                  <FilterGroup title="Fuel Type">
                    {fuelTypes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No configured fuel types.</p>
                    ) : fuelTypes.map(type => (
                      <CheckboxRow
                        key={type.id}
                        label={type.name}
                        checked={fuelTypeFilters.includes(type.name)}
                        onCheckedChange={(checked) => setFuelTypeFilters(values => checked ? [...values, type.name] : values.filter(value => value !== type.name))}
                        testId={`checkbox-filter-fuel-${type.id}`}
                      />
                    ))}
                  </FilterGroup>
                  <FilterGroup title="Status">
                    {([
                      ["active", "Active only"],
                      ["inactive", "Inactive only"],
                      ["all", "All assets"],
                    ] as Array<[StatusFilter, string]>).map(([value, label]) => (
                      <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
                        <input
                          type="radio"
                          name="asset-status-filter"
                          value={value}
                          checked={statusFilter === value}
                          onChange={() => setStatusFilter(value)}
                          className="size-4 accent-[hsl(var(--primary))]"
                          data-testid={`radio-filter-status-${value}`}
                        />
                        {label}
                      </label>
                    ))}
                  </FilterGroup>
                </PopoverContent>
              </Popover>
            </div>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
          {hasFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {assetTypeFilters.map(type => <FilterChip key={`type-${type}`} label={type} onRemove={() => setAssetTypeFilters(values => values.filter(value => value !== type))} />)}
              {fuelTypeFilters.map(type => <FilterChip key={`fuel-${type}`} label={type} onRemove={() => setFuelTypeFilters(values => values.filter(value => value !== type))} />)}
              {statusFilter !== "active" && (
                <FilterChip label={statusFilter === "inactive" ? "Showing inactive" : "Showing all assets"} onRemove={() => setStatusFilter("active")} />
              )}
              <button type="button" className="text-xs font-medium text-[hsl(var(--primary))] hover:underline" onClick={clearAllFilters} data-testid="button-clear-asset-filters">
                Clear all
              </button>
            </div>
          )}
        </Card>

        <Card className="p-5">
          {assetsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!assetsQ.isLoading && filteredAssets.length === 0 && (
            <p className="text-sm text-muted-foreground">No assets match the current view. Adjust filters or add an asset to start.</p>
          )}
          {viewMode === "list" ? (
            <div className="grid gap-3">
              {filteredAssets.map(asset => (
                <AssetListCard
                  key={asset.id}
                  asset={asset}
                  configuredType={typeConfig.get(asset.assetType)}
                  fuelTypes={fuelTypes}
                  latestReading={latestReadingByAsset.get(asset.id)}
                  scheduleStatus={scheduleStatusByAsset.get(asset.id)}
                  onCopy={copyValue}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredAssets.map(asset => (
                <AssetGridCard
                  key={asset.id}
                  asset={asset}
                  configuredType={typeConfig.get(asset.assetType)}
                  fuelTypes={fuelTypes}
                  latestReading={latestReadingByAsset.get(asset.id)}
                  scheduleStatus={scheduleStatusByAsset.get(asset.id)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function AssetListCard({
  asset,
  configuredType,
  fuelTypes,
  latestReading,
  scheduleStatus,
  onCopy,
}: {
  asset: Asset;
  configuredType?: FleetEquipmentType;
  fuelTypes: FleetFuelType[];
  latestReading?: MeterReading;
  scheduleStatus?: AssetScheduleStatus;
  onCopy: (value: string, key: string) => void;
}) {
  const inactive = asset.isActive === false;
  return (
    <Link
      href={`/assets/${asset.id}`}
      className={`block rounded-xl border border-border ${scheduleStatusBorderClass(scheduleStatus?.status)} border-l-4 bg-card p-4 transition-colors hover:border-y-[hsl(var(--primary)/0.45)] hover:border-r-[hsl(var(--primary)/0.45)] hover:bg-muted/25`}
      data-testid={`card-asset-${asset.id}`}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-stretch">
        <div className="min-w-0 space-y-2 lg:self-start">
          <div className="flex flex-wrap items-center gap-2">
            <AssetTypePill asset={asset} configuredType={configuredType} />
            <div className="text-lg font-semibold leading-tight" data-testid={`text-asset-name-${asset.id}`}>{asset.friendlyName}</div>
            {inactive && <InactiveBadge reason={asset.inactiveReason} />}
          </div>
          <div className="text-sm text-muted-foreground">{assetSubtitle(asset)}</div>
          <AssetTechPills asset={asset} fuelTypes={fuelTypes} />
          <IdentifierLine asset={asset} onCopy={onCopy} />
          {inactive && asset.inactiveReason && <div className="text-xs text-muted-foreground">Inactive reason: {asset.inactiveReason}</div>}
        </div>
        <MeterBlock asset={asset} latestReading={latestReading} scheduleStatus={scheduleStatus} />
      </div>
    </Link>
  );
}

function AssetGridCard({
  asset,
  configuredType,
  fuelTypes,
  latestReading,
  scheduleStatus,
}: {
  asset: Asset;
  configuredType?: FleetEquipmentType;
  fuelTypes: FleetFuelType[];
  latestReading?: MeterReading;
  scheduleStatus?: AssetScheduleStatus;
}) {
  const fuel = asset.fuelType ? fuelTypeByName(fuelTypes, asset.fuelType) : undefined;
  const hasMeter = hasMeterReading(asset, latestReading);
  return (
    <Link
      href={`/assets/${asset.id}`}
      className={`flex min-h-[220px] flex-col justify-between rounded-xl border border-border ${scheduleStatusBorderClass(scheduleStatus?.status)} border-l-4 bg-card p-4 transition-colors hover:border-y-[hsl(var(--primary)/0.45)] hover:border-r-[hsl(var(--primary)/0.45)] hover:bg-muted/25`}
      data-testid={`grid-card-asset-${asset.id}`}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <AssetTypePill asset={asset} configuredType={configuredType} />
          {asset.isActive === false && <InactiveBadge />}
        </div>
        <div className="text-base font-semibold leading-tight">{asset.friendlyName}</div>
        <div className="text-sm text-muted-foreground">{[asset.year, asset.make, asset.model].filter(Boolean).join(" · ")}</div>
        {asset.fuelType && (
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium" style={tintedFuelStyle(fuel?.color)}>
            <FuelTypeIcon icon={fuel?.icon} className="size-3.5" style={{ color: fuel?.color }} />
            {asset.fuelType}
          </span>
        )}
      </div>
      <div className="pt-4">
        <div className="mb-1.5">
          <ScheduleStatusIndicator status={scheduleStatus} assetId={asset.id} />
        </div>
        {hasMeter ? (
          <>
            <div className="text-xl font-semibold leading-none text-[hsl(var(--primary))]">
              {formatNumber(asset.currentMeter)} <span className="text-xs font-normal">{meterUnitLabel(asset.meterType, asset.meterLabel)}</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">As of {formatDate(asset.meterAsOf)}</div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">No reading recorded</div>
        )}
      </div>
    </Link>
  );
}

function AssetTypePill({ asset, configuredType }: { asset: Asset; configuredType?: FleetEquipmentType }) {
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1.5 text-[10px] tracking-wide ${configuredType ? "" : assetTypeBadgeClass(asset.assetType)}`}
      style={configuredType ? tintedBadgeStyle(configuredType.color) : undefined}
    >
      <EquipmentTypeIcon icon={configuredType?.icon ?? normalizeEquipmentIcon(asset.assetType)} className="size-3" />
      {asset.assetType}
    </Badge>
  );
}

// List-view row scanning is intentionally trimmed to just the fuel-type
// pill -- drivetrain/transmission/GVWR and the (often long, e.g. a raw
// engine code plus displacement) engine descriptor stay fully visible on
// AssetDetail's spec pills instead of crowding every list row.
function AssetTechPills({ asset, fuelTypes }: { asset: Asset; fuelTypes: FleetFuelType[] }) {
  const fuel = fuelTypeByName(fuelTypes, asset.fuelType);
  if (!asset.fuelType) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/45 px-2 py-0.5 text-[11px] font-medium text-muted-foreground" style={tintedFuelStyle(fuel?.color)}>
        <FuelTypeIcon icon={fuel?.icon} className="size-3.5" style={{ color: fuel?.color }} />
        {asset.fuelType}
      </span>
    </div>
  );
}

function IdentifierLine({ asset, onCopy }: { asset: Asset; onCopy: (value: string, key: string) => void }) {
  const identifiers = [
    asset.vin ? { label: "VIN", value: asset.vin, displayValue: asset.vin, key: `vin-${asset.id}` } : null,
    asset.plateNumber
      ? {
          label: "Plate",
          value: asset.plateNumber,
          displayValue: `${plateJurisdictionShort(asset.plateJurisdiction) ? `${plateJurisdictionShort(asset.plateJurisdiction)} ` : ""}${asset.plateNumber}`,
          key: `plate-${asset.id}`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; displayValue: string; key: string }>;
  if (!identifiers.length) return null;
  return (
    <div className="group/ids flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
      {identifiers.map((item, index) => (
        <span key={item.key} className={`inline-flex items-center gap-1 ${index > 0 ? "ml-1" : ""}`}>
          {item.label === "VIN" ? <VinDisplay vin={item.displayValue} /> : <span>{item.displayValue}</span>}
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover/ids:opacity-100 focus:opacity-100"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCopy(item.value, item.key);
            }}
            aria-label={`Copy ${item.label}`}
            data-testid={`button-copy-${item.key}`}
          >
            <Copy className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function MeterBlock({ asset, latestReading, scheduleStatus }: { asset: Asset; latestReading?: MeterReading; scheduleStatus?: AssetScheduleStatus }) {
  const hasMeter = hasMeterReading(asset, latestReading);
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <ScheduleStatusIndicator status={scheduleStatus} assetId={asset.id} />
      {hasMeter ? (
        <div className="mt-3">
          <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Current {meterFullLabel(asset.meterType, asset.meterLabel)}</div>
          <div className="mt-1 text-xl font-semibold leading-none text-[hsl(var(--primary))]">
            {formatNumber(asset.currentMeter)} <span className="text-sm font-normal">{meterUnitLabel(asset.meterType, asset.meterLabel)}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">As of {formatDate(asset.meterAsOf)}</div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">No reading recorded</div>
      )}
    </div>
  );
}

// Same border-l-4 + status-color convention AssetDetail.tsx already uses for
// its maintenance-schedule cards (scheduleStatusBorderClass there) -- reused
// here so the Assets list/grid cards get a scannable left accent without
// inventing a second color convention for the same four states.
function scheduleStatusBorderClass(status?: AssetScheduleStatus["status"]) {
  switch (status) {
    case "overdue": return "border-l-[hsl(var(--status-overdue))]";
    case "due-soon": return "border-l-[hsl(var(--status-warn))]";
    case "ok": return "border-l-[hsl(var(--status-ok))]";
    default: return "border-l-border";
  }
}

// Service-status pill, reused by both list (MeterBlock) and grid
// (AssetGridCard) views. Deliberately plain `inline-flex` (not full-width) so
// the parent controls alignment: MeterBlock's centered container centers it,
// AssetGridCard's left-flowing card leaves it left-aligned -- same
// component, no layout variant needed. Colors come straight from the
// status-ok/status-warn/status-overdue classes (already set
// background+border+text together); "no-status" reuses InactiveBadge's
// muted convention since there's no fourth status color to invent.
function ScheduleStatusIndicator({ status, assetId }: { status?: AssetScheduleStatus; assetId: number }) {
  const info = status ?? { status: "no-status" as const };
  const pillClass =
    info.status === "overdue" ? "status-overdue"
    : info.status === "due-soon" ? "status-warn"
    : info.status === "ok" ? "status-ok"
    : "border-border bg-muted/60 text-muted-foreground";
  const dotClass =
    info.status === "overdue" ? "bg-[hsl(var(--status-overdue))]"
    : info.status === "due-soon" ? "bg-[hsl(var(--status-warn))]"
    : info.status === "ok" ? "bg-[hsl(var(--status-ok))]"
    : "bg-muted-foreground/60";
  const label =
    info.status === "overdue" ? `Overdue: ${info.scheduleName}`
    : info.status === "due-soon" ? `Due Soon: ${info.scheduleName}`
    : info.status === "ok" ? "Up to Date"
    : "No Status";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${pillClass}`}
      data-testid={`schedule-status-${assetId}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-muted/35 p-1" data-testid="toggle-asset-view-mode">
      <Button type="button" variant={value === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => onChange("list")} aria-label="List view" data-testid="button-assets-list-view">
        <List className="size-4" />
      </Button>
      <Button type="button" variant={value === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => onChange("grid")} aria-label="Grid view" data-testid="button-assets-grid-view">
        <LayoutGrid className="size-4" />
      </Button>
    </div>
  );
}

export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function CheckboxRow({ label, checked, onCheckedChange, testId }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; testId: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} data-testid={testId} />
      {label}
    </label>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/55 px-2 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={onRemove}>
      <X className="size-3" />
      {label}
    </button>
  );
}

function InactiveBadge({ reason }: { reason?: string | null }) {
  return (
    <Badge variant="outline" className="border-border bg-muted/60 text-[10px] tracking-wide text-muted-foreground">
      Inactive{reason ? ` · ${reason}` : ""}
    </Badge>
  );
}

function compareAssets(a: Asset, b: Asset, sortKey: SortKey, readings: Map<number, MeterReading>) {
  const name = a.friendlyName.localeCompare(b.friendlyName);
  const yearA = a.year ?? -Infinity;
  const yearB = b.year ?? -Infinity;
  const meterA = a.currentMeter ?? 0;
  const meterB = b.currentMeter ?? 0;
  const readingA = readings.get(a.id)?.readingDate ? new Date(readings.get(a.id)!.readingDate).getTime() : 0;
  const readingB = readings.get(b.id)?.readingDate ? new Date(readings.get(b.id)!.readingDate).getTime() : 0;
  const acquiredA = a.acquisitionDate ? new Date(a.acquisitionDate).getTime() : 0;
  const acquiredB = b.acquisitionDate ? new Date(b.acquisitionDate).getTime() : 0;
  switch (sortKey) {
    case "name-desc": return -name;
    case "year-desc": return yearB - yearA || name;
    case "year-asc": return yearA - yearB || name;
    case "type-asc": return a.assetType.localeCompare(b.assetType) || name;
    case "meter-desc": return meterB - meterA || name;
    case "meter-asc": return meterA - meterB || name;
    case "reading-desc": return readingB - readingA || name;
    case "reading-asc": return readingA - readingB || name;
    case "acquired-desc": return acquiredB - acquiredA || name;
    case "acquired-asc": return acquiredA - acquiredB || name;
    default: return name;
  }
}

function assetSubtitle(asset: Asset) {
  return [asset.year, asset.make, asset.model, asset.trim].filter(Boolean).join(" · ");
}

function hasMeterReading(asset: Asset, latestReading?: MeterReading) {
  return Boolean(latestReading) || Number(asset.currentMeter ?? 0) > 0;
}
