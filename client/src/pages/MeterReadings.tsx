import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MeterReading, Asset } from "@shared/schema";
import { useAppContext } from "@/lib/app-context";
import { formatDate, formatNumber, meterUnitLabel } from "@/lib/format";
import { ArrowLeft } from "lucide-react";

export default function MeterReadings() {
  const { fleet } = useAppContext();
  const [location] = useLocation();
  const fleetId = fleet?.id;
  const selectedAssetId = Number(new URLSearchParams(location.split("?")[1] ?? "").get("assetId") ?? 0) || null;
  const assetsQ = useQuery<Asset[]>({ queryKey: ["/api/assets", { fleetId }], enabled: !!fleetId });
  const readingsQ = useQuery<MeterReading[]>({ queryKey: ["/api/meter-readings"] });

  const assetsById = useMemo(() => new Map((assetsQ.data ?? []).map(a => [a.id, a])), [assetsQ.data]);
  const fleetAssetIds = new Set((assetsQ.data ?? []).map(a => a.id));
  const readings = (readingsQ.data ?? [])
    .filter(r => fleetAssetIds.has(r.assetId))
    .filter(r => selectedAssetId ? r.assetId === selectedAssetId : true);
  const selectedAsset = selectedAssetId ? assetsById.get(selectedAssetId) : null;

  return (
    <AppShell title="Meter Readings" subtitle="Date plus mileage, hours, count, or custom meter records">
      <div className="space-y-6">
        <div className="flex items-center justify-start">
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="button-back-dashboard">
              <ArrowLeft className="size-4 mr-1.5" /> Back
            </Button>
          </Link>
        </div>

        <Card className="p-5">
          {selectedAsset && (
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Filtered Asset</div>
                <div className="font-medium">{selectedAsset.friendlyName}</div>
              </div>
              <Link href="/meter-readings" className="text-sm text-[hsl(var(--primary))] hover:underline" data-testid="link-clear-meter-filter">Show all</Link>
            </div>
          )}
          {readings.length === 0 && <p className="text-sm text-muted-foreground">No meter readings yet.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">Date</th>
                  <th className="py-2 pr-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">Asset</th>
                  <th className="py-2 pr-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">Type</th>
                  <th className="py-2 pr-4 text-right text-xs uppercase tracking-[0.16em] text-muted-foreground">Value</th>
                  <th className="py-2 pr-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">Source</th>
                  <th className="py-2 pr-0 text-xs uppercase tracking-[0.16em] text-muted-foreground">Notes</th>
                </tr>
              </thead>
              <tbody>
                {readings.map(r => {
                  const a = assetsById.get(r.assetId);
                  return (
                    <tr key={r.id} className="border-b border-border last:border-b-0" data-testid={`row-meter-${r.id}`}>
                      <td className="py-2 pr-4 num">{formatDate(r.readingDate)}</td>
                      <td className="py-2 pr-4">{a ? <Link href={`/assets/${a.id}`} className="hover:underline">{a.friendlyName}</Link> : "—"}</td>
                      <td className="py-2 pr-4 text-xs uppercase tracking-wider text-muted-foreground">{r.readingType}</td>
                      <td className="py-2 pr-4 text-right num">{formatNumber(r.value)} <span className="text-xs text-muted-foreground">{meterUnitLabel(r.readingType, a?.meterLabel)}</span></td>
                      <td className="py-2 pr-4 text-xs uppercase tracking-wider text-muted-foreground">{r.source}</td>
                      <td className="py-2 pr-0 text-xs text-muted-foreground">{r.notes ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
