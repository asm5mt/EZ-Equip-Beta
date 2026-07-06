import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, ChevronRight, PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import type { InventoryCategory, InventoryCategoryField, InventoryItem } from "@shared/schema";
import { useAppContext } from "@/lib/app-context";
import { formatNumber, formatCurrency } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { tintedBadgeStyle } from "@/lib/badges";
import { InventoryCategoryIcon } from "@/lib/inventory-category-icons";
import { fieldsForCategory, inventoryItemHighlightBadge, inventoryItemTitle } from "@/lib/inventory-display";

export default function Inventory() {
  const { fleet, canEdit } = useAppContext();
  const { toast } = useToast();
  const fleetId = fleet?.id;
  const fleetCurrency = fleet?.currency ?? "USD";
  const itemsQ = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items", { fleetId }],
    enabled: !!fleetId,
  });
  const categoriesQ = useQuery<InventoryCategory[]>({
    queryKey: ["/api/inventory-categories", { fleetId }],
    enabled: !!fleetId,
  });
  const fieldsQ = useQuery<InventoryCategoryField[]>({
    queryKey: ["/api/inventory-category-fields", { fleetId }],
    enabled: !!fleetId,
  });
  const items = itemsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const allFields = fieldsQ.data ?? [];

  const isLow = (i: InventoryItem) =>
    i.lowStockAlert && i.lowStockQuantity != null && i.onHand <= i.lowStockQuantity;
  const needsReorder = (i: InventoryItem) =>
    i.reorderReminder && i.reorderPoint != null && i.onHand <= i.reorderPoint;

  const [pendingDeleteItem, setPendingDeleteItem] = useState<InventoryItem | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/inventory-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Inventory item deleted" });
      setPendingDeleteItem(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const grouped = items.reduce<Record<string, InventoryItem[]>>((acc, i) => {
    const k = i.category || "uncategorized";
    (acc[k] ||= []).push(i);
    return acc;
  }, {});

  const categoryByName = new Map(categories.map(c => [c.name.trim().toLowerCase(), c]));
  const groupEntries = Object.entries(grouped).sort(([aName], [bName]) => {
    const aCat = categoryByName.get(aName.trim().toLowerCase());
    const bCat = categoryByName.get(bName.trim().toLowerCase());
    if (aCat && bCat) return aCat.sortOrder - bCat.sortOrder || aCat.name.localeCompare(bCat.name);
    if (aCat) return -1;
    if (bCat) return 1;
    return aName.localeCompare(bName);
  });

  return (
    <AppShell title="Inventory" subtitle="Track stocked and ad-hoc consumables, fluids, filters, and parts">
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="button-back-dashboard">
                <ArrowLeft className="size-4 mr-1.5" /> Back
              </Button>
            </Link>
            {canEdit ? (
              <Link href="/inventory/new">
                <Button data-testid="button-add-inventory"><Plus className="size-4 mr-1.5" /> Add Item</Button>
              </Link>
            ) : (
              <Button disabled data-testid="button-add-inventory"><Plus className="size-4 mr-1.5" /> Add Item</Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Add a tracked item once, then use Restock to add inventory by container size.</p>
        </div>

        <Card className="p-5">
          {itemsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!itemsQ.isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No inventory yet. Click <span className="font-medium">Add Item</span> to start.</p>
          )}
          <div className="space-y-3">
            {groupEntries.map(([cat, list]) => (
              <CategoryGroup
                key={cat}
                categoryName={cat}
                category={categoryByName.get(cat.trim().toLowerCase())}
                items={list}
                categoryFields={fieldsForCategory(allFields, categories, cat)}
                fleetCurrency={fleetCurrency}
                canEdit={canEdit}
                isLow={isLow}
                needsReorder={needsReorder}
                onDelete={setPendingDeleteItem}
              />
            ))}
          </div>
        </Card>
      </div>

      <AlertDialog open={pendingDeleteItem != null} onOpenChange={open => { if (!open) setPendingDeleteItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDeleteItem?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the inventory item from the active list, but existing service history line items remain on their work orders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteItem(null)} data-testid="button-cancel-delete-inventory">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => pendingDeleteItem && deleteMut.mutate(pendingDeleteItem.id)}
              data-testid="button-confirm-delete-inventory"
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function CategoryGroup({ categoryName, category, items, categoryFields, fleetCurrency, canEdit, isLow, needsReorder, onDelete }: {
  categoryName: string;
  category: InventoryCategory | undefined;
  items: InventoryItem[];
  categoryFields: InventoryCategoryField[];
  fleetCurrency: string;
  canEdit: boolean;
  isLow: (i: InventoryItem) => boolean;
  needsReorder: (i: InventoryItem) => boolean;
  onDelete: (item: InventoryItem) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-2 py-2 px-3 rounded-md border border-border bg-muted/30 hover:bg-muted/50 text-left"
          data-testid={`category-header-${categoryName}`}
        >
          <ChevronRight className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
          {category ? (
            <Badge variant="outline" className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide" style={tintedBadgeStyle(category.color)}>
              <InventoryCategoryIcon icon={category.icon} className="size-3" />
              {category.name}
            </Badge>
          ) : (
            <span className="font-semibold uppercase tracking-[0.14em] text-xs">{categoryName}</span>
          )}
          <span className="text-xs text-muted-foreground">&bull; {items.length} {items.length === 1 ? "item" : "items"}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <div className="grid gap-2">
          {items.map(i => (
            <ItemRow
              key={i.id}
              item={i}
              categoryFields={categoryFields}
              fleetCurrency={fleetCurrency}
              canEdit={canEdit}
              isLow={isLow(i)}
              needsReorder={needsReorder(i)}
              onDelete={() => onDelete(i)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ItemRow({ item, categoryFields, fleetCurrency, canEdit, isLow, needsReorder, onDelete }: {
  item: InventoryItem;
  categoryFields: InventoryCategoryField[];
  fleetCurrency: string;
  canEdit: boolean;
  isLow: boolean;
  needsReorder: boolean;
  onDelete: () => void;
}) {
  const title = inventoryItemTitle(item, categoryFields);
  const highlightBadge = inventoryItemHighlightBadge(item, categoryFields);

  return (
    <div className="p-3 rounded-md border border-border" data-testid={`card-inventory-${item.id}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex items-start gap-2">
          {(isLow || needsReorder) && (
            <div className="flex flex-col gap-1 shrink-0 pt-0.5">
              {isLow && <Badge variant="outline" className="text-[10px] tracking-wide status-warn">Low Stock</Badge>}
              {needsReorder && <Badge variant="outline" className="text-[10px] tracking-wide status-overdue">Reorder</Badge>}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-medium truncate" data-testid={`text-inventory-title-${item.id}`}>{title}</div>
              {highlightBadge && (
                <Badge variant="outline" className="text-[10px] tracking-wide" data-testid={`badge-key-spec-${item.id}`}>
                  {highlightBadge.label}: {highlightBadge.value}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
              {item.partNumber && <span>P/N {item.partNumber}</span>}
              {item.sku && <span>SKU {item.sku}</span>}
              {!item.lowStockAlert && !item.reorderReminder && <Badge variant="outline" className="text-[10px] tracking-wide">No alerts</Badge>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-base font-semibold num ${isLow ? "text-[hsl(var(--status-overdue))]" : ""}`}>
            {formatNumber(item.onHand, { maximumFractionDigits: 2 })} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {item.lowStockAlert && item.lowStockQuantity != null && <>Low &le; {formatNumber(item.lowStockQuantity)}</>}
            {item.reorderReminder && item.reorderPoint != null && <> &bull; Reorder &le; {formatNumber(item.reorderPoint)}</>}
            {item.costTracking && item.unitCost != null && <> &bull; {formatCurrency(item.unitCost, fleetCurrency)}</>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canEdit ? (
            <Link href={`/inventory/${item.id}/add-stock`}>
              <Button size="sm" variant="secondary" data-testid={`button-restock-inventory-${item.id}`}>
                <PackagePlus className="size-4 mr-1.5" /> Restock
              </Button>
            </Link>
          ) : (
            <Button size="sm" variant="secondary" disabled data-testid={`button-restock-inventory-${item.id}`}>
              <PackagePlus className="size-4 mr-1.5" /> Restock
            </Button>
          )}
          {canEdit ? (
            <Link href={`/inventory/${item.id}/edit`}>
              <Button variant="ghost" size="icon" data-testid={`button-edit-inventory-${item.id}`} aria-label={`Edit ${title}`}>
                <Pencil className="size-4" />
              </Button>
            </Link>
          ) : (
            <Button variant="ghost" size="icon" disabled data-testid={`button-edit-inventory-${item.id}`} aria-label={`Edit ${title}`}>
              <Pencil className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            disabled={!canEdit}
            onClick={onDelete}
            data-testid={`button-delete-inventory-${item.id}`}
            aria-label={`Delete ${title}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
