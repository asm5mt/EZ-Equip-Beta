import type { LucideIcon } from "lucide-react";
import {
  Ambulance,
  Bike,
  Boxes,
  Bus,
  Car,
  Caravan,
  CircleGauge,
  Cog,
  Container,
  Drill,
  Forklift,
  Fuel,
  Hammer,
  HardHat,
  Leaf,
  Package,
  PackageCheck,
  Pickaxe,
  Plane,
  PlugZap,
  Rocket,
  Sailboat,
  Settings,
  Shield,
  ShipWheel,
  Snowflake,
  Tractor,
  Train,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";

export type EquipmentIconKey =
  | "vehicle"
  | "truck"
  | "trailer"
  | "tractor"
  | "generator"
  | "atv"
  | "snowmobile"
  | "lawn"
  | "equipment"
  | "wrench"
  | string;

export const EQUIPMENT_ICON_OPTIONS: Array<{ value: EquipmentIconKey; label: string; Icon: LucideIcon }> = [
  { value: "vehicle", label: "Vehicle", Icon: Car },
  { value: "car", label: "Car", Icon: Car },
  { value: "truck", label: "Truck", Icon: Truck },
  { value: "trailer", label: "Trailer", Icon: Truck },
  { value: "tractor", label: "Tractor", Icon: Tractor },
  { value: "generator", label: "Generator", Icon: Zap },
  { value: "atv", label: "ATV / UTV", Icon: Bike },
  { value: "snowmobile", label: "Snowmobile", Icon: Snowflake },
  { value: "lawn", label: "Lawn Equipment", Icon: Leaf },
  { value: "equipment", label: "Equipment", Icon: Package },
  { value: "wrench", label: "Service Tool", Icon: Wrench },
  { value: "ambulance", label: "Ambulance", Icon: Ambulance },
  { value: "boat", label: "Boat", Icon: Sailboat },
  { value: "boxes", label: "Boxes", Icon: Boxes },
  { value: "bus", label: "Bus", Icon: Bus },
  { value: "caravan", label: "RV / Caravan", Icon: Caravan },
  { value: "cog", label: "Cog", Icon: Cog },
  { value: "container", label: "Container", Icon: Container },
  { value: "drill", label: "Drill", Icon: Drill },
  { value: "forklift", label: "Forklift", Icon: Forklift },
  { value: "fuel", label: "Fuel", Icon: Fuel },
  { value: "gauge", label: "Gauge", Icon: CircleGauge },
  { value: "hammer", label: "Hammer", Icon: Hammer },
  { value: "hard-hat", label: "Hard Hat", Icon: HardHat },
  { value: "package-check", label: "Package Check", Icon: PackageCheck },
  { value: "pickaxe", label: "Pickaxe", Icon: Pickaxe },
  { value: "plane", label: "Plane", Icon: Plane },
  { value: "plug-zap", label: "Plug Zap", Icon: PlugZap },
  { value: "rocket", label: "Rocket", Icon: Rocket },
  { value: "settings", label: "Settings", Icon: Settings },
  { value: "shield", label: "Shield", Icon: Shield },
  { value: "ship-wheel", label: "Ship Wheel", Icon: ShipWheel },
  { value: "train", label: "Train", Icon: Train },
];

const ICONS = new Map(EQUIPMENT_ICON_OPTIONS.map(option => [option.value, option.Icon]));

export function normalizeEquipmentIcon(value?: string | null): EquipmentIconKey {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "car" || normalized === "auto" || normalized === "automobile") return "vehicle";
  if (normalized === "utv" || normalized === "quad") return "atv";
  if (normalized === "mower" || normalized === "lawn equipment") return "lawn";
  if (ICONS.has(normalized as EquipmentIconKey)) return normalized as EquipmentIconKey;
  return "equipment";
}

export function EquipmentTypeIcon({
  icon,
  className = "size-3",
}: {
  icon?: string | null;
  className?: string;
}) {
  const Icon = ICONS.get(normalizeEquipmentIcon(icon)) ?? Package;
  return <Icon className={className} aria-hidden="true" />;
}
