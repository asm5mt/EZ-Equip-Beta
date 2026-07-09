// Formatting helpers shared across pages.

export function formatNumber(n: number | null | undefined, opts: Intl.NumberFormatOptions = {}): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, ...opts }).format(n);
}

export function formatCurrency(n: number | null | undefined, currency = "USD"): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

export function formatDate(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateInput(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function meterUnitLabel(meterType: string, meterLabel?: string | null): string {
  if (meterType === "mileage") return "mi";
  if (meterType === "hours") return "hr";
  if (meterType === "count") return meterLabel || "ct";
  return meterLabel || "";
}

export function meterFullLabel(meterType: string, meterLabel?: string | null): string {
  if (meterType === "mileage") return "Mileage";
  if (meterType === "hours") return "Hours";
  if (meterType === "count") return meterLabel ? `${meterLabel}` : "Count";
  if (meterType === "kilometers") return "Kilometers";
  return meterLabel || "Meter";
}

// Unit suffix used for meter inputs/intervals: "mi" | "hr" | "km" | "count".
// Falls back to a short label for custom meters.
export function meterIntervalSuffix(readingType: string, meterLabel?: string | null): string {
  switch (readingType) {
    case "mileage": return "mi";
    case "hours": return "hr";
    case "kilometers": return "km";
    case "count": return meterLabel?.trim() || "count";
    default: return meterLabel?.trim() || "";
  }
}

// Dynamic field label for the meter-interval input on the schedule form.
export function meterIntervalLabel(readingType: string): string {
  switch (readingType) {
    case "mileage": return "Mileage Interval";
    case "hours": return "Hour Interval";
    case "kilometers": return "Kilometer Interval";
    case "count": return "Count Interval";
    default: return "Meter Interval";
  }
}

export function meterDueSoonLabel(readingType: string): string {
  switch (readingType) {
    case "mileage": return "Miles Before Due";
    case "hours": return "Hours Before Due";
    case "kilometers": return "Kilometers Before Due";
    case "count": return "Count Before Due";
    default: return "Meter Before Due";
  }
}

// Format a number with commas while preserving raw numeric semantics for the value field.
export function formatWithCommas(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

// Compact "time ago" label for recent timestamps, falling back to a plain
// date once it's more than a month old.
export function formatRelativeTime(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(date);
}

// Build a compact one-line interval summary used in dropdowns / cards:
//   "5,000 mi / 90 days"  |  "5,000 mi"  |  "90 days"
export function scheduleIntervalSummary(
  schedule: { meterInterval?: number | null; dayInterval?: number | null; readingType?: string | null },
  meterLabel?: string | null,
): string {
  const parts: string[] = [];
  if (schedule.meterInterval && schedule.meterInterval > 0) {
    parts.push(`${formatWithCommas(schedule.meterInterval)} ${meterIntervalSuffix(schedule.readingType ?? "mileage", meterLabel)}`.trim());
  }
  if (schedule.dayInterval && schedule.dayInterval > 0) {
    parts.push(`${formatWithCommas(schedule.dayInterval)} days`);
  }
  return parts.length ? parts.join(" / ") : "No interval set";
}
