import { Building2, Car, CircleGauge, HardHat, ShieldCheck, Store, Truck, Warehouse, Wrench } from "lucide-react";
import type { CSSProperties } from "react";
import type { ServiceFacilityType } from "@shared/schema";

export const FACILITY_TYPE_ICON_OPTIONS = [
  { value: "wrench", label: "Independent Shop", Icon: Wrench },
  { value: "building", label: "Dealership", Icon: Building2 },
  { value: "shield-check", label: "Authorized / Certified", Icon: ShieldCheck },
  { value: "car", label: "Auto Shop", Icon: Car },
  { value: "gauge", label: "Tire Shop", Icon: CircleGauge },
  { value: "hard-hat", label: "Body / Fabrication Shop", Icon: HardHat },
  { value: "truck", label: "Mobile Mechanic", Icon: Truck },
  { value: "warehouse", label: "Depot / Warehouse", Icon: Warehouse },
  { value: "store", label: "Parts Store", Icon: Store },
] as const;

export type FacilityTypeIconName = typeof FACILITY_TYPE_ICON_OPTIONS[number]["value"];

export function normalizeFacilityTypeIcon(value?: string | null): FacilityTypeIconName {
  const normalized = String(value ?? "").trim().toLowerCase();
  return FACILITY_TYPE_ICON_OPTIONS.some(option => option.value === normalized) ? normalized as FacilityTypeIconName : "wrench";
}

export function FacilityTypeIcon({ icon, className, style }: { icon?: string | null; className?: string; style?: CSSProperties }) {
  const match = FACILITY_TYPE_ICON_OPTIONS.find(option => option.value === normalizeFacilityTypeIcon(icon)) ?? FACILITY_TYPE_ICON_OPTIONS[0];
  const Icon = match.Icon;
  return <Icon className={className} style={style} />;
}

export function facilityTypeByName(types: ServiceFacilityType[] | undefined, name?: string | null) {
  if (!name) return undefined;
  return (types ?? []).find(type => type.name.toLowerCase() === String(name).trim().toLowerCase());
}
