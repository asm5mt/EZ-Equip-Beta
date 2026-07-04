import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, PackagePlus, Pencil, Trash2 } from "lucide-react";
import type { InventoryItem } from "@shared/schema";
import { useAppContext } from "@/lib/app-context";
import { formatNumber, formatCurrency } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Inventory() {
  const { fleet, canEdit } = useAppContext();
  const { toast } = useToast();
  const fleetId = fleet?.id;
  const fleetCurrency = fleet?.currency ?? "USD";
  const itemsQ = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items", { fleetId }],
    enabled: !!fleetId,
  });
  const items = itemsQ.data ?? [];

  const isLow = (i: InventoryItem) =>
    i.lowStockAlert && i.lowStockQuantity != null && i.onHand <= i.lowStockQuantity;
  const needsReorder = (i: InventoryItem) =>
    i.reorderReminder && i.reorderPoint != null && i.onHand <= i.reorderPoint;

  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/inventory-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Inventory item deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const handleDelete = (item: InventoryItem) => {
    if (!window.confirm(`Delete ${item.name}? This removes the inventory item from the active list, but existing service history line items remain on their work orders.`)) return;
    deleteMut.mutate(item.id);
  };

  const grouped = items.reduce<Record<string, InventoryItem[]>>((acc, i) => {
    const k = i.category || "uncategorized";
    (acc[k] ||= []).push(i);
    return acc;
  }, {});

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
          <p className="text-sm text-muted-foreground">Add a tracked item once, then use Add Inventory to restock by container size.</p>
        </div>

        <Card className="p-5">
          {itemsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!itemsQ.isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No inventory yet. Click <span className="font-medium">Add Item</span> to start.</p>
          )}
          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat}>
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-2">{cat}</div>
                <div className="grid gap-2">
                  {list.map(i => (
                    <div
                      key={i.id}
                      className="p-3 rounded-md border border-border"
                      data-testid={`card-inventory-${i.id}`}
                    >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-medium">{i.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                              {i.partNumber && <span>P/N {i.partNumber}</span>}
                              {i.sku && <span>SKU {i.sku}</span>}
                              {!i.lowStockAlert && !i.reorderReminder && <Badge variant="outline" className="text-[10px] tracking-wide">No alerts</Badge>}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-base font-semibold num ${isLow(i) ? "text-[hsl(var(--status-overdue))]" : ""}`}>
                              {formatNumber(i.onHand, { maximumFractionDigits: 2 })} <span className="text-xs font-normal text-muted-foreground">{i.unit}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {i.lowStockAlert && i.lowStockQuantity != null && <>Low ≤ {formatNumber(i.lowStockQuantity)}</>}
                              {i.reorderReminder && i.reorderPoint != null && <> &bull; Reorder ≤ {formatNumber(i.reorderPoint)}</>}
                              {i.costTracking && i.unitCost != null && <> &bull; {formatCurrency(i.unitCost, fleetCurrency)}</>}
                            </div>
                            <div className="flex justify-end gap-1 flex-wrap mt-1">
                              {isLow(i) && (
                                <Badge variant="outline" className="text-[10px] tracking-wide status-warn">Low Stock</Badge>
                              )}
                              {needsReorder(i) && (
                                <Badge variant="outline" className="text-[10px] tracking-wide status-overdue">Reorder</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {canEdit ? (
                              <Link href={`/inventory/${i.id}/add-stock`}>
                                <Button size="sm" variant="secondary" data-testid={`button-add-stock-${i.id}`}>
                                  <PackagePlus className="size-4 mr-1.5" /> Add Inventory
                                </Button>
                              </Link>
                            ) : (
                              <Button size="sm" variant="secondary" disabled data-testid={`button-add-stock-${i.id}`}>
                                <PackagePlus className="size-4 mr-1.5" /> Add Inventory
                              </Button>
                            )}
                            {canEdit ? (
                              <Link href={`/inventory/${i.id}/edit`}>
                                <Button size="sm" variant="outline" data-testid={`button-edit-inventory-${i.id}`}>
                                  <Pencil className="size-4 mr-1.5" /> Edit
                                </Button>
                              </Link>
                            ) : (
                              <Button size="sm" variant="outline" disabled data-testid={`button-edit-inventory-${i.id}`}>
                                <Pencil className="size-4 mr-1.5" /> Edit
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canEdit || deleteMut.isPending}
                              onClick={() => handleDelete(i)}
                              data-testid={`button-delete-inventory-${i.id}`}
                              aria-label={`Delete ${i.name}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
