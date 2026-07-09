import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Gauge, CalendarDays, Info, X, Plus } from "lucide-react";
import type { Asset } from "@shared/schema";
import {
  formatWithCommas,
  meterIntervalLabel,
  meterDueSoonLabel,
  meterIntervalSuffix,
} from "@/lib/format";

// =============================================================================
// Shared inputs for the schedule form (fleet & asset variants)
// =============================================================================

// Default category tag picker. New custom categories can also be typed.
export const DEFAULT_CATEGORIES = [
  "Engine", "Drivetrain", "Brakes", "Fluids", "Electrical",
  "Chassis", "Tires", "Body", "Safety", "HVAC", "Other",
] as const;

export const READING_TYPE_OPTIONS = [
  { value: "mileage", label: "Mileage (miles)" },
  { value: "hours", label: "Hours" },
  { value: "count", label: "Count / cycles" },
  { value: "kilometers", label: "Kilometers" },
] as const;

const TOOLTIPS = {
  meterInterval: "How much meter usage between completions. Example: 5,000 mi between oil changes.",
  meterDueSoon: "When remaining meter falls below this threshold, the schedule flags as Due Soon.",
  dayInterval: "How many calendar days between completions. Example: 90 days.",
  dayDueSoon: "When remaining days falls below this threshold, the schedule flags as Due Soon.",
  category: "Group schedules by system. Used by the global Maintenance page's By Category view.",
  readingType: "Which meter the schedule tracks. Controls unit labels on inputs and reports.",
} as const;

// Lightweight info icon used in place of static helper text below labels.
export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="More info" className="inline-flex align-middle ml-1 text-muted-foreground hover:text-foreground">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

