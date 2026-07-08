import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EditablePageActions } from "@/components/EditablePageActions";
import {
  ArrowLeft, ChevronDown, ChevronRight, ChevronUp, PackagePlus, Pencil, Plus, Settings2, Star,
  Trash2, Type as TypeIcon,
} from "lucide-react";
import type { InventoryCategory, InventoryCategoryField, InventoryItem } from "@shared/schema";
import { useAppContext } from "@/lib/app-context";
import { formatNumber, formatCurrency } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { badgeColorValue, tintedBadgeStyle } from "@/lib/badges";
import { INVENTORY_ICON_OPTIONS, InventoryCategoryIcon, normalizeInventoryIcon } from "@/lib/inventory-category-icons";
import { fieldsForCategory, inventoryItemHighlightBadge, inventoryItemTitle } from "@/lib/inventory-display";

const FIELD_TYPE_OPTIONS = [
  ["text", "Text"],
  ["number", "Numeric"],
  ["date", "Date"],
  ["boolean", "Yes / No"],
  ["currency", "Currency"],
  ["url", "URL"],
];

const INVENTORY_TYPE_COMMON_ICONS = ["package", "droplet", "filter", "wrench", "battery"];

export default function Inventory() {
  const { fleet, canEdit, canAdmin } = useAppContext();
  const { toast } = useToast();
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
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
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setManageTypesOpen(true)} data-testid="button-manage-inventory-types">
                <Settings2 className="size-4 mr-1.5" /> Manage Types
              </Button>
              {canEdit ? (
                <Link href="/inventory/new">
                  <Button data-testid="button-add-inventory"><Plus className="size-4 mr-1.5" /> Add Item</Button>
                </Link>
              ) : (
                <Button disabled data-testid="button-add-inventory"><Plus className="size-4 mr-1.5" /> Add Item</Button>
              )}
            </div>
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

      <ManageInventoryTypesDialog
        open={manageTypesOpen}
        onOpenChange={setManageTypesOpen}
        categories={categories}
        fields={allFields}
        fleetId={fleetId}
        canAdmin={canAdmin}
      />
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

