// Fixed, code-defined permission catalog — not admin-editable. This list
// only changes when a new feature ships.

export const PERMISSION_CATALOG = [
  { key: "assets.view", label: "View assets", category: "Assets" },
  { key: "assets.edit", label: "Add/edit assets", category: "Assets" },
  { key: "assets.delete", label: "Delete assets", category: "Assets" },
  { key: "meters.log", label: "Log meter readings", category: "Meters" },
  { key: "meters.edit", label: "Edit/delete meter readings", category: "Meters" },
  { key: "schedules.manage", label: "Manage maintenance schedules", category: "Maintenance" },
  { key: "service.log", label: "Log service events", category: "Service" },
  { key: "service.edit", label: "Edit/delete service events & line items", category: "Service" },
  { key: "inventory.view", label: "View inventory", category: "Inventory" },
  { key: "inventory.manage", label: "Manage inventory items & stock", category: "Inventory" },
  { key: "fleets.manage_settings", label: "Manage fleet/equipment/fuel-type settings", category: "Administration" },
  { key: "users.manage", label: "Manage users & fleet access", category: "Administration" },
  { key: "roles.manage", label: "Manage fleet roles & permissions", category: "Administration" },
  { key: "data.export", label: "Export/print reports", category: "Reports" },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];
export type PermissionCatalogEntry = { key: string; label: string; category: string };

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_CATALOG.map(p => p.key);

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}