// Number input that displays comma-formatted text but stores raw numbers.
// On focus it shows raw digits for easy editing; on blur it re-formats.
export function CommaNumberInput({
  value,
  onChange,
  suffix,
  placeholder,
  testId,
  ariaLabel,
  integer = false,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix: string;
  placeholder?: string;
  testId?: string;
  ariaLabel?: string;
  integer?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const displayed = focused
    ? draft
    : (value == null || Number.isNaN(value) ? "" : formatWithCommas(value));

  return (
    <div className="relative">
      <Input
        inputMode="numeric"
        disabled={disabled}
        data-testid={testId}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className="pr-14"
        value={displayed}
        onFocus={() => {
          setFocused(true);
          setDraft(value == null ? "" : String(value));
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.\-]/g, "");
          setDraft(raw);
          if (raw === "" || raw === "-" ) { onChange(null); return; }
          const n = integer ? parseInt(raw, 10) : Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          setFocused(false);
          if (draft === "" || draft === "-") onChange(null);
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground select-none">
        {suffix}
      </span>
    </div>
  );
}

// Category tag picker with defaults + custom typing.
export function CategoryPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState("");
  const allKnown = DEFAULT_CATEGORIES.map(c => c.toLowerCase());
  const current = value?.trim() ?? "";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" data-testid="category-tag-picker">
        {DEFAULT_CATEGORIES.map(c => {
          const selected = current.toLowerCase() === c.toLowerCase();
          return (
            <Button
              key={c}
              type="button"
              variant={selected ? "default" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={() => onChange(selected ? null : c)}
              data-testid={`category-option-${c.toLowerCase()}`}
              className="h-7"
            >
              {c}
            </Button>
          );
        })}
        {current && !allKnown.includes(current.toLowerCase()) && (
          <Badge variant="secondary" data-testid="category-custom-active" className="h-7 px-3 inline-flex items-center gap-1">
            {current}
            <button type="button" onClick={() => onChange(null)} aria-label="Clear category" className="hover:text-foreground">
              <X className="size-3" />
            </button>
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          disabled={disabled}
          placeholder="Add custom category…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="max-w-xs"
          data-testid="input-category-custom"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !custom.trim()}
          onClick={() => { if (custom.trim()) { onChange(custom.trim()); setCustom(""); } }}
          data-testid="button-category-custom-add"
        >
          <Plus className="size-4 mr-1.5" /> Add
        </Button>
      </div>
    </div>
  );
}

// Two-panel trigger card (meter-based on left, time-based on right).
export function TriggerPanels({
  readingType,
  meterLabel,
  meterInterval,
  setMeterInterval,
  meterDueSoon,
  setMeterDueSoon,
  dayInterval,
  setDayInterval,
  dayDueSoon,
  setDayDueSoon,
  disabled,
}: {
  readingType: string;
  meterLabel?: string | null;
  meterInterval: number | null;
  setMeterInterval: (v: number | null) => void;
  meterDueSoon: number | null;
  setMeterDueSoon: (v: number | null) => void;
  dayInterval: number | null;
  setDayInterval: (v: number | null) => void;
  dayDueSoon: number | null;
  setDayDueSoon: (v: number | null) => void;
  disabled?: boolean;
}) {
  const meterSuffix = meterIntervalSuffix(readingType, meterLabel);

  return (
    <div>
      <div className="mb-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        Schedule becomes due when either trigger is reached.
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-muted/30 border-border/70 p-4" data-testid="panel-meter-trigger">
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="size-4 text-muted-foreground" />
            <h4 className="font-semibold">Meter-Based Trigger</h4>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">
                {meterIntervalLabel(readingType)}<InfoTip text={TOOLTIPS.meterInterval} />
              </Label>
              <CommaNumberInput
                value={meterInterval}
                onChange={setMeterInterval}
                suffix={meterSuffix}
                placeholder="e.g. 5,000"
                testId="input-meter-interval"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">
                {meterDueSoonLabel(readingType)}<InfoTip text={TOOLTIPS.meterDueSoon} />
              </Label>
              <CommaNumberInput
                value={meterDueSoon}
                onChange={setMeterDueSoon}
                suffix={meterSuffix}
                placeholder="e.g. 250"
                testId="input-meter-due-soon"
                disabled={disabled}
              />
            </div>
          </div>
        </Card>

        <Card className="bg-muted/30 border-border/70 p-4" data-testid="panel-time-trigger">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="size-4 text-muted-foreground" />
            <h4 className="font-semibold">Time-Based Trigger</h4>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">
                Day Interval<InfoTip text={TOOLTIPS.dayInterval} />
              </Label>
              <CommaNumberInput
                value={dayInterval}
                onChange={setDayInterval}
                suffix="days"
                placeholder="e.g. 90"
                testId="input-day-interval"
                integer
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">
                Days Before Due<InfoTip text={TOOLTIPS.dayDueSoon} />
              </Label>
              <CommaNumberInput
                value={dayDueSoon}
                onChange={setDayDueSoon}
                suffix="days"
                placeholder="e.g. 7"
                testId="input-day-due-soon"
                integer
                disabled={disabled}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Asset Assignments checklist for fleet schedules.
export function AssetAssignments({
  assets,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  disabled,
}: {
  assets: Asset[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
  onClearAll: () => void;
  disabled?: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const types = Array.from(new Set(assets.map(a => a.assetType))).sort();
  const filtered = assets.filter(a => typeFilter === "all" || a.assetType === typeFilter);

  return (
    <Card className="p-4 space-y-3" data-testid="panel-assignments">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h4 className="font-semibold">Assigned Assets</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Assigned to <span className="font-medium text-foreground" data-testid="text-assigned-count">{selectedIds.size}</span> {selectedIds.size === 1 ? "asset" : "assets"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-44" data-testid="select-asset-type-filter">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All asset types</SelectItem>
              {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onSelectAll(filtered.map(a => a.id))} data-testid="button-select-all-assets">All</Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onClearAll} data-testid="button-clear-all-assets">None</Button>
        </div>
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-border/70 divide-y divide-border/60">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground p-3">No matching assets.</p>
        )}
        {filtered.map(a => {
          const selected = selectedIds.has(a.id);
          return (
            <label
              key={a.id}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 text-sm"
              data-testid={`row-assignment-${a.id}`}
            >
              <Checkbox
                checked={selected}
                disabled={disabled}
                onCheckedChange={() => onToggle(a.id)}
                data-testid={`checkbox-assignment-${a.id}`}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{a.friendlyName}</div>
                <div className="text-xs text-muted-foreground truncate">{a.assetType}{a.year ? ` · ${a.year}` : ""}{a.make ? ` ${a.make}` : ""}{a.model ? ` ${a.model}` : ""}</div>
              </div>
            </label>
          );
        })}
      </div>
    </Card>
  );
}

export function NotesPanel({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(!!value && value.length > 0);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        data-testid="button-toggle-notes"
      >
        Additional Notes {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <Textarea
          rows={3}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          data-testid="textarea-schedule-notes"
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

// Header used at top of the form for the trigger statement.
export function FormHeaderRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
  );
}
