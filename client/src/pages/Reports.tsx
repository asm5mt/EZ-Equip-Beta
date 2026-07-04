import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, FileText, ClipboardList, Boxes, Wrench } from "lucide-react";
import { useAppContext } from "@/lib/app-context";
import { formatCurrency, formatDate, formatNumber, meterUnitLabel } from "@/lib/format";
import type { Asset, InventoryItem, MaintenanceSchedule, ServiceEvent } from "@shared/schema";

type ReportType = "fleet-health" | "service-history" | "maintenance-due" | "inventory-reorder";

const REPORTS: Array<{ id: ReportType; label: string; description: string }> = [
  { id: "fleet-health", label: "Fleet Health Summary", description: "Best for a one-page overview of active assets, meters, recent service, and reorder alerts." },
  { id: "service-history", label: "Asset Service History", description: "Best for printing a chronological maintenance record for a vehicle or piece of equipment." },
  { id: "maintenance-due", label: "Maintenance Due List", description: "Best for a shop work queue grouped around upcoming intervals and open schedules." },
  { id: "inventory-reorder", label: "Inventory Reorder Sheet", description: "Best for a parts run: items with active reorder alerts and suggested quantities." },
];

export default function Reports() {
  const { fleet } = useAppContext();
  const [reportType, setReportType] = useState<ReportType>("fleet-health");
  const fleetCurrency = fleet?.currency ?? "USD";

  const assetsQ = useQuery<Asset[]>({ queryKey: ["/api/assets", { fleetId: fleet?.id }], enabled: !!fleet });
  const eventsQ = useQuery<ServiceEvent[]>({ queryKey: ["/api/service-events"] });
  const inventoryQ = useQuery<InventoryItem[]>({ queryKey: ["/api/inventory-items", { fleetId: fleet?.id }], enabled: !!fleet });
  const schedulesQ = useQuery<MaintenanceSchedule[]>({ queryKey: ["/api/schedules"] });

  const assets = assetsQ.data ?? [];
  const events = eventsQ.data ?? [];
  const inventory = inventoryQ.data ?? [];
  const schedules = schedulesQ.data ?? [];
  const reorderAlerts = inventory.filter(i => i.reorderReminder && i.reorderPoint != null && i.onHand < i.reorderPoint);
  const recentEvents = useMemo(() => [...events].sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()).slice(0, 12), [events]);

  return (
    <AppShell title="Reports" subtitle="Printable fleet summaries, service histories, maintenance queues, and reorder sheets">
      <div className="space-y-6 print:space-y-4">
        <div className="flex items-center justify-start print:hidden">
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="button-back-dashboard">
              <ArrowLeft className="size-4 mr-1.5" /> Back
            </Button>
          </Link>
        </div>

        <Card className="p-5 print:hidden">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="max-w-2xl">
              <h3 className="font-semibold">Report Builder</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Start with print-optimized HTML reports so they can be previewed, filtered, and printed to paper or PDF from the browser.
              </p>
            </div>
            <Button onClick={() => window.print()} data-testid="button-print-report">
              <Printer className="size-4 mr-1.5" /> Print / Save PDF
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 mt-5">
            <div>
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={v => setReportType(v as ReportType)}>
                <SelectTrigger data-testid="select-report-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORTS.map(report => <SelectItem key={report.id} value={report.id}>{report.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REPORTS.map(report => (
                <div key={report.id} className={`rounded-md border border-border p-3 ${reportType === report.id ? "bg-[hsl(var(--primary)/0.08)]" : ""}`}>
                  <div className="text-sm font-medium">{report.label}</div>
                  <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <section className="print:bg-white print:text-black" data-testid="section-printable-report">
          <div className="mb-5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground print:text-gray-600">EZ-EQUIP Report</div>
            <h2 className="text-xl font-semibold tracking-tight">{REPORTS.find(r => r.id === reportType)?.label}</h2>
            <p className="text-sm text-muted-foreground print:text-gray-600">{fleet?.name ?? "Fleet"} · Generated {formatDate(new Date())}</p>
          </div>

          {reportType === "fleet-health" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Kpi icon={FileText} label="Assets" value={formatNumber(assets.length)} />
                <Kpi icon={Wrench} label="Schedules" value={formatNumber(schedules.length)} />
                <Kpi icon={ClipboardList} label="Recent Services" value={formatNumber(events.length)} />
                <Kpi icon={Boxes} label="Reorder Alerts" value={formatNumber(reorderAlerts.length)} />
              </div>
              <ReportCard title="Asset Register">
                <ReportTable headers={["Asset", "Type", "Meter", "As Of", "Status"]}>
                  {assets.map(asset => (
                    <tr key={asset.id}>
                      <td>{asset.friendlyName}</td>
                      <td>{asset.assetType}</td>
                      <td className="num">{formatNumber(asset.currentMeter)} {meterUnitLabel(asset.meterType, asset.meterLabel)}</td>
                      <td>{formatDate(asset.meterAsOf)}</td>
                      <td>{asset.status}</td>
                    </tr>
                  ))}
                </ReportTable>
              </ReportCard>
              <ReportCard title="Recent Service">
                <ReportTable headers={["Date", "Asset", "Service", "Meter", "Cost"]}>
                  {recentEvents.map(event => {
                    const asset = assets.find(a => a.id === event.assetId);
                    return (
                      <tr key={event.id}>
                        <td>{formatDate(event.performedAt)}</td>
                        <td>{asset?.friendlyName ?? `Asset #${event.assetId}`}</td>
                        <td>{event.title}</td>
                        <td className="num">{formatNumber(event.meterAtService)}</td>
                        <td className="num">{formatCurrency(event.cost, fleetCurrency)}</td>
                      </tr>
                    );
                  })}
                </ReportTable>
              </ReportCard>
            </div>
          )}

          {reportType === "service-history" && (
            <ReportCard title="Service Event History">
              <ReportTable headers={["Date", "Asset", "Type", "Title", "Vendor", "Technician", "Cost", "Notes"]}>
                {events.map(event => {
                  const asset = assets.find(a => a.id === event.assetId);
                  return (
                    <tr key={event.id}>
                      <td>{formatDate(event.performedAt)}</td>
                      <td>{asset?.friendlyName ?? `Asset #${event.assetId}`}</td>
                      <td>{event.eventType}</td>
                      <td>{event.title}</td>
                      <td>{event.vendor ?? "—"}</td>
                      <td>{event.technician ?? "—"}</td>
                      <td className="num">{formatCurrency(event.cost, fleetCurrency)}</td>
                      <td>{event.notes ?? "—"}</td>
                    </tr>
                  );
                })}
              </ReportTable>
            </ReportCard>
          )}

          {reportType === "maintenance-due" && (
            <ReportCard title="Maintenance Schedule Queue">
              <ReportTable headers={["Asset", "Schedule", "Category", "Meter Interval", "Day Interval", "Due Soon Threshold", "Active"]}>
                {schedules.map(schedule => {
                  const asset = assets.find(a => a.id === schedule.assetId);
                  return (
                    <tr key={schedule.id}>
                      <td>{asset?.friendlyName ?? `Asset #${schedule.assetId}`}</td>
                      <td>{schedule.name}</td>
                      <td>{schedule.category ?? "—"}</td>
                      <td className="num">{formatNumber(schedule.meterInterval)} {schedule.readingType}</td>
                      <td className="num">{schedule.dayInterval ? `${formatNumber(schedule.dayInterval)} days` : "—"}</td>
                      <td>{schedule.meterDueSoon ? `${formatNumber(schedule.meterDueSoon)} ${schedule.readingType}` : schedule.dayDueSoon ? `${formatNumber(schedule.dayDueSoon)} days` : "—"}</td>
                      <td>{schedule.active ? "Yes" : "No"}</td>
                    </tr>
                  );
                })}
              </ReportTable>
            </ReportCard>
          )}

          {reportType === "inventory-reorder" && (
            <ReportCard title="Inventory Reorder Alert Sheet">
              <ReportTable headers={["Item", "Category", "On Hand", "Reorder Alert Quantity", "Reorder Quantity", "Part / SKU", "Status"]}>
                {reorderAlerts.map(item => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.category ?? "—"}</td>
                    <td className="num">{formatNumber(item.onHand, { maximumFractionDigits: 2 })} {item.unit}</td>
                    <td className="num">{formatNumber(item.reorderPoint, { maximumFractionDigits: 2 })} {item.unit}</td>
                    <td className="num">{formatNumber(item.reorderQuantity, { maximumFractionDigits: 2 })} {item.unit}</td>
                    <td>{item.partNumber ?? item.sku ?? "—"}</td>
                    <td><Badge variant="outline">Reorder</Badge></td>
                  </tr>
                ))}
              </ReportTable>
            </ReportCard>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold num mt-1">{value}</div>
        </div>
        <Icon className="size-5 text-[hsl(var(--primary))]" />
      </div>
    </Card>
  );
}

function ReportCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5 print:border print:border-gray-300 print:shadow-none print:break-inside-avoid">
      <h3 className="font-semibold mb-3">{title}</h3>
      {children}
    </Card>
  );
}

function ReportTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm report-table">
        <thead>
          <tr>
            {headers.map(header => <th key={header} className="text-left font-medium text-muted-foreground border-b border-border py-2 pr-3">{header}</th>)}
          </tr>
        </thead>
        <tbody className="[&_td]:py-2 [&_td]:pr-3 [&_td]:border-b [&_td]:border-border/70">
          {children}
        </tbody>
      </table>
    </div>
  );
}
