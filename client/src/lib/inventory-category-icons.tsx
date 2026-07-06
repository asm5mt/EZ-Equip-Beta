import { Battery, CircleDot, Droplet, Filter, Package, Waves, Wrench } from "lucide-react";
import type { CSSProperties } from "react";

export const INVENTORY_ICON_OPTIONS = [
  { value: "package", label: "Package", Icon: Package },
  { value: "droplet", label: "Oil / Lubricant", Icon: Droplet },
  { value: "filter", label: "Filter", Icon: Filter },
  { value: "waves", label: "Fluid", Icon: Waves },
  { value: "wrench", label: "Part", Icon: Wrench },
  { value: "battery", label: "Battery", Icon: Battery },
  { value: "circle-dot", label: "Other", Icon: CircleDot },
] as const;

export type InventoryIconName = typeof INVENTORY_ICON_OPTIONS[number]["value"];

export function normalizeInventoryIcon(value?: string | null): InventoryIconName {
  const normalized = String(value ?? "").trim().toLowerCase();
  return INVENTORY_ICON_OPTIONS.some(option => option.value === normalized) ? normalized as InventoryIconName : "package";
}

export function InventoryCategoryIcon({ icon, className, style }: { icon?: string | null; className?: string; style?: CSSProperties }) {
  const match = INVENTORY_ICON_OPTIONS.find(option => option.value === normalizeInventoryIcon(icon)) ?? INVENTORY_ICON_OPTIONS[0];
  const Icon = match.Icon;
  return <Icon className={className} style={style} />;
}
