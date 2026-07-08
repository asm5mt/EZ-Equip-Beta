import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  LayoutGrid,
  ListOrdered,
  Pencil,
} from "lucide-react";
import type {
  Asset,
  MaintenanceSchedule,
  MaintenanceScheduleAssignment,
  ServiceEvent,
  ScheduleStatus,
} from "@shared/schema";
import { useAppContext } from "@/lib/app-context";
import {
  expandScheduleEvaluations,
  sortByUrgency,
  worstStatus,
  statusClass,
  statusLabel,
  type ScheduleAssetEval,
} from "@/lib/schedule";
import {
  scheduleIntervalSummary,
  meterIntervalSuffix,
} from "@/lib/format";

// ============================================================================
// Global Maintenance page
// ============================================================================

type ViewMode = "by-urgency" | "by-category";

const UNCATEGORIZED = "Uncategorized";

function normalizedCategory(c: string | null | undefined): string {
  const trimmed = (c ?? "").trim();
  if (!trimmed) return UNCATEGORIZED;
  // Title-case for grouping consistency: "engine" -> "Engine".
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export default function Maintenance() {
  const { fleet, canEdit } = useAppContext();
  const fleetId = fleet?.id;
  const assetsQ = useQuery<Asset[]>({ queryKey: ["/api/assets", { fleetId }], enabled: !!fleetId });
  const schedulesQ = useQuery<MaintenanceSchedule[]>({ queryKey: ["/api/schedules", { fleetId }], enabled: !!fleetId });
  const assignmentsQ = useQuery<MaintenanceScheduleAssignment[]>({ queryKey: ["/api/schedule-assignments", { fleetId }], enabled: !!fleetId });
  const eventsQ = useQuery<ServiceEvent[]>({ queryKey: ["/api/service-events", { fleetId }], enabled: !!fleetId });

  const [view, setView] = useState<ViewMode>("by-category");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const assets = assetsQ.data ?? [];
  const schedules = schedulesQ.data ?? [];
  const assignments = assignmentsQ.data ?? [];
  const events = eventsQ.data ?? [];

  const fleetAssetIds = useMemo(() => new Set(assets.map(a => a.id)), [assets]);
  const fleetEvents = useMemo(() => events.filter(e => fleetAssetIds.has(e.assetId)), [events, fleetAssetIds]);

  // Per-(schedule,asset) evaluations.
  const rows = useMemo(
    () => expandScheduleEvaluations(schedules, assignments, assets, fleetEvents),
    [schedules, assignments, assets, fleetEvents],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(normalizedCategory(r.schedule.category));
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const filteredRows = useMemo(
    () => categoryFilter === "all"
      ? rows
      : rows.filter(r => normalizedCategory(r.schedule.category) === categoryFilter),
    [rows, categoryFilter],
  );

  const overdue = rows.filter(r => r.evaluation.status === "overdue").length;
  const dueSoon = rows.filter(r => r.evaluation.status === "due-soon").length;
  const ok = rows.filter(r => r.evaluation.status === "ok" || r.evaluation.status === "no-history").length;

  return (
    <AppShell title="Maintenance" subtitle={fleet?.name}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-2">
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="button-back-dashboard">
                <ArrowLeft className="size-4 mr-1.5" /> Back
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground">Every active schedule across the fleet. Fleet Schedules and per-asset Asset Schedules.</p>
          </div>
          {canEdit && (
            <Link href="/maintenance/schedules/new">
              <Button size="sm" data-testid="button-new-fleet-schedule">
                <Plus className="size-4 mr-1.5" /> New Schedule
              </Button>
            </Link>
          )}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Overdue</div>
            <div className="text-2xl font-semibold num text-[hsl(var(--status-overdue))] mt-1" data-testid="text-stat-overdue">{overdue}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Due Soon</div>
            <div className="text-2xl font-semibold num text-[hsl(var(--status-warn))] mt-1" data-testid="text-stat-due-soon">{dueSoon}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">On Track</div>
            <div className="text-2xl font-semibold num text-[hsl(var(--status-ok))] mt-1" data-testid="text-stat-ok">{ok}</div>
          </Card>
        </div>

        {/* View toggle + filters */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-md border border-border overflow-hidden" data-testid="view-toggle">
            <Button
              type="button"
              variant={view === "by-category" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("by-category")}
              data-testid="toggle-by-category"
              className="rounded-none"
            >
              <LayoutGrid className="size-4 mr-1.5" /> By Category
            </Button>
            <Button
              type="button"
              variant={view === "by-urgency" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("by-urgency")}
              data-testid="toggle-by-urgency"
              className="rounded-none"
            >
              <ListOrdered className="size-4 mr-1.5" /> By Urgency
            </Button>
          </div>

          {view === "by-urgency" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Category</span>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 w-44" data-testid="select-category-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Body */}
        {(schedulesQ.isLoading || assetsQ.isLoading) && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!schedulesQ.isLoading && rows.length === 0 && (
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">No active schedules. Add a Fleet Schedule or open an asset to add an Asset Schedule.</p>
          </Card>
        )}

        {view === "by-urgency" && filteredRows.length > 0 && (
          <UrgencyList rows={sortByUrgency(filteredRows)} />
        )}
        {view === "by-category" && rows.length > 0 && (
          <CategoryView rows={rows} canEdit={canEdit} />
        )}
      </div>
    </AppShell>
  );
}

// ----------------------------------------------------------------------------
// By Urgency view
// ----------------------------------------------------------------------------

function UrgencyList({ rows }: { rows: ScheduleAssetEval[] }) {
  return (
    <Card className="p-4">
      <div className="grid gap-2">
        {rows.map(({ schedule, asset, evaluation }) => (
          <div
            key={`${schedule.id}-${asset.id}`}
            className="block p-3 rounded-md border border-border hover-elevate"
            data-testid={`row-maintenance-${schedule.id}-${asset.id}`}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{schedule.name}</span>
                  <ScopeBadge schedule={schedule} />
                  {schedule.category && (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{normalizedCategory(schedule.category)}</Badge>
                  )}
                </div>
                <Link
                  href={`/assets/${asset.id}`}
                  className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full border ${statusClass(evaluation.status)}`}
                  data-testid={`pill-asset-${asset.id}-${schedule.id}`}
                >
                  {asset.friendlyName}
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <RemainingSummary schedule={schedule} asset={asset} ev={evaluation} />
                <Badge variant="outline" className={`text-[10px] tracking-wide ${statusClass(evaluation.status)}`}>
                  {statusLabel(evaluation.status)}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// By Category view
// ----------------------------------------------------------------------------

function CategoryView({ rows, canEdit }: { rows: ScheduleAssetEval[]; canEdit: boolean }) {
  // Group by category -> by schedule, collecting per-asset evaluations.
  const groups = useMemo(() => {
    const byCategory = new Map<string, Map<number, { schedule: MaintenanceSchedule; entries: ScheduleAssetEval[] }>>();
    for (const r of rows) {
      const cat = normalizedCategory(r.schedule.category);
      if (!byCategory.has(cat)) byCategory.set(cat, new Map());
      const inner = byCategory.get(cat)!;
      if (!inner.has(r.schedule.id)) inner.set(r.schedule.id, { schedule: r.schedule, entries: [] });
      inner.get(r.schedule.id)!.entries.push(r);
    }
    return Array.from(byCategory.entries())
      .map(([cat, inner]) => ({
        category: cat,
        schedules: Array.from(inner.values()).sort((a, b) => a.schedule.name.localeCompare(b.schedule.name)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [rows]);

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <CategoryGroup key={g.category} group={g} canEdit={canEdit} />
      ))}
    </div>
  );
}

function CategoryGroup({ group, canEdit }: { group: { category: string; schedules: { schedule: MaintenanceSchedule; entries: ScheduleAssetEval[] }[] }; canEdit: boolean }) {
  const [open, setOpen] = useState(true);
  const totalSchedules = group.schedules.length;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-2 py-2 px-3 rounded-md border border-border bg-muted/30 hover:bg-muted/50 text-left"
          data-testid={`category-header-${group.category.toLowerCase()}`}
        >
          <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="font-semibold uppercase tracking-[0.14em] text-xs">{group.category}</span>
          <span className="text-xs text-muted-foreground">· {totalSchedules} {totalSchedules === 1 ? "schedule" : "schedules"}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-2">
        {group.schedules.map(({ schedule, entries }) => (
          <ScheduleCategoryCard
            key={schedule.id}
            schedule={schedule}
            entries={entries}
            canEdit={canEdit}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ScheduleCategoryCard({
  schedule,
  entries,
  canEdit,
}: {
  schedule: MaintenanceSchedule;
  entries: ScheduleAssetEval[];
  canEdit: boolean;
}) {
  const aggregate = worstStatus(entries.map(e => e.evaluation.status));
  const editHref = schedule.scope === "fleet"
    ? `/maintenance/schedules/${schedule.id}/edit`
    : (schedule.assetId ? `/assets/${schedule.assetId}/schedules/${schedule.id}/edit` : "#");
  const intervalSummary = scheduleIntervalSummary(schedule, entries[0]?.asset?.meterLabel ?? null);
  const meterBasis = schedule.readingType ?? "mileage";
  const meterBasisSuffix = meterIntervalSuffix(meterBasis, entries[0]?.asset?.meterLabel ?? null);

  return (
    <Card className="p-4 group" data-testid={`card-schedule-${schedule.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{schedule.name}</span>
            <ScopeBadge schedule={schedule} />
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide" data-testid={`meter-basis-${schedule.id}`}>
              {meterBasis === "count" ? "Count" : meterBasis === "hours" ? "Hours" : meterBasis === "kilometers" ? "Kilometers" : "Mileage"}
              {meterBasisSuffix ? ` · ${meterBasisSuffix}` : ""}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1 num" data-testid={`interval-summary-${schedule.id}`}>
            {intervalSummary}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] tracking-wide ${statusClass(aggregate)}`} data-testid={`aggregate-status-${schedule.id}`}>
            {statusLabel(aggregate)}
          </Badge>
          {canEdit && (
            <Link href={editHref}>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                aria-label="Edit schedule"
                data-testid={`button-edit-schedule-${schedule.id}`}
              >
                <Pencil className="size-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Asset pills */}
      <div className="mt-3 flex flex-wrap gap-1.5" data-testid={`asset-pills-${schedule.id}`}>
        {entries.map(({ asset, evaluation }) => (
          <Link
            key={asset.id}
            href={`/assets/${asset.id}`}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${statusClass(evaluation.status)}`}
            data-testid={`asset-pill-${schedule.id}-${asset.id}`}
            title={`${statusLabel(evaluation.status)} — ${asset.friendlyName}`}
          >
            {asset.friendlyName}
          </Link>
        ))}
        {entries.length === 0 && (
          <span className="text-xs text-muted-foreground">No assignments</span>
        )}
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

export function ScopeBadge({ schedule }: { schedule: MaintenanceSchedule }) {
  if (schedule.scope === "fleet") {
    return (
      <Badge variant="outline" className="text-[10px] tracking-wide bg-[hsl(var(--primary)/0.10)] border-[hsl(var(--primary)/0.30)] text-[hsl(var(--primary))]" data-testid={`badge-fleet-${schedule.id}`}>
        Fleet Schedule
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] tracking-wide" data-testid={`badge-custom-${schedule.id}`}>
      Asset Schedule
    </Badge>
  );
}

function RemainingSummary({ schedule, asset, ev }: { schedule: MaintenanceSchedule; asset: Asset; ev: ScheduleAssetEval["evaluation"] }) {
  const suffix = meterIntervalSuffix(schedule.readingType ?? asset.meterType, asset.meterLabel);
  return (
    <div className="text-right text-xs text-muted-foreground space-y-0.5">
      {ev.remainingMeter != null && (
        <div className="num">
          {ev.remainingMeter > 0
            ? <>{formatCommas(ev.remainingMeter)} {suffix} remain</>
            : <>{formatCommas(Math.abs(ev.remainingMeter))} {suffix} over</>}
        </div>
      )}
      {ev.remainingDays != null && (
        <div className="num">
          {ev.remainingDays > 0
            ? <>{formatCommas(ev.remainingDays)} days remain</>
            : <>{formatCommas(Math.abs(ev.remainingDays))} days over</>}
        </div>
      )}
    </div>
  );
}

function formatCommas(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

// Re-export to satisfy tsc when imports include types it doesn't see.
export type { ScheduleStatus };
