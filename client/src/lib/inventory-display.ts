import type { InventoryCategory, InventoryCategoryField, InventoryItem } from "@shared/schema";

function parseCustomFields(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Fields on `inventoryCategoryFields` are keyed by categoryId, but items only
// store their category as a free-form name string — this is the one place
// that bridges the two, so every caller resolves fields the same way.
export function fieldsForCategory(allFields: InventoryCategoryField[], categories: InventoryCategory[], categoryName: string | null | undefined): InventoryCategoryField[] {
  if (!categoryName) return [];
  const category = categories.find(c => c.name.trim().toLowerCase() === categoryName.trim().toLowerCase());
  if (!category) return [];
  return allFields.filter(f => f.categoryId === category.id);
}

type TitleSourceItem = Pick<InventoryItem, "displayName" | "partNumber" | "customFields" | "name">;
type BadgeSourceItem = Pick<InventoryItem, "customFields">;

export function getCategoryFieldValue(item: BadgeSourceItem, categoryFields: InventoryCategoryField[], fieldName: string): string | null {
  const field = categoryFields.find(f => f.name.trim().toLowerCase() === fieldName.trim().toLowerCase());
  if (!field) return null;
  const values = parseCustomFields(item.customFields);
  const value = values[field.id]?.trim();
  return value ? value : null;
}

export function inventoryItemTitle(item: TitleSourceItem, categoryFields: InventoryCategoryField[]): string {
  if (item.displayName?.trim()) return item.displayName.trim();
  const brand = getCategoryFieldValue(item, categoryFields, "Brand");
  if (brand) return item.partNumber ? `${brand} ${item.partNumber}` : brand;
  if (item.partNumber) return item.partNumber;
  return item.name;
}

export function inventoryItemHighlightBadge(item: BadgeSourceItem, categoryFields: InventoryCategoryField[]): { label: string; value: string } | null {
  const field = categoryFields.find(f => f.highlightField);
  if (!field) return null;
  const values = parseCustomFields(item.customFields);
  const value = values[field.id]?.trim();
  if (!value) return null;
  return { label: field.name, value };
}

// Line-item-picker-only: items in the same category that share a key-spec
// value and have no nickname set need a distinguishing part number, since
// their titles alone would otherwise be indistinguishable in the picker.
export function computeKeySpecCollisions(items: InventoryItem[], allFields: InventoryCategoryField[], categories: InventoryCategory[]): Set<number> {
  const groups = new Map<string, InventoryItem[]>();
  for (const item of items) {
    if (item.displayName?.trim()) continue;
    const fields = fieldsForCategory(allFields, categories, item.category);
    const badge = inventoryItemHighlightBadge(item, fields);
    if (!badge) continue;
    const key = `${item.category ?? ""}::${badge.value.toLowerCase()}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const colliding = new Set<number>();
  for (const group of Array.from(groups.values())) {
    if (group.length > 1) {
      for (const item of group) colliding.add(item.id);
    }
  }
  return colliding;
}
