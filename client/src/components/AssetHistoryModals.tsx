import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { API_BASE, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Car,
  ChevronDown,
  Download,
  Edit,
  FileSpreadsheet,
  FileText,
  Filter,
  Gauge,
  LineChart as LineChartIcon,
  Package,
  Printer,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Asset, FleetFuelType, MeterReading, ServiceEvent, ServiceLineItem } from "@shared/schema";
import { formatDate, formatNumber, meterFullLabel, meterUnitLabel } from "@/lib/format";
import { assetTypeBadgeClass, tintedBadgeStyle } from "@/lib/badges";
import { EquipmentTypeIcon, normalizeEquipmentIcon } from "@/lib/equipment-icons";
import { FuelTypeIcon, fuelTypeByName, tintedFuelStyle } from "@/lib/fuel-types";
import type { FleetEquipmentType } from "@shared/schema";

// ---------------------------------------------------------------------------
// Filter primitives shared between snapshot cards and full-history modals
// ---------------------------------------------------------------------------

export type DateRangeOption =
  | "30d"
  | "60d"
  | "90d"
  | "6m"
  | "12m"
  | "all"
  | "custom";

const DATE_RANGE_LABELS: Record<DateRangeOption, string> = {
  "30d": "Last 30 Days",
  "60d": "Last 60 Days",
  "90d": "Last 90 Days",
  "6m": "Last 6 Months",
  "12m": "Last 12 Months",
  all: "All Time",
  custom: "Custom Range",
};

const DATE_RANGE_ORDER: DateRangeOption[] = ["30d", "60d", "90d", "6m", "12m", "all", "custom"];

export function dateRangeStart(option: DateRangeOption, now = new Date()): Date | null {
  const d = new Date(now);
  switch (option) {
    case "30d": d.setDate(d.getDate() - 30); return d;
    case "60d": d.setDate(d.getDate() - 60); return d;
    case "90d": d.setDate(d.getDate() - 90); return d;
    case "6m": d.setMonth(d.getMonth() - 6); return d;
    case "12m": d.setMonth(d.getMonth() - 12); return d;
    case "all":
    case "custom":
    default:
      return null;
  }
}

function withinRange(d: Date | string | number, start: Date | null, end: Date | null): boolean {
  const t = (d instanceof Date ? d : new Date(d)).getTime();
  if (Number.isNaN(t)) return false;
  if (start && t < start.getTime()) return false;
  if (end) {
    const ee = new Date(end);
    ee.setHours(23, 59, 59, 999);
    if (t > ee.getTime()) return false;
  }
  return true;
}

export type DateRangeState = {
  option: DateRangeOption;
  customStart: string;
  customEnd: string;
};

export function defaultRange(): DateRangeState {
  return { option: "all", customStart: "", customEnd: "" };
}

export function resolveRange(state: DateRangeState): { start: Date | null; end: Date | null } {
  if (state.option === "custom") {
    return {
      start: state.customStart ? new Date(state.customStart) : null,
      end: state.customEnd ? new Date(state.customEnd) : null,
    };
  }
  return { start: dateRangeStart(state.option), end: null };
}

type DateRangeFilterProps = {
  value: DateRangeState;
  onChange: (next: DateRangeState) => void;
  testIdPrefix: string;
  compact?: boolean;
};

/**
 * Date range filter. Collapses to an icon-only funnel button under ~768px.
 */
