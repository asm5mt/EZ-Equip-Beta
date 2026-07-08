import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ServiceEvent, Asset } from "@shared/schema";
import { useAppContext } from "@/lib/app-context";
import { formatDate, formatNumber, formatCurrency, meterUnitLabel } from "@/lib/format";
import { ArrowLeft, Pencil } from "lucide-react";

export default function Events() {
  const { fleet, canEdit } = useAppContext();
  const fleetCurrency = fleet?.currency ?? "USD";
  const fleetId = fleet?.id;
  const assetsQ = useQuery<Asset[]>({ queryKey: ["/api/assets", { fleetId }], enabled: !!fleetId });
  const eventsQ = useQuery<ServiceEvent[]>({ queryKey: ["/api/service-events", { fleetId }], enabled: !!fleetId });

  const assetsById = useMemo(() => new Map((assetsQ.data ?? []).map(a => [a.id, a])), [assetsQ.data]);
  const fleetAssetIds = new Set((assetsQ.data ?? []).map(a => a.id));
  const events = (eventsQ.data ?? [])
    .filter(e => fleetAssetIds.has(e.assetId))
    .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());

  return (
    <AppShell title="Service Events" subtitle={fleet?.name}>
      <div className="space-y-6">
        <div className="space-y-2">
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="button-back-dashboard">
              <ArrowLeft className="size-4 mr-1.5" /> Back
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground">Every recorded service, inspection, and repair across the fleet.</p>
        </div>

        <Card className="p-5">
          {eventsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!eventsQ.isLoading && events.length === 0 && (
            <p className="text-sm text-muted-foreground">No service events yet. Log one from the asset detail page or Quick Add.</p>
          )}
          <div className="grid gap-3">
            {events.map(e => {
              const a = assetsById.get(e.assetId);
              return (
                <div
                  key={e.id}
                  className="p-4 rounded-md border border-border"
                  data-testid={`row-event-${e.id}`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{e.title}</span>
                        <Badge variant="outline" className="text-[10px] tracking-wide">
                          {e.eventType}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {a ? (
                          <Link href={`/assets/${a.id}`} className="hover:underline" data-testid={`link-event-asset-${e.id}`}>{a.friendlyName}</Link>
                        ) : "Unknown asset"}
                        {e.vendor && <> &bull; {e.vendor}</>}
                        {e.technician && <> &bull; {e.technician}</>}
                      </div>
                      {e.notes && <div className="text-xs text-muted-foreground mt-2 max-w-2xl">{e.notes}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-sm num">{formatDate(e.performedAt)}</div>
                      {e.meterAtService != null && a && (
                        <div className="text-xs text-muted-foreground num mt-0.5">
                          {formatNumber(e.meterAtService)} {meterUnitLabel(a.meterType, a.meterLabel)}
                        </div>
                      )}
                      {e.cost != null && (
                        <div className="text-sm font-semibold num mt-1">{formatCurrency(e.cost, fleetCurrency)}</div>
                      )}
                      {canEdit ? (
                        <Link href={`/events/${e.id}/edit`}>
                          <Button variant="ghost" size="sm" className="mt-2" data-testid={`button-edit-event-${e.id}`}>
                            <Pencil className="size-4 mr-1.5" /> Edit
                          </Button>
                        </Link>
                      ) : (
                        <Button variant="ghost" size="sm" disabled className="mt-2" data-testid={`button-edit-event-${e.id}`}>
                          <Pencil className="size-4 mr-1.5" /> Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