function ManageInventoryTypesDialog({ open, onOpenChange, categories, fields, fleetId, canAdmin }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: InventoryCategory[];
  fields: InventoryCategoryField[];
  fleetId: number | undefined;
  canAdmin: boolean;
}) {
  const { toast } = useToast();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categoryColor, setCategoryColor] = useState("#64748b");
  const [categoryIcon, setCategoryIcon] = useState("package");
  const [fieldDialogCategoryId, setFieldDialogCategoryId] = useState<number | null>(null);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");

  const [draftCategories, setDraftCategories] = useState<InventoryCategory[]>(categories);
  const [draftFields, setDraftFields] = useState<InventoryCategoryField[]>(fields);

  useEffect(() => {
    setDraftCategories(categories);
  }, [categories]);
  useEffect(() => {
    setDraftFields(fields);
  }, [fields]);

  const onError = (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" });

  const createCategory = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/inventory-categories", {
      fleetId,
      name: categoryName.trim(),
      description: categoryDescription.trim() || null,
      active: true,
      sortOrder: categories.length,
      color: categoryColor,
      icon: normalizeInventoryIcon(categoryIcon),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-categories"] });
      setCategoryName(""); setCategoryDescription(""); setCategoryColor("#64748b"); setCategoryIcon("package");
      setAddCategoryOpen(false);
    },
    onError,
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<InventoryCategory> }) => apiRequest("PATCH", `/api/inventory-categories/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/inventory-categories"] }),
    onError,
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/inventory-categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-category-fields"] });
    },
    onError,
  });

  const createField = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/inventory-category-fields", {
      categoryId: fieldDialogCategoryId,
      name: fieldName.trim(),
      fieldType,
      required: false,
      sortOrder: fields.filter(f => f.categoryId === fieldDialogCategoryId).length,
      highlightField: false,
      inTitle: false,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-category-fields"] });
      setFieldName(""); setFieldType("text"); setFieldDialogCategoryId(null);
    },
    onError,
  });

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<InventoryCategoryField> }) => apiRequest("PATCH", `/api/inventory-category-fields/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/inventory-category-fields"] }),
    onError,
  });

  const deleteField = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/inventory-category-fields/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/inventory-category-fields"] }),
    onError,
  });

  const moveCategory = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    updateCategory.mutate({ id: categories[index].id, patch: { sortOrder: targetIndex } });
    updateCategory.mutate({ id: categories[targetIndex].id, patch: { sortOrder: index } });
  };

  const moveField = (categoryFields: InventoryCategoryField[], index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categoryFields.length) return;
    updateField.mutate({ id: categoryFields[index].id, patch: { sortOrder: targetIndex } });
    updateField.mutate({ id: categoryFields[targetIndex].id, patch: { sortOrder: index } });
  };

  const updateDraftCategory = (id: number, patch: Partial<InventoryCategory>) => {
    setDraftCategories(cats => cats.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const updateDraftField = (id: number, patch: Partial<InventoryCategoryField>) => {
    setDraftFields(flds => flds.map(f => f.id === id ? { ...f, ...patch } : f));
  };

  const setDraftKeySpec = (categoryId: number, fieldId: number) => {
    setDraftFields(flds => flds.map(f => f.categoryId === categoryId ? { ...f, highlightField: f.id === fieldId } : f));
  };

  const hasChanges = draftCategories.some(dc => {
    const original = categories.find(c => c.id === dc.id);
    return !original
      || dc.name !== original.name
      || (dc.description ?? "") !== (original.description ?? "")
      || dc.color !== original.color
      || normalizeInventoryIcon(dc.icon) !== normalizeInventoryIcon(original.icon);
  }) || draftFields.some(df => {
    const original = fields.find(f => f.id === df.id);
    return !original
      || df.name !== original.name
      || df.fieldType !== original.fieldType
      || df.required !== original.required
      || df.inTitle !== original.inTitle
      || df.highlightField !== original.highlightField;
  });

  const saveTypes = useMutation({
    mutationFn: async () => {
      const work: Promise<unknown>[] = [];
      for (const dc of draftCategories) {
        const original = categories.find(c => c.id === dc.id);
        if (!original) continue;
        const patch: Partial<InventoryCategory> = {};
        if (dc.name !== original.name) patch.name = dc.name;
        if ((dc.description ?? "") !== (original.description ?? "")) patch.description = dc.description;
        if (dc.color !== original.color) patch.color = dc.color;
        if (normalizeInventoryIcon(dc.icon) !== normalizeInventoryIcon(original.icon)) patch.icon = normalizeInventoryIcon(dc.icon);
        if (Object.keys(patch).length) work.push(apiRequest("PATCH", `/api/inventory-categories/${dc.id}`, patch));
      }
      for (const df of draftFields) {
        const original = fields.find(f => f.id === df.id);
        if (!original) continue;
        const patch: Partial<InventoryCategoryField> = {};
        if (df.name !== original.name) patch.name = df.name;
        if (df.fieldType !== original.fieldType) patch.fieldType = df.fieldType;
        if (df.required !== original.required) patch.required = df.required;
        if (df.inTitle !== original.inTitle) patch.inTitle = df.inTitle;
        if (df.highlightField !== original.highlightField) patch.highlightField = df.highlightField;
        if (Object.keys(patch).length) work.push(apiRequest("PATCH", `/api/inventory-category-fields/${df.id}`, patch));
      }
      await Promise.all(work);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-category-fields"] });
      toast({ title: "Inventory types saved" });
      onOpenChange(false);
    },
    onError,
  });

  const cancelDraft = () => {
    setDraftCategories(categories);
    setDraftFields(fields);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Manage Inventory Types</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <SectionHeader
              label="Inventory Types"
              description="Create fleet-specific inventory categories and optional fields that appear on inventory items."
            />
            <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto" disabled={!canAdmin} data-testid="button-open-add-inventory-category">
                  <Plus className="size-4 mr-1.5" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Add Inventory Type</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="oil, filter, battery…" data-testid="input-new-inventory-category" />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input value={categoryDescription} onChange={e => setCategoryDescription(e.target.value)} placeholder="Optional note shown to admins" data-testid="input-new-inventory-category-description" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Color</Label>
                      <Input type="color" value={categoryColor} onChange={e => setCategoryColor(e.target.value)} data-testid="input-new-inventory-category-color" />
                    </div>
                    <InventoryIconSelect value={categoryIcon} onChange={setCategoryIcon} testid="select-new-inventory-category-icon" />
                  </div>
                  <div className="rounded-md border border-border bg-muted/50 p-3">
                    <span className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-medium" style={tintedBadgeStyle(categoryColor)}>
                      <InventoryCategoryIcon icon={categoryIcon} className="size-4" style={{ color: categoryColor }} />
                      {categoryName.trim() || "Inventory Type"}
                    </span>
                  </div>
                  <EditablePageActions
                    showBack={false}
                    hasChanges={Boolean(categoryName.trim() || categoryDescription.trim())}
                    isSaving={createCategory.isPending}
                    canSave={!!canAdmin && !!fleetId && !!categoryName.trim()}
                    onCancel={() => setAddCategoryOpen(false)}
                    onSave={() => createCategory.mutate()}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <EditablePageActions
            showBack={false}
            hasChanges={hasChanges}
            isSaving={saveTypes.isPending}
            canSave={!!canAdmin && hasChanges}
            onCancel={cancelDraft}
            onSave={() => saveTypes.mutate()}
          />

          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Configured Inventory Types</div>
            <Badge variant="outline" className="ml-auto text-[10px] tracking-wide" data-testid="badge-inventory-category-count">{draftCategories.length} total</Badge>
          </div>

          <div className="grid gap-2">
            {draftCategories.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="empty-inventory-categories">
                No inventory types are configured yet. Inventory items can still use free-form categories until you add saved types.
              </div>
            )}
            {draftCategories.map((category, categoryIndex) => {
              const categoryFields = draftFields.filter(f => f.categoryId === category.id);
              return (
                <div key={category.id} className="rounded-md border border-border p-3 space-y-3" data-testid={`row-inventory-category-${category.id}`}>
                  <div className="grid grid-cols-1 lg:grid-cols-[140px_minmax(160px,0.6fr)_minmax(200px,1fr)_auto_auto_auto] gap-2 items-center">
                    <InventoryCategoryStylePopover
                      category={category}
                      disabled={!canAdmin}
                      onChange={patch => updateDraftCategory(category.id, patch)}
                    />
                    <Input
                      className="h-9"
                      value={category.name}
                      disabled={!canAdmin}
                      onChange={e => updateDraftCategory(category.id, { name: e.target.value })}
                      data-testid={`input-inventory-category-name-${category.id}`}
                    />
                    <Input
                      className="h-9"
                      value={category.description ?? ""}
                      placeholder="Description"
                      disabled={!canAdmin}
                      onChange={e => updateDraftCategory(category.id, { description: e.target.value })}
                      data-testid={`input-inventory-category-description-${category.id}`}
                    />
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9" disabled={!canAdmin || categoryIndex === 0} onClick={() => moveCategory(categoryIndex, -1)} data-testid={`button-move-up-inventory-category-${category.id}`} aria-label="Move category up">
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9" disabled={!canAdmin || categoryIndex === draftCategories.length - 1} onClick={() => moveCategory(categoryIndex, 1)} data-testid={`button-move-down-inventory-category-${category.id}`} aria-label="Move category down">
                        <ChevronDown className="size-4" />
                      </Button>
                    </div>
                    <Button variant="secondary" size="sm" disabled={!canAdmin} onClick={() => setFieldDialogCategoryId(category.id)} data-testid={`button-open-add-inventory-field-${category.id}`}>
                      <Plus className="size-4 mr-1.5" /> Add Field
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9" disabled={!canAdmin} onClick={() => deleteCategory.mutate(category.id)} data-testid={`button-delete-inventory-category-${category.id}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Fields</div>
                    <Badge variant="outline" className="text-[10px] tracking-wide">{categoryFields.length} total</Badge>
                  </div>
                  {categoryFields.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">No custom fields. Items in this category will use the standard inventory form only.</div>
                  ) : (
                    <div className="grid gap-2">
                      {categoryFields.map((field, fieldIndex) => (
                        <div key={field.id} className="grid grid-cols-1 md:grid-cols-[minmax(150px,1fr)_120px_100px_auto_auto_auto_40px] gap-2 items-center rounded-md bg-muted/45 px-2 py-2" data-testid={`row-inventory-field-${field.id}`}>
                          <Input
                            className="h-8"
                            value={field.name}
                            disabled={!canAdmin}
                            onChange={e => updateDraftField(field.id, { name: e.target.value })}
                            data-testid={`input-inventory-field-name-${field.id}`}
                          />
                          <Select value={field.fieldType} onValueChange={value => updateDraftField(field.id, { fieldType: value })} disabled={!canAdmin}>
                            <SelectTrigger className="h-8" data-testid={`select-inventory-field-type-${field.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>{FIELD_TYPE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select value={field.required ? "required" : "optional"} onValueChange={value => updateDraftField(field.id, { required: value === "required" })} disabled={!canAdmin}>
                            <SelectTrigger className="h-8" data-testid={`select-inventory-field-required-${field.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="optional">Optional</SelectItem>
                              <SelectItem value="required">Required</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canAdmin || fieldIndex === 0} onClick={() => moveField(categoryFields, fieldIndex, -1)} data-testid={`button-move-up-inventory-field-${field.id}`} aria-label="Move field up">
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canAdmin || fieldIndex === categoryFields.length - 1} onClick={() => moveField(categoryFields, fieldIndex, 1)} data-testid={`button-move-down-inventory-field-${field.id}`} aria-label="Move field down">
                              <ChevronDown className="size-4" />
                            </Button>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${field.inTitle ? "text-[hsl(var(--primary))]" : ""}`}
                                disabled={!canAdmin}
                                onClick={() => updateDraftField(field.id, { inTitle: !field.inTitle })}
                                data-testid={`button-in-title-inventory-field-${field.id}`}
                                aria-label="Include in fallback title"
                                aria-pressed={field.inTitle}
                              >
                                <TypeIcon className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              In Title — include this field's value in the fallback title (used when an item has no nickname). Multiple fields can be checked; their values join in this field order.
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${field.highlightField ? "text-[hsl(var(--primary))]" : ""}`}
                                disabled={!canAdmin}
                                onClick={() => setDraftKeySpec(category.id, field.id)}
                                data-testid={`button-key-spec-inventory-field-${field.id}`}
                                aria-label="Set as key spec"
                                aria-pressed={field.highlightField}
                              >
                                <Star className="size-4" fill={field.highlightField ? "currentColor" : "none"} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              Key spec — shown as a highlight badge on this category's items. Only one field per category can be the key spec.
                            </TooltipContent>
                          </Tooltip>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canAdmin} onClick={() => deleteField.mutate(field.id)} data-testid={`button-delete-inventory-field-${field.id}`}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Dialog open={fieldDialogCategoryId != null} onOpenChange={open => {
          if (!open) {
            setFieldDialogCategoryId(null);
            setFieldName("");
            setFieldType("text");
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Field</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Field Name</Label>
                <Input value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder="Viscosity" data-testid="input-new-inventory-field-name" />
              </div>
              <div>
                <Label>Field Type</Label>
                <Select value={fieldType} onValueChange={setFieldType}>
                  <SelectTrigger data-testid="select-new-inventory-field-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_TYPE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <EditablePageActions
                showBack={false}
                hasChanges={Boolean(fieldName.trim())}
                isSaving={createField.isPending}
                canSave={!!canAdmin && !!fieldName.trim()}
                onCancel={() => setFieldDialogCategoryId(null)}
                onSave={() => createField.mutate()}
              />
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeader({ label, description }: { label: string; description: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

function InventoryIconSelect({ value, onChange, testid }: {
  value: string;
  onChange: (v: string) => void;
  testid: string;
}) {
  return (
    <div>
      <Label>Icon</Label>
      <Select value={normalizeInventoryIcon(value)} onValueChange={onChange}>
        <SelectTrigger data-testid={testid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INVENTORY_ICON_OPTIONS.map(option => (
            <SelectItem key={option.value} value={option.value}>
              <span className="inline-flex items-center gap-2">
                <option.Icon className="size-4" />
                {option.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function InventoryCategoryStylePopover({ category, disabled, onChange }: {
  category: InventoryCategory;
  disabled: boolean;
  onChange: (patch: Partial<InventoryCategory>) => void;
}) {
  const [iconSearch, setIconSearch] = useState("");
  const filteredIcons = INVENTORY_ICON_OPTIONS.filter(option =>
    option.label.toLowerCase().includes(iconSearch.trim().toLowerCase())
    || String(option.value).toLowerCase().includes(iconSearch.trim().toLowerCase())
  );
  const commonIcons = INVENTORY_ICON_OPTIONS.filter(option => INVENTORY_TYPE_COMMON_ICONS.includes(option.value));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex w-full max-w-[140px] items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          data-testid={`button-inventory-category-style-${category.id}`}
        >
          <Badge
            variant="outline"
            className="inline-flex w-full items-center justify-start gap-1.5 truncate text-[10px] font-medium tracking-wide transition-shadow hover:shadow-sm"
            style={tintedBadgeStyle(category.color)}
          >
            <InventoryCategoryIcon icon={category.icon} className="size-3 shrink-0" />
            <span className="truncate">{category.name || "Inventory Type"}</span>
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] space-y-4" data-testid={`popover-inventory-category-style-${category.id}`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Color</div>
          <div className="mt-2 grid grid-cols-[56px_1fr] items-center gap-3 rounded-md border border-border bg-muted/35 p-2">
            <Input
              type="color"
              className="h-10 w-14 cursor-pointer p-1"
              value={badgeColorValue(category.color)}
              onChange={event => onChange({ color: event.target.value })}
              data-testid={`input-inventory-category-color-${category.id}`}
              aria-label="Choose inventory category color"
            />
            <Badge
              variant="outline"
              className="inline-flex w-full items-center justify-start gap-1.5 truncate text-[10px] font-medium tracking-wide"
              style={tintedBadgeStyle(category.color)}
            >
              <InventoryCategoryIcon icon={category.icon} className="size-3 shrink-0" />
              <span className="truncate">{category.name || "Inventory Type"}</span>
            </Badge>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Icon</div>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {commonIcons.map(option => (
              <button
                key={option.value}
                type="button"
                title={option.label}
                className={`flex h-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${normalizeInventoryIcon(category.icon) === option.value ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : ""}`}
                onClick={() => onChange({ icon: normalizeInventoryIcon(option.value) })}
                data-testid={`button-inventory-category-icon-common-${category.id}-${option.value}`}
              >
                <option.Icon className="size-4" />
              </button>
            ))}
          </div>
          <Input
            className="mt-2 h-8"
            value={iconSearch}
            onChange={event => setIconSearch(event.target.value)}
            placeholder="Search icons"
            data-testid={`input-inventory-category-icon-search-${category.id}`}
          />
          <div className="mt-2 grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
            {filteredIcons.map(option => (
              <button
                key={option.value}
                type="button"
                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${normalizeInventoryIcon(category.icon) === option.value ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : ""}`}
                onClick={() => onChange({ icon: normalizeInventoryIcon(option.value) })}
                data-testid={`button-inventory-category-icon-${category.id}-${option.value}`}
              >
                <option.Icon className="size-4" />
                <span className="max-w-full truncate">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
