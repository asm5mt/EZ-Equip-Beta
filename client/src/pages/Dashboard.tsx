import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/lib/app-context";
import { expandScheduleEvaluations, statusClass, statusLabel } from "@/lib/schedule";
import { formatDate, formatNumber, meterUnitLabel } from "@/lib/format";
import type { Asset, MaintenanceSchedule, MaintenanceScheduleAssignment, ServiceEvent, InventoryItem } from "@shared/schema";

export default function Dashboard() {
  const { fleet } = useAppContext();
  const fleetId = fleet?.id;

  const assetsQ = useQuery<Asset[]>({
    queryKey: ["/api/assets", { fleetId }],
    enabled: !!fleetId,
  });
  const schedulesQ = useQuery<MaintenanceSchedule[]>({ queryKey: ["/api/schedules", { fleetId }], enabled: !!fleetId });
  const assignmentsQ = useQuery<MaintenanceScheduleAssignment[]>({ queryKey: ["/api/schedule-assignments", { fleetId }], enabled: !!fleetId });
  const eventsQ = useQuery<ServiceEvent[]>({ queryKey: ["/api/service-events", { fleetId }], enabled: !!fleetId });
  const inventoryQ = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items", { fleetId }],
    enabled: !!fleetId,
  });

  const assets = assetsQ.data ?? [];
  const schedules = schedulesQ.data ?? [];
  const assignments = assignmentsQ.data ?? [];
  const events = eventsQ.data ?? [];
  const inventory = inventoryQ.data ?? [];

  const assetsById = useMemo(() => new Map(assets.map(a => [a.id, a])), [assets]);
  const fleetAssetIds = useMemo(() => new Set(assets.map(a => a.id)), [assets]);
  const fleetEvents = useMemo(() => events.filter(e => fleetAssetIds.has(e.assetId)), [events, fleetAssetIds]);

  const evaluations = useMemo(
    () => expandScheduleEvaluations(schedules, assignments, assets, fleetEvents)
      .map(r => ({ schedule: r.schedule, asset: r.asset, eval: r.evaluation })),
    [schedules, assignments, assets, fleetEvents],
  );

  const dueSoon = evaluations.filter(e => e.eval.status === "due-soon");
  const overdue = evaluations.filter(e => e.eval.status === "overdue");

  const reorderAlerts = inventory.filter(i => i.reorderReminder && i.reorderPoint != null && i.onHand < i.reorderPoint);

  const upcoming = [...overdue, ...dueSoon].slice(0, 6);

  const recent = [...fleetEvents]
    .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime())
    .slice(0, 5);

  return (
    <AppShell title="Dashboard" subtitle="Overview of assets, maintenance, and inventory status">
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI label="Active Assets" value={assets.filter(a => a.status === "active").length} testid="kpi-active-assets" />
          <KPI label="Due Soon" value={dueSoon.length} tone="warn" testid="kpi-due-soon" />
          <KPI label="Overdue" value={overdue.length} tone="overdue" testid="kpi-overdue" />
          <KPI label="Reorder Alerts" value={reorderAlerts.length} tone={reorderAlerts.length ? "warn" : "ok"} testid="kpi-low-stock" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3">Upcoming Maintenance</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">All schedules are on track.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map(({ schedule, asset, eval: ev }) => (
                  <Link key={schedule.id} href={`/assets/${asset.id}`} className="block p-3 rounded-md border border-border hover-elevate" data-testid={`upcoming-${schedule.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{schedule.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{asset.friendlyName}</div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] tracking-wide ${statusClass(ev.status)}`}>
                          {statusLabel(ev.status)}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground num">
                        {ev.remainingMeter != null && (
                          <span>{ev.remainingMeter <= 0 ? `Over by ${formatNumber(Math.abs(ev.remainingMeter))} ${meterUnitLabel(asset.meterType, asset.meterLabel)}` : `${formatNumber(ev.remainingMeter)} ${meterUnitLabel(asset.meterType, asset.meterLabel)} remaining`}</span>
                        )}
                        {ev.remainingMeter != null && ev.remainingDays != null && <span> · </span>}
                        {ev.remainingDays != null && (
                          <span>{ev.remainingDays <= 0 ? `${Math.abs(ev.remainingDays)} days late` : `${ev.remainingDays} days remaining`}</span>
                        )}
                      </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">Recent Activity</h3>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Recent service and meter activity will appear here.</p>
            ) : (
              <ul className="space-y-3">
                {recent.map(e => (
                  <li key={e.id} className="text-sm border-b border-border last:border-b-0 pb-2 last:pb-0" data-testid={`recent-event-${e.id}`}>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {assetsById.get(e.assetId)?.friendlyName ?? "Unknown asset"} · {formatDate(e.performedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">Inventory Reorder Alerts</h3>
            {reorderAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reorder alerts.</p>
            ) : (
              <ul className="space-y-3">
                {reorderAlerts.map(i => (
                  <li key={i.id} className="text-sm" data-testid={`lowstock-${i.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{i.name}</span>
                      <span className="num text-xs text-muted-foreground">{formatNumber(i.onHand)} {i.unit}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Reorder when below {formatNumber(i.reorderPoint)} {i.unit}{i.reorderQuantity != null ? ` · buy ${formatNumber(i.reorderQuantity)} ${i.unit}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function KPI({ label, value, tone = "default", testid }: { label: string; value: number; tone?: "default" | "ok" | "warn" | "overdue"; testid: string }) {
  const color =
    tone === "warn" ? "text-[hsl(var(--status-warn))]"
    : tone === "overdue" ? "text-[hsl(var(--status-overdue))]"
    : tone === "ok" ? "text-[hsl(var(--status-ok))]"
    : "text-foreground";
  return (
    <Card className="p-5" data-testid={testid}>
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-3 text-3xl font-semibold num ${color}`}>{formatNumber(value)}</div>
    </Card>
  );
}
