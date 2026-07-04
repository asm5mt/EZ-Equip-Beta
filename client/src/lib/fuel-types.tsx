import { Atom, Flame, Fuel, Leaf, Wind, Zap } from "lucide-react";
import type { CSSProperties } from "react";
import type { FleetFuelType } from "@shared/schema";

export const DEFAULT_FUEL_TYPES = [
  { name: "Gasoline", color: "#dc2626", icon: "fuel", active: true },
  { name: "Diesel", color: "#d97706", icon: "fuel", active: true },
  { name: "Electric", color: "#16a34a", icon: "zap", active: true },
  { name: "Hybrid", color: "#0d9488", icon: "zap", active: true },
  { name: "CNG", color: "#2563eb", icon: "wind", active: true },
  { name: "Propane / LPG", color: "#ea580c", icon: "flame", active: true },
  { name: "Hydrogen", color: "#7c3aed", icon: "atom", active: true },
  { name: "E85 / Flex Fuel", color: "#ca8a04", icon: "leaf", active: true },
] as const;

export const FUEL_ICON_OPTIONS = [
  { value: "fuel", label: "Fuel", Icon: Fuel },
  { value: "zap", label: "Electric", Icon: Zap },
  { value: "wind", label: "Gas / Air", Icon: Wind },
  { value: "flame", label: "Flame", Icon: Flame },
  { value: "atom", label: "Hydrogen", Icon: Atom },
  { value: "leaf", label: "Eco / Flex", Icon: Leaf },
] as const;

export type FuelIconName = typeof FUEL_ICON_OPTIONS[number]["value"];

export function normalizeFuelIcon(value?: string | null): FuelIconName {
  const normalized = String(value ?? "").trim().toLowerCase();
  return FUEL_ICON_OPTIONS.some(option => option.value === normalized) ? normalized as FuelIconName : "fuel";
}

export function FuelTypeIcon({ icon, className, style }: { icon?: string | null; className?: string; style?: CSSProperties }) {
  const match = FUEL_ICON_OPTIONS.find(option => option.value === normalizeFuelIcon(icon)) ?? FUEL_ICON_OPTIONS[0];
  const Icon = match.Icon;
  return <Icon className={className} style={style} />;
}

export function activeFuelTypes(types?: FleetFuelType[]) {
  return (types ?? []).filter(type => type.active);
}

export function fuelTypeByName(types: FleetFuelType[] | undefined, name?: string | null) {
  if (!name) return undefined;
  return (types ?? []).find(type => type.name.toLowerCase() === String(name).trim().toLowerCase());
}

export function mapVinFuelType(value: string | null | undefined, types: FleetFuelType[] | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: "", warning: "" };
  const normalized = raw.toLowerCase();
  let target = "";
  if (normalized.includes("gasoline")) target = "Gasoline";
  else if (normalized.includes("diesel")) target = "Diesel";
  else if (normalized.includes("electric")) target = "Electric";
  else if (normalized.includes("natural gas") || normalized === "cng" || normalized.includes("compressed natural gas")) target = "CNG";
  else if (normalized.includes("flex") || normalized.includes("ffv") || normalized.includes("e85")) target = "E85 / Flex Fuel";
  else if (normalized.includes("propane") || normalized.includes("lpg")) target = "Propane / LPG";
  else if (normalized.includes("hydrogen")) target = "Hydrogen";
  if (!target) return { value: "", warning: `Unrecognized fuel type from VIN: '${raw}'. Please select manually.` };
  const configured = fuelTypeByName(types, target);
  return configured ? { value: configured.name, warning: "" } : { value: "", warning: `Unrecognized fuel type from VIN: '${raw}'. Please select manually.` };
}

export function tintedFuelStyle(color?: string | null): CSSProperties {
  const safe = /^#[0-9a-f]{6}$/i.test(String(color ?? "")) ? String(color) : "#64748b";
  return {
    borderColor: `${safe}55`,
    backgroundColor: `${safe}26`,
    color: safe,
  };
}