export function DateRangeFilter({ value, onChange, testIdPrefix }: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.option}
        onValueChange={(v) => onChange({ ...value, option: v as DateRangeOption })}
      >
        <SelectTrigger
          className="h-11 sm:h-8 w-11 sm:w-[170px] text-xs justify-center sm:justify-start px-2 sm:px-3 [&>svg:last-child]:hidden sm:[&>svg:last-child]:inline-flex"
          data-testid={`${testIdPrefix}-range-trigger`}
          aria-label={`Date range: ${DATE_RANGE_LABELS[value.option]}`}
          title={`Date range: ${DATE_RANGE_LABELS[value.option]}`}
        >
          <Filter className="size-4 sm:size-3.5 text-muted-foreground sm:mr-1.5" />
          <span className="hidden sm:inline-flex"><SelectValue placeholder="Date range" /></span>
        </SelectTrigger>
        <SelectContent>
          {DATE_RANGE_ORDER.map((opt) => (
            <SelectItem key={opt} value={opt} data-testid={`${testIdPrefix}-range-option-${opt}`}>
              {DATE_RANGE_LABELS[opt]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.option === "custom" && (
        <div className="flex items-center gap-1.5" data-testid={`${testIdPrefix}-range-custom`}>
          <Input
            type="date"
            value={value.customStart}
            onChange={(e) => onChange({ ...value, customStart: e.target.value })}
            className="h-8 w-[140px] text-xs"
            data-testid={`${testIdPrefix}-range-start`}
            aria-label="Start date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={value.customEnd}
            onChange={(e) => onChange({ ...value, customEnd: e.target.value })}
            className="h-8 w-[140px] text-xs"
            data-testid={`${testIdPrefix}-range-end`}
            aria-label="End date"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meter "By Mileage" filter (also handles hours / counts using sensible labels)
// ---------------------------------------------------------------------------

export type MeterFilterMode = "date" | "meter";

export type MeterWindowOption = "5k" | "10k" | "25k";

const METER_WINDOW_VALUES: Record<MeterWindowOption, number> = {
  "5k": 5000,
  "10k": 10000,
  "25k": 25000,
};

function meterWindowLabel(option: MeterWindowOption, unit: string) {
  return `Last ${formatNumber(METER_WINDOW_VALUES[option])} ${unit}`;
}

type MeterFilterControlsProps = {
  mode: MeterFilterMode;
  onModeChange: (mode: MeterFilterMode) => void;
  range: DateRangeState;
  onRangeChange: (range: DateRangeState) => void;
  meterWindow: MeterWindowOption;
  onMeterWindowChange: (option: MeterWindowOption) => void;
  unitLabel: string;
  testIdPrefix: string;
};

export function MeterFilterControls(props: MeterFilterControlsProps) {
  const { mode, onModeChange, range, onRangeChange, meterWindow, onMeterWindowChange, unitLabel, testIdPrefix } = props;
  const unitShort = unitLabel ? capitalize(unitLabel).slice(0, 2) : "Mi";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-[11px]"
        role="tablist"
        aria-label="Meter history filter mode"
        data-testid={`${testIdPrefix}-mode-toggle`}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "date"}
          className={`px-2.5 py-1 rounded-sm transition-colors ${mode === "date" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => onModeChange("date")}
          data-testid={`${testIdPrefix}-mode-date`}
        >
          By Date
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "meter"}
          className={`px-2.5 py-1 rounded-sm transition-colors ${mode === "meter" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => onModeChange("meter")}
          data-testid={`${testIdPrefix}-mode-meter`}
          aria-label={`By ${capitalize(unitLabel)}`}
          title={`By ${capitalize(unitLabel)}`}
        >
          <span className="hidden sm:inline">By {capitalize(unitLabel)}</span>
          <span className="sm:hidden">By {unitShort}</span>
        </button>
      </div>
      {mode === "date" ? (
        <DateRangeFilter value={range} onChange={onRangeChange} testIdPrefix={testIdPrefix} />
      ) : (
        <Select value={meterWindow} onValueChange={(v) => onMeterWindowChange(v as MeterWindowOption)}>
          <SelectTrigger
            className="h-11 sm:h-8 w-11 sm:w-[170px] text-xs justify-center sm:justify-start px-2 sm:px-3 [&>svg:last-child]:hidden sm:[&>svg:last-child]:inline-flex"
            data-testid={`${testIdPrefix}-meter-window-trigger`}
            aria-label={`Meter window: ${meterWindowLabel(meterWindow, unitLabel)}`}
            title={`Meter window: ${meterWindowLabel(meterWindow, unitLabel)}`}
          >
            <Gauge className="size-4 sm:size-3.5 text-muted-foreground sm:mr-1.5" />
            <span className="hidden sm:inline-flex"><SelectValue /></span>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(METER_WINDOW_VALUES) as MeterWindowOption[]).map((opt) => (
              <SelectItem key={opt} value={opt} data-testid={`${testIdPrefix}-meter-window-${opt}`}>
                {meterWindowLabel(opt, unitLabel)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

export function filterEventsByRange(events: ServiceEvent[], range: DateRangeState): ServiceEvent[] {
  const { start, end } = resolveRange(range);
  if (!start && !end) return events.slice();
  return events.filter((e) => withinRange(e.performedAt, start, end));
}

export function filterReadingsByRange(readings: MeterReading[], range: DateRangeState): MeterReading[] {
  const { start, end } = resolveRange(range);
  if (!start && !end) return readings.slice();
  return readings.filter((r) => withinRange(r.readingDate, start, end));
}

export function filterReadingsByMeterWindow(
  readings: MeterReading[],
  currentMeter: number | null | undefined,
  window: MeterWindowOption,
): MeterReading[] {
  const cur = currentMeter ?? readings.reduce((max, r) => Math.max(max, r.value ?? 0), 0);
  const min = cur - METER_WINDOW_VALUES[window];
  return readings.filter((r) => (r.value ?? 0) >= min);
}

// ---------------------------------------------------------------------------
// Asset header summary — mirrors the asset detail page header styling
// ---------------------------------------------------------------------------

type AssetHistorySummaryProps = {
  asset: Asset;
  configuredType?: FleetEquipmentType;
  fuelTypes: FleetFuelType[];
  vinFeaturesEnabled?: boolean;
};

export function AssetHistorySummary({ asset, configuredType, fuelTypes, vinFeaturesEnabled }: AssetHistorySummaryProps) {
  const pills = buildPillData(asset, fuelTypes);
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-4 items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold tracking-tight" data-testid="text-history-asset-name">
              {asset.friendlyName}
            </h2>
            <Badge
              variant="outline"
              className={`inline-flex items-center gap-1.5 text-[10px] tracking-wide ${configuredType ? "" : assetTypeBadgeClass(asset.assetType)}`}
              style={configuredType ? tintedBadgeStyle(configuredType.color) : undefined}
            >
              <EquipmentTypeIcon icon={configuredType?.icon ?? normalizeEquipmentIcon(asset.assetType)} className="size-3" />
              {asset.assetType}
            </Badge>
          </div>
          {vinFeaturesEnabled && (asset.year || asset.make || asset.model || asset.trim) && (
            <div className="mt-0.5 text-sm font-medium">
              {[asset.year, asset.make, asset.model, asset.trim].filter(Boolean).join(" ")}
            </div>
          )}
          {pills.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pills.map((pill) => (
                <span
                  key={pill.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/45 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  style={pill.style}
                  data-testid={`history-pill-${pill.key}`}
                >
                  {pill.icon}
                  {pill.label}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {vinFeaturesEnabled && asset.vin && (
              <span>
                <span className="text-[10px] uppercase tracking-[0.16em] mr-1">VIN</span>
                <span className="font-mono tracking-[0.10em] text-foreground">{asset.vin}</span>
              </span>
            )}
            {asset.serial && (
              <span>
                <span className="text-[10px] uppercase tracking-[0.16em] mr-1">Serial</span>
                <span className="font-mono text-foreground">{asset.serial}</span>
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md border border-[hsl(var(--primary)/0.32)] bg-gradient-to-br from-[hsl(var(--primary)/0.10)] to-[hsl(var(--card))] px-3 py-2 min-w-[12rem]">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground leading-tight">
              Current {meterFullLabel(asset.meterType, asset.meterLabel)}
            </div>
            <Gauge className="size-4 text-[hsl(var(--primary))] shrink-0" />
          </div>
          <div className="text-2xl leading-none font-semibold num text-[hsl(var(--primary))] mt-1.5" data-testid="text-history-current-meter">
            {formatNumber(asset.currentMeter)}{" "}
            <span className="text-sm font-normal">{meterUnitLabel(asset.meterType, asset.meterLabel)}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">As of {formatDate(asset.meterAsOf)}</div>
        </div>
      </div>
    </div>
  );
}

function buildPillData(asset: Asset, fuelTypes: FleetFuelType[]) {
  const fuel = fuelTypeByName(fuelTypes, asset.fuelType);
  const engine = enginePillValue(asset);
  const pills: Array<{ key: string; label: string; icon: ReactNode; style?: CSSProperties }> = [];
  if (asset.fuelType) {
    pills.push({
      key: "fuel",
      label: asset.fuelType,
      icon: <FuelTypeIcon icon={fuel?.icon} className="size-3.5 shrink-0" style={{ color: fuel?.color }} />,
      style: tintedFuelStyle(fuel?.color),
    });
  }
  if (engine) pills.push({ key: "engine", label: engine, icon: <Gauge className="size-3.5 shrink-0" /> });
  if (asset.drivetrain) pills.push({ key: "drivetrain", label: asset.drivetrain, icon: <Car className="size-3.5 shrink-0" /> });
  if (asset.transmission) pills.push({ key: "transmission", label: asset.transmission, icon: <Settings2 className="size-3.5 shrink-0" /> });
  if (asset.gvwr) pills.push({ key: "gvwr", label: asset.gvwr, icon: <Package className="size-3.5 shrink-0" /> });
  return pills;
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

// ---------------------------------------------------------------------------
// Export utilities (CSV / XLS via HTML workbook / PDF via bundled jsPDF)
// ---------------------------------------------------------------------------

type ExportTable = {
  title: string;
  asset: Asset;
  columns: string[];
  rows: (string | number)[][];
  chartImageDataUrl?: string;
};

function csvEscape(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function htmlEscape(value: string | number): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(content: BlobPart, mime: string, filename: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "");
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.replace(/"/g, ""));
    } catch {
      return encoded.replace(/"/g, "");
    }
  }
  return header.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 250);
}

function assetCommentLines(asset: Asset, title: string): string[] {
  return [
    `# ${title}`,
    `# Asset: ${asset.friendlyName ?? ""}`,
    asset.year || asset.make || asset.model ? `# Vehicle: ${[asset.year, asset.make, asset.model, asset.trim].filter(Boolean).join(" ")}` : "",
    asset.vin ? `# VIN: ${asset.vin}` : "",
    asset.serial ? `# Serial: ${asset.serial}` : "",
    asset.engine ? `# Engine: ${asset.engine}` : "",
    `# Current ${meterFullLabel(asset.meterType, asset.meterLabel)}: ${formatNumber(asset.currentMeter)} ${meterUnitLabel(asset.meterType, asset.meterLabel)} (as of ${formatDate(asset.meterAsOf)})`,
    `# Exported: ${new Date().toISOString()}`,
  ].filter(Boolean);
}

export function exportCsv(table: ExportTable) {
  const headerComment = assetCommentLines(table.asset, table.title);
  const lines = [
    ...headerComment,
    table.columns.map(csvEscape).join(","),
    ...table.rows.map((row) => row.map(csvEscape).join(",")),
  ];
  const content = lines.join("\n");
  const filename = `${safeFilename(table.asset.friendlyName ?? "asset")}_${safeFilename(table.title)}.csv`;
  downloadBlob(content, "text/csv;charset=utf-8;", filename);
}

export async function exportXlsx(table: ExportTable, onError?: (err: unknown) => void) {
  try {
    const a = table.asset;
    const headerRows: (string | number)[][] = [
      [table.title],
      [`Asset: ${a.friendlyName ?? ""}`],
    ];
    const vehicle = [a.year, a.make, a.model, a.trim].filter(Boolean).join(" ");
    if (vehicle) headerRows.push([`Vehicle: ${vehicle}`]);
    if (a.vin) headerRows.push([`VIN: ${a.vin}`]);
    if (a.serial) headerRows.push([`Serial: ${a.serial}`]);
    if (a.engine) headerRows.push([`Engine: ${a.engine}`]);
    headerRows.push([
      `Current ${meterFullLabel(a.meterType, a.meterLabel)}: ${formatNumber(a.currentMeter)} ${meterUnitLabel(a.meterType, a.meterLabel)} (as of ${formatDate(a.meterAsOf)})`,
    ]);
    headerRows.push([`Exported: ${new Date().toLocaleString()}`]);
    headerRows.push([]);
    const rows: (string | number)[][] = [...headerRows, table.columns, ...table.rows];
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    td, th { border: 1px solid #d9d9d9; padding: 4px 6px; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 700; }
    .title td { font-size: 14pt; font-weight: 700; border: none; }
    .meta td { border: none; color: #444; }
    .blank td { border: none; height: 10px; }
  </style>
</head>
<body>
  <table>
    ${rows.map((row, idx) => {
      const cls = idx === 0 ? "title" : idx < headerRows.length - 1 ? "meta" : row.length === 0 ? "blank" : "";
      const tag = idx === headerRows.length ? "th" : "td";
      const cells = (row.length ? row : [""]).map((cell) => `<${tag}>${htmlEscape(cell)}</${tag}>`).join("");
      return `<tr class="${cls}">${cells}</tr>`;
    }).join("")}
  </table>
</body>
</html>`;
    const filename = `${safeFilename(table.asset.friendlyName ?? "asset")}_${safeFilename(table.title)}.xls`;
    downloadBlob(html, "application/vnd.ms-excel;charset=utf-8;", filename);
  } catch (err) {
    onError?.(err);
    throw err;
  }
}

export async function exportPdf(table: ExportTable, onError?: (err: unknown) => void) {
  try {
    const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
    const a = table.asset;
    const margin = 36;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(a.friendlyName ?? "Asset", margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(table.title.toUpperCase(), margin, y);
    y += 14;
    doc.setTextColor(40);

    const lines: string[] = [];
    const vehicle = [a.year, a.make, a.model, a.trim].filter(Boolean).join(" ");
    if (vehicle) lines.push(`Vehicle: ${vehicle}`);
    const idBits: string[] = [];
    if (a.vin) idBits.push(`VIN: ${a.vin}`);
    if (a.serial) idBits.push(`Serial: ${a.serial}`);
    if (idBits.length) lines.push(idBits.join("    "));
    if (a.engine) lines.push(`Engine: ${a.engine}`);
    lines.push(
      `Current ${meterFullLabel(a.meterType, a.meterLabel)}: ${formatNumber(a.currentMeter)} ${meterUnitLabel(a.meterType, a.meterLabel)} (as of ${formatDate(a.meterAsOf)})`,
    );
    doc.setFontSize(10);
    for (const line of lines) {
      doc.text(line, margin, y);
      y += 13;
    }
    y += 6;

    if (table.chartImageDataUrl) {
      try {
        const pageW = doc.internal.pageSize.getWidth();
        const maxW = pageW - margin * 2;
        // Determine intrinsic ratio via Image when possible; fallback to 16:5.
        const ratio = await imageAspectRatio(table.chartImageDataUrl).catch(() => 16 / 5);
        const w = maxW;
        const h = Math.min(220, w / ratio);
        doc.addImage(table.chartImageDataUrl, "PNG", margin, y, w, h);
        y += h + 12;
      } catch {
        // ignore image embed failure
      }
    }

    autoTable(doc, {
      startY: y,
      head: [table.columns],
      body: table.rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [247, 246, 242], textColor: [40, 37, 29], lineColor: [212, 209, 202] },
      alternateRowStyles: { fillColor: [251, 251, 249] },
      margin: { left: margin, right: margin },
      tableLineColor: [236, 234, 227],
      tableLineWidth: 0.5,
    });

    const filename = `${safeFilename(table.asset.friendlyName ?? "asset")}_${safeFilename(table.title)}.pdf`;
    doc.save(filename);
  } catch (err) {
    onError?.(err);
    throw err;
  }
}

function imageAspectRatio(dataUrl: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight));
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

// Capture a Recharts container as a PNG dataURL. Falls back to a hand-drawn
// canvas chart if SVG-to-canvas conversion fails.
export async function captureChartDataUrl(
  containerEl: HTMLElement | null,
  fallbackData: Array<{ date: number; value: number }>,
  unit: string,
): Promise<string | undefined> {
  if (!containerEl) {
    return fallbackData.length > 1 ? drawFallbackChart(fallbackData, unit) : undefined;
  }
  try {
    const svg = containerEl.querySelector("svg");
    if (svg) {
      const dataUrl = await svgToPngDataUrl(svg as SVGSVGElement);
      if (dataUrl) return dataUrl;
    }
  } catch {
    // continue to fallback
  }
  return fallbackData.length > 1 ? drawFallbackChart(fallbackData, unit) : undefined;
}

function svgToPngDataUrl(svg: SVGSVGElement): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      // Clone the SVG and inline computed colors that depend on CSS variables.
      const cloned = svg.cloneNode(true) as SVGSVGElement;
      inlineSvgStyles(svg, cloned);
      const bbox = svg.getBoundingClientRect();
      const widthAttr = svg.getAttribute("width");
      const heightAttr = svg.getAttribute("height");
      const width = bbox.width || Number(widthAttr) || 720;
      const height = bbox.height || Number(heightAttr) || 240;
      cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      cloned.setAttribute("width", String(width));
      cloned.setAttribute("height", String(height));
      const serialized = new XMLSerializer().serializeToString(cloned);
      const svg64 = btoa(unescape(encodeURIComponent(serialized)));
      const src = `data:image/svg+xml;base64,${svg64}`;
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = 2;
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(undefined);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(undefined);
        }
      };
      img.onerror = () => resolve(undefined);
      img.src = src;
    } catch {
      resolve(undefined);
    }
  });
}

function inlineSvgStyles(source: SVGSVGElement, target: SVGSVGElement) {
  const sourceNodes = source.querySelectorAll("*");
  const targetNodes = target.querySelectorAll("*");
  for (let i = 0; i < sourceNodes.length; i++) {
    const s = sourceNodes[i] as Element;
    const t = targetNodes[i] as Element;
    if (!s || !t) continue;
    const computed = window.getComputedStyle(s);
    const fill = computed.fill;
    const stroke = computed.stroke;
    const strokeWidth = computed.strokeWidth;
    const color = computed.color;
    const font = computed.font;
    const style: string[] = [];
    if (fill && fill !== "rgb(0, 0, 0)" && fill !== "none") style.push(`fill:${fill}`);
    if (stroke && stroke !== "none") style.push(`stroke:${stroke}`);
    if (strokeWidth) style.push(`stroke-width:${strokeWidth}`);
    if (color) style.push(`color:${color}`);
    if (font) style.push(`font:${font}`);
    if (style.length) (t as HTMLElement).setAttribute("style", style.join(";"));
  }
}

function drawFallbackChart(data: Array<{ date: number; value: number }>, unit: string): string {
  const width = 1440;
  const height = 480;
  const padL = 110;
  const padR = 24;
  const padT = 24;
  const padB = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const xs = data.map((d) => d.date);
  const ys = data.map((d) => d.value);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xSpan = Math.max(1, xMax - xMin);
  const ySpan = Math.max(1, yMax - yMin);
  const sx = (x: number) => padL + ((x - xMin) / xSpan) * (width - padL - padR);
  const sy = (y: number) => padT + (1 - (y - yMin) / ySpan) * (height - padT - padB);
  ctx.strokeStyle = "#ECEAE3";
  ctx.lineWidth = 1;
  ctx.font = "20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "#7A7974";
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const y = padT + t * (height - padT - padB);
    const val = yMax - t * ySpan;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(width - padR, y);
    ctx.stroke();
    ctx.fillText(formatNumber(val), 16, y + 8);
  }
  ctx.fillText(formatDate(new Date(xMin)), padL, height - 24);
  const endLabel = formatDate(new Date(xMax));
  ctx.fillText(endLabel, width - padR - ctx.measureText(endLabel).width, height - 24);
  ctx.fillText(`Reading (${unit})`, padL, padT - 6);
  ctx.strokeStyle = "#01696F";
  ctx.lineWidth = 3;
  ctx.beginPath();
  data.forEach((p, i) => {
    const x = sx(p.date);
    const y = sy(p.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = "#01696F";
  data.forEach((p) => {
    ctx.beginPath();
    ctx.arc(sx(p.date), sy(p.value), 5, 0, Math.PI * 2);
    ctx.fill();
  });
  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  active,
  dir,
  onClick,
  testId,
  className,
}: {
  label: ReactNode;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  testId: string;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`py-2 pr-3 cursor-pointer select-none ${className ?? ""}`} onClick={onClick} data-testid={testId}>
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={`size-3 ${active ? "text-foreground" : "text-muted-foreground/60"}`} />
      </span>
    </th>
  );
}

function RowActionButtons({
  onEdit,
  onDelete,
  editTestId,
  deleteTestId,
  editLabel,
  deleteLabel,
  canEdit,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  editTestId: string;
  deleteTestId: string;
  editLabel: string;
  deleteLabel: string;
  canEdit: boolean;
}) {
  return (
    <div className="flex items-center gap-1 justify-end">
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:bg-[hsl(var(--primary)/0.08)] hover:text-[hsl(var(--primary))]"
          onClick={onEdit}
          disabled={!canEdit}
          data-testid={editTestId}
          aria-label={editLabel}
          title={editLabel}
        >
          <Edit className="size-4" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:bg-[hsl(var(--destructive)/0.08)] hover:text-[hsl(var(--destructive))]"
          onClick={onDelete}
          disabled={!canEdit}
          data-testid={deleteTestId}
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service History Modal
// ---------------------------------------------------------------------------

type ServiceSortKey = "date" | "meter" | "title";

type ServiceHistoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset;
  events: ServiceEvent[];
  lineItems: ServiceLineItem[];
  fuelTypes: FleetFuelType[];
  configuredType?: FleetEquipmentType;
  vinFeaturesEnabled?: boolean;
  canEdit?: boolean;
};

export function ServiceHistoryModal({
  open,
  onOpenChange,
  asset,
  events,
  lineItems,
  fuelTypes,
  configuredType,
  vinFeaturesEnabled,
  canEdit = true,
}: ServiceHistoryModalProps) {
  const [range, setRange] = useState<DateRangeState>(defaultRange());
  const [sortKey, setSortKey] = useState<ServiceSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!open) return;
    setRange(defaultRange());
    setSortKey("date");
    setSortDir("desc");
  }, [open]);

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

  const filtered = useMemo(() => filterEventsByRange(events, range), [events, range]);

  const linesByEvent = useMemo(() => {
    const map = new Map<number, ServiceLineItem[]>();
    for (const line of lineItems) {
      if (!map.has(line.serviceEventId)) map.set(line.serviceEventId, []);
      map.get(line.serviceEventId)!.push(line);
    }
    return map;
  }, [lineItems]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const mult = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "meter") return ((a.meterAtService ?? 0) - (b.meterAtService ?? 0)) * mult;
      if (sortKey === "title") return a.title.localeCompare(b.title) * mult;
      return (new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime()) * mult;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const onSort = (key: ServiceSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "title" ? "asc" : "desc");
    }
  };

  const buildExportTable = (): ExportTable => {
    const meterUnit = meterUnitLabel(asset.meterType, asset.meterLabel);
    const columns = ["Date", `Meter (${meterUnit})`, "Service", "Oil / Fluid", "Filter / Part", "Notes"];
    const rows = sorted.map((e) => {
      const eventLines = linesByEvent.get(e.id) ?? [];
      const fluids = eventLines
        .filter((l) => /oil|fluid|atf|coolant/i.test(`${l.itemName} ${l.spec ?? ""}`))
        .map((l) => `${l.itemName} (${formatNumber(l.quantity)} ${l.unit ?? ""})`);
      const parts = eventLines
        .filter((l) => !/oil|fluid|atf|coolant/i.test(l.itemName))
        .map((l) => (l.partNumber ? `${l.itemName} ${l.partNumber}` : l.itemName));
      return [
        formatDate(e.performedAt),
        e.meterAtService != null ? formatNumber(e.meterAtService) : "",
        e.title,
        fluids.join("; "),
        parts.join("; "),
        e.notes ?? "",
      ];
    });
    return { title: "Service History", asset, columns, rows };
  };

  const meterUnit = meterUnitLabel(asset.meterType, asset.meterLabel);
  const meterHeadingLabel = meterFullLabel(asset.meterType, asset.meterLabel);

  const onDeleteEvent = (id: number) => {
    if (!window.confirm("Delete this service entry? Related line items will be removed and consumed stock will be restored.")) return;
    deleteService.mutate(id);
  };

  return (
    <HistoryModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Service History"
      historyKind="service"
      testIdPrefix="service-history-modal"
      asset={asset}
      configuredType={configuredType}
      fuelTypes={fuelTypes}
      vinFeaturesEnabled={vinFeaturesEnabled}
      toolbarLeft={
        <DateRangeFilter
          value={range}
          onChange={setRange}
          testIdPrefix="service-history-modal-filter"
        />
      }
      buildExportTable={buildExportTable}
    >
      <div className="text-xs text-muted-foreground mb-2" data-testid="service-history-modal-count">
        Showing {sorted.length} of {events.length} services
      </div>
      <div className="overflow-x-auto rounded-md border border-border print-table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground bg-muted/40">
              <SortableHeader
                label="Date"
                active={sortKey === "date"}
                dir={sortDir}
                onClick={() => onSort("date")}
                testId="service-history-modal-sort-date"
                className="pl-3"
              />
              <SortableHeader
                label={meterHeadingLabel}
                active={sortKey === "meter"}
                dir={sortDir}
                onClick={() => onSort("meter")}
                testId="service-history-modal-sort-meter"
              />
              <SortableHeader
                label="Service"
                active={sortKey === "title"}
                dir={sortDir}
                onClick={() => onSort("title")}
                testId="service-history-modal-sort-title"
              />
              <th className="py-2 pr-3">Oil / Fluid</th>
              <th className="py-2 pr-3">Filter / Part</th>
              <th className="py-2 pr-3">Notes</th>
              <th className="py-2 pr-3 text-right history-modal-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:pr-3">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  No service events match the selected filters.
                </td>
              </tr>
            )}
            {sorted.map((e) => {
              const eventLines = linesByEvent.get(e.id) ?? [];
              const fluids = eventLines
                .filter((l) => /oil|fluid|atf|coolant/i.test(`${l.itemName} ${l.spec ?? ""}`))
                .map((l) => `${l.itemName} (${formatNumber(l.quantity)} ${l.unit ?? ""})`);
              const parts = eventLines
                .filter((l) => !/oil|fluid|atf|coolant/i.test(l.itemName))
                .map((l) => (l.partNumber ? `${l.itemName} ${l.partNumber}` : l.itemName));
              return (
                <tr key={e.id} data-testid={`service-history-modal-row-${e.id}`}>
                  <td className="num whitespace-nowrap pl-3">{formatDate(e.performedAt)}</td>
                  <td className="num whitespace-nowrap">
                    {e.meterAtService != null ? `${formatNumber(e.meterAtService)} ${meterUnit}` : "—"}
                  </td>
                  <td className="font-medium">{e.title}</td>
                  <td>{fluids.join(", ") || "—"}</td>
                  <td>{parts.join(", ") || "—"}</td>
                  <td className="max-w-xs">{e.notes ?? "—"}</td>
                  <td className="history-modal-actions-col">
                    <RowActionButtons
                      canEdit={canEdit}
                      editTestId={`button-edit-service-${e.id}`}
                      deleteTestId={`button-delete-service-${e.id}`}
                      editLabel="Edit service entry"
                      deleteLabel="Delete service entry"
                      onEdit={() => navigate(`/events/${e.id}/edit`)}
                      onDelete={() => onDeleteEvent(e.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </HistoryModalShell>
  );
}

// ---------------------------------------------------------------------------
// Meter History Modal
// ---------------------------------------------------------------------------

type MeterHistoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset;
  readings: MeterReading[];
  fuelTypes: FleetFuelType[];
  configuredType?: FleetEquipmentType;
  vinFeaturesEnabled?: boolean;
  canEdit?: boolean;
};

export function MeterHistoryModal({
  open,
  onOpenChange,
  asset,
  readings,
  fuelTypes,
  configuredType,
  vinFeaturesEnabled,
  canEdit = true,
}: MeterHistoryModalProps) {
  const [mode, setMode] = useState<MeterFilterMode>("date");
  const [range, setRange] = useState<DateRangeState>(defaultRange());
  const [meterWindow, setMeterWindow] = useState<MeterWindowOption>("10k");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showChart, setShowChart] = useState(true);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!open) return;
    setMode("date");
    setRange(defaultRange());
    setMeterWindow("10k");
    setSortDir("desc");
    setShowChart(true);
  }, [open]);

  const deleteReading = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/meter-readings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meter-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Meter reading removed" });
    },
    onError: (e) => toast({ title: "Delete failed", description: String(e), variant: "destructive" }),
  });

  const meterUnit = meterUnitLabel(asset.meterType, asset.meterLabel);
  const meterHeading = meterFullLabel(asset.meterType, asset.meterLabel);

  const filtered = useMemo(() => {
    if (mode === "date") return filterReadingsByRange(readings, range);
    return filterReadingsByMeterWindow(readings, asset.currentMeter, meterWindow);
  }, [readings, mode, range, meterWindow, asset.currentMeter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const mult = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => (new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime()) * mult);
    return arr;
  }, [filtered, sortDir]);

  const chartData = useMemo(() => {
    return [...filtered]
      .sort((a, b) => new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime())
      .map((r) => ({
        date: new Date(r.readingDate).getTime(),
        dateLabel: formatDate(r.readingDate),
        value: r.value ?? 0,
      }));
  }, [filtered]);

  const buildExportTable = async (): Promise<ExportTable> => {
    const columns = ["Date", `${meterHeading} (${meterUnit})`, "Source", "Notes"];
    const rows = sorted.map((r) => [
      formatDate(r.readingDate),
      r.value != null ? formatNumber(r.value) : "",
      r.source ?? "",
      r.notes ?? "",
    ]);
    let chartImageDataUrl: string | undefined;
    if (showChart && chartData.length > 1) {
      chartImageDataUrl = await captureChartDataUrl(chartContainerRef.current, chartData, meterUnit);
    }
    return { title: "Meter History", asset, columns, rows, chartImageDataUrl };
  };

  const onDeleteReading = (id: number) => {
    if (!window.confirm("Delete this meter reading? The asset's current meter will be recalculated from remaining readings.")) return;
    deleteReading.mutate(id);
  };

  return (
    <HistoryModalShell
      open={open}
      onOpenChange={onOpenChange}
      title="Meter History"
      historyKind="meter"
      testIdPrefix="meter-history-modal"
      asset={asset}
      configuredType={configuredType}
      fuelTypes={fuelTypes}
      vinFeaturesEnabled={vinFeaturesEnabled}
      toolbarLeft={
        <MeterFilterControls
          mode={mode}
          onModeChange={setMode}
          range={range}
          onRangeChange={setRange}
          meterWindow={meterWindow}
          onMeterWindowChange={setMeterWindow}
          unitLabel={meterUnit || "mi"}
          testIdPrefix="meter-history-modal-filter"
        />
      }
      toolbarExtras={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 w-11 sm:h-8 sm:w-auto sm:text-xs justify-center px-0 sm:px-3"
          onClick={() => setShowChart((v) => !v)}
          data-testid="meter-history-modal-toggle-chart"
          aria-label={showChart ? "Hide Usage Chart" : "Show Usage Chart"}
          title={showChart ? "Hide Usage Chart" : "Show Usage Chart"}
        >
          <LineChartIcon className="size-4 sm:size-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">{showChart ? "Hide Usage Chart" : "Show Usage Chart"}</span>
        </Button>
      }
      buildExportTable={buildExportTable}
    >
      {showChart && (
        <div
          ref={chartContainerRef}
          className="mb-4 rounded-md border border-border bg-muted/20 p-3 print-chart"
          data-testid="meter-history-modal-chart"
        >
          {chartData.length > 1 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 16, left: 0, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(t: number) => formatDate(new Date(t))}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatNumber(v)}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                    width={70}
                    label={{ value: `${meterHeading} (${meterUnit})`, angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelFormatter={(v: number) => formatDate(new Date(v))}
                    formatter={(v: number) => [`${formatNumber(v)} ${meterUnit}`, meterHeading]}
                  />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-8 text-center">
              Need at least two readings in the selected window to render a chart.
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground" data-testid="meter-history-modal-count">
          Showing {sorted.length} of {readings.length} readings
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          data-testid="meter-history-modal-sort-toggle"
        >
          Date {sortDir === "asc" ? <ArrowUp className="ml-1 size-3" /> : <ArrowDown className="ml-1 size-3" />}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border print-table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground bg-muted/40">
              <th className="py-2 pr-3 pl-3">Date</th>
              <th className="py-2 pr-3">{meterHeading}</th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2 pr-3">Notes</th>
              <th className="py-2 pr-3 text-right history-modal-actions-col">Actions</th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:pr-3">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  No meter readings match the selected filters.
                </td>
              </tr>
            )}
            {sorted.map((r) => (
              <tr key={r.id} data-testid={`meter-history-modal-row-${r.id}`}>
                <td className="num whitespace-nowrap pl-3">{formatDate(r.readingDate)}</td>
                <td className="num font-medium whitespace-nowrap">
                  {formatNumber(r.value)} <span className="text-xs text-muted-foreground">{meterUnit}</span>
                </td>
                <td className="text-xs text-muted-foreground">{r.source ?? "—"}</td>
                <td className="text-xs">{r.notes ?? "—"}</td>
                <td className="history-modal-actions-col">
                  <RowActionButtons
                    canEdit={canEdit}
                    editTestId={`button-edit-meter-${r.id}`}
                    deleteTestId={`button-delete-meter-${r.id}`}
                    editLabel="Edit meter reading"
                    deleteLabel="Delete meter reading"
                    onEdit={() => navigate(`/assets/${asset.id}/meter/${r.id}/edit`)}
                    onDelete={() => onDeleteReading(r.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HistoryModalShell>
  );
}

// ---------------------------------------------------------------------------
// Shared modal shell with toolbar
// ---------------------------------------------------------------------------

type HistoryModalShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  historyKind: "service" | "meter";
  testIdPrefix: string;
  asset: Asset;
  configuredType?: FleetEquipmentType;
  fuelTypes: FleetFuelType[];
  vinFeaturesEnabled?: boolean;
  toolbarLeft: ReactNode;
  toolbarExtras?: ReactNode;
  buildExportTable: () => ExportTable | Promise<ExportTable>;
  children: ReactNode;
};

function HistoryModalShell({
  open,
  onOpenChange,
  title,
  historyKind,
  testIdPrefix,
  asset,
  configuredType,
  fuelTypes,
  vinFeaturesEnabled,
  toolbarLeft,
  toolbarExtras,
  buildExportTable,
  children,
}: HistoryModalShellProps) {
  const { toast } = useToast();
  const [exportBusy, setExportBusy] = useState<"pdf" | "xls" | "csv" | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const historyUrlBase = `${API_BASE}/api/assets/${asset.id}/history/${historyKind}`;
  const exportUrl = (format: "pdf" | "xls" | "csv") => `${historyUrlBase}/export/${format}`;
  const printUrl = `${historyUrlBase}/print`;

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && exportMenuRef.current?.contains(target)) return;
      setExportMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExportMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [exportMenuOpen]);

  useEffect(() => {
    return () => {
      printFrameRef.current?.remove();
      printFrameRef.current = null;
    };
  }, []);

  const handleExport = async (format: "pdf" | "xls" | "csv") => {
    setExportMenuOpen(false);
    setExportBusy(format);
    const label = format === "xls" ? "XLS" : format.toUpperCase();
    try {
      const response = await fetch(exportUrl(format));
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      const fallback = `${safeFilename(asset.friendlyName ?? "asset")}_${historyKind === "service" ? "Service_History" : "Meter_History"}.${format}`;
      const filename = filenameFromContentDisposition(response.headers.get("content-disposition"), fallback);
      downloadBlobFile(blob, filename);
      toast({ title: `${label} export ready`, description: filename });
    } catch (err) {
      toast({
        title: `${label} export failed`,
        description: String((err as Error)?.message ?? err),
        variant: "destructive",
      });
    } finally {
      setExportBusy(null);
    }
  };

  const handlePrint = () => {
    setPrintBusy(true);
    let frame = printFrameRef.current;
    if (!frame) {
      frame = document.createElement("iframe");
      frame.title = `${title} print frame`;
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "1px";
      frame.style.height = "1px";
      frame.style.border = "0";
      frame.style.opacity = "0";
      frame.style.pointerEvents = "none";
      document.body.appendChild(frame);
      printFrameRef.current = frame;
    }

    const cleanup = () => {
      setPrintBusy(false);
      window.setTimeout(() => {
        if (printFrameRef.current) {
          printFrameRef.current.remove();
          printFrameRef.current = null;
        }
      }, 1000);
    };

    frame.onload = () => {
      try {
        const frameWindow = frame?.contentWindow;
        if (!frameWindow) throw new Error("Print frame unavailable");
        frameWindow.focus();
        frameWindow.addEventListener("afterprint", cleanup, { once: true });
        frameWindow.print();
        window.setTimeout(cleanup, 2500);
      } catch (err) {
        cleanup();
        toast({
          title: "Print failed",
          description: String((err as Error)?.message ?? err),
          variant: "destructive",
        });
      }
    };
    frame.src = printUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[60] max-w-[min(96vw,1200px)] w-[96vw] h-[92vh] p-0 gap-0 overflow-hidden flex flex-col history-modal-content"
        data-testid={`${testIdPrefix}-content`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3 history-modal-chrome">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Asset History</div>
            <DialogTitle className="text-lg font-semibold tracking-tight" data-testid={`${testIdPrefix}-title`}>
              {title}
            </DialogTitle>
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Close ${title.toLowerCase()} modal`}
              data-testid={`${testIdPrefix}-close`}
            >
              <X className="size-4" />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div className="px-5 pt-4 history-modal-summary">
          <AssetHistorySummary
            asset={asset}
            configuredType={configuredType}
            fuelTypes={fuelTypes}
            vinFeaturesEnabled={vinFeaturesEnabled}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-border bg-muted/20 history-modal-chrome">
          <div className="flex flex-wrap items-center gap-2">
            {toolbarLeft}
            {toolbarExtras}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative" ref={exportMenuRef}>
              <Button
                variant="outline"
                size="sm"
                className="h-11 w-11 sm:h-8 sm:w-auto sm:text-xs justify-center px-0 sm:px-3"
                data-testid={`${testIdPrefix}-export-trigger`}
                aria-label="Export"
                title="Export"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
                disabled={exportBusy !== null}
                onClick={() => setExportMenuOpen((value) => !value)}
              >
                <Download className="size-4 sm:size-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">
                  {exportBusy ? `Preparing ${exportBusy === "xls" ? "XLS" : exportBusy.toUpperCase()}…` : "Export"}
                </span>
                <ChevronDown className="hidden sm:inline-flex sm:ml-1 size-3.5" />
              </Button>
              {exportMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-[90] mt-2 w-44 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                  data-testid={`${testIdPrefix}-export-menu`}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex min-h-10 w-full items-center rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
                    onClick={() => void handleExport("pdf")}
                    data-testid={`${testIdPrefix}-export-pdf`}
                  >
                    <FileText className="mr-2 size-4" /> Export PDF
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex min-h-10 w-full items-center rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
                    onClick={() => void handleExport("xls")}
                    data-testid={`${testIdPrefix}-export-xlsx`}
                  >
                    <FileSpreadsheet className="mr-2 size-4" /> Export XLS
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex min-h-10 w-full items-center rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
                    onClick={() => void handleExport("csv")}
                    data-testid={`${testIdPrefix}-export-csv`}
                  >
                    <Download className="mr-2 size-4" /> Export CSV
                  </button>
                </div>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 w-11 sm:h-8 sm:w-auto sm:text-xs justify-center px-0 sm:px-3"
                  onClick={handlePrint}
                  disabled={printBusy}
                  data-testid={`${testIdPrefix}-print`}
                  aria-label="Print"
                  title="Print"
                >
                  <Printer className="size-4 sm:size-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">{printBusy ? "Preparing…" : "Print"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Print this history</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 history-modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
