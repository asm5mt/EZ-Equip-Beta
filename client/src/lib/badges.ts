import type { CSSProperties } from "react";

const TYPE_COLORS: Record<string, string> = {
  vehicle: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
  generator: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  trailer: "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300",
  tractor: "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-300",
  atv: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300",
  snowmobile: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-300",
  lawn: "bg-lime-500/10 text-lime-700 border-lime-500/30 dark:text-lime-300",
  equipment: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300",
};

export const BADGE_COLORS = ["blue", "amber", "slate", "green", "orange", "cyan", "lime", "purple", "red", "pink", "emerald", "teal", "sky", "indigo", "violet", "rose"] as const;

export const BADGE_COLOR_HEX: Record<string, string> = {
  blue: "#2563eb",
  amber: "#d97706",
  slate: "#64748b",
  green: "#16a34a",
  orange: "#ea580c",
  cyan: "#0891b2",
  lime: "#65a30d",
  purple: "#7c3aed",
  red: "#dc2626",
  pink: "#db2777",
  emerald: "#059669",
  teal: "#0d9488",
  sky: "#0284c7",
  indigo: "#4f46e5",
  violet: "#7c3aed",
  rose: "#e11d48",
};

export function badgeColorValue(color: string | null | undefined): string {
  const raw = String(color ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  return BADGE_COLOR_HEX[raw.toLowerCase()] ?? BADGE_COLOR_HEX.slate;
}

export function tintedBadgeStyle(color: string | null | undefined): CSSProperties {
  const safe = badgeColorValue(color);
  return {
    borderColor: `${safe}55`,
    backgroundColor: `${safe}26`,
    color: safe,
  };
}

export function badgeColorClass(color: string | null | undefined): string {
  const key = String(color ?? "").toLowerCase();
  const classes: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
    amber: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
    slate: "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300",
    green: "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-300",
    orange: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300",
    cyan: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-300",
    lime: "bg-lime-500/10 text-lime-700 border-lime-500/30 dark:text-lime-300",
    purple: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300",
    red: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300",
    pink: "bg-pink-500/10 text-pink-700 border-pink-500/30 dark:text-pink-300",
    emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    teal: "bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300",
    sky: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
    indigo: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
    violet: "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300",
    rose: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300",
  };
  return classes[key] ?? classes.slate;
}

export function assetTypeBadgeClass(type: string | null | undefined): string {
  return TYPE_COLORS[String(type ?? "").toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
}

export const DEFAULT_ASSET_TYPES = [
  { name: "Vehicle", color: "Blue", defaultMeter: "Mileage" },
  { name: "Generator", color: "Amber", defaultMeter: "Hours" },
  { name: "Trailer", color: "Slate", defaultMeter: "Count" },
  { name: "Tractor", color: "Green", defaultMeter: "Hours" },
  { name: "ATV", color: "Orange", defaultMeter: "Mileage" },
  { name: "Snowmobile", color: "Cyan", defaultMeter: "Mileage" },
  { name: "Lawn", color: "Lime", defaultMeter: "Hours" },
  { name: "Equipment", color: "Purple", defaultMeter: "Custom" },
];
