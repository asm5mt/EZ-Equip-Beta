import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppContext } from "@/lib/app-context";
import { currencySymbol } from "@/lib/currencies";
import { insertInventoryItemSchema, type InsertInventoryItem, type InventoryCategory, type InventoryCategoryField, type InventoryItem } from "@shared/schema";
import { EditablePageActions } from "@/components/EditablePageActions";
import { inventoryItemTitle } from "@/lib/inventory-display";

interface Props {
  mode: "new" | "edit";
  itemId?: number;
}

const UNITS = ["each", "qt", "gal", "oz", "lb", "ft", "in", "pair", "set", "box"];
const LOW_STOCK_TOOLTIP = "When turned off, this item stays tracked, but does not trigger a Low Stock Alert.";
const REORDER_ALERT_TOOLTIP = "When turned on, show a Reorder Alert when On Hand stock is below the configured quantity and suggest a reorder quantity.";
const COST_TRACKING_TOOLTIP = "When turned on, track this item's unit cost using the fleet currency.";

export default function InventoryForm({ mode, itemId }: Props) {
  const [, navigate] = useLocation();
  const { fleet, canEdit } = useAppContext();
  const { toast } = useToast();

  const itemQ = useQuery<InventoryItem>({
    queryKey: ["/api/inventory-items", itemId],
    enabled: mode === "edit" && !!itemId,
  });
  const categoriesQ = useQuery<InventoryCategory[]>({
    queryKey: ["/api/inventory-categories", { fleetId: fleet?.id }],
    enabled: !!fleet?.id,
  });
  const form = useForm<InsertInventoryItem>({
    resolver: zodResolver(insertInventoryItemSchema),
    defaultValues: {
      fleetId: fleet?.id ?? 0,
      name: "",
      displayName: null,
      category: "part",
      sku: null,
      partNumber: null,
      unit: "each",
      onHand: 0,
      lowStockAlert: true,
      lowStockQuantity: null,
      reorderReminder: false,
      reorderPoint: null,
      reorderQuantity: null,
      costTracking: false,
      stocked: true,
      unitCost: null,
      customFields: null,
      notes: null,
    },
  });

  useEffect(() => {
    if (mode === "edit" && itemQ.data) {
      form.reset(itemQ.data as any);
    } else if (mode === "new" && fleet?.id) {
      form.setValue("fleetId", fleet.id);
    }
  }, [mode, itemQ.data, fleet?.id]);

  const createMut = useMutation({
    mutationFn: async (data: InsertInventoryItem) => {
      const res = await apiRequest("POST", "/api/inventory-items", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Inventory item created" });
      navigate("/inventory");
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async (data: InsertInventoryItem) => {
      const res = await apiRequest("PATCH", `/api/inventory-items/${itemId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      toast({ title: "Inventory item updated" });
      navigate("/inventory");
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const lowStockAlert = form.watch("lowStockAlert");
  const reorderReminder = form.watch("reorderReminder");
  const costTracking = form.watch("costTracking");
  const selectedCategory = form.watch("category") ?? "";
  const customFieldsRaw = form.watch("customFields");
  const customValues = useMemo<Record<string, string>>(() => {
    if (!customFieldsRaw) return {};
    try {
      const parsed = JSON.parse(customFieldsRaw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, [customFieldsRaw]);
  const fleetCurrency = fleet?.currency ?? "USD";
  const costLabel = `Unit Cost (${fleetCurrency} ${currencySymbol(fleetCurrency)})`;
  const categories = categoriesQ.data ?? [];
  const categoryNames = categories.map(category => category.name);
  const categoryOptions = selectedCategory && !categoryNames.includes(selectedCategory)
    ? [...categories, { id: -1, fleetId: fleet?.id ?? 0, name: selectedCategory, description: "Existing free-form category", active: true } as InventoryCategory]
    : categories;
  const selectedCategoryDef = categories.find(category => category.name === selectedCategory);
  const fieldsQ = useQuery<InventoryCategoryField[]>({
    queryKey: ["/api/inventory-category-fields", { categoryId: selectedCategoryDef?.id }],
    enabled: !!selectedCategoryDef?.id,
  });
  const selectedCategoryFields = useMemo(
    () => (fieldsQ.data ?? []).filter(field => field.categoryId === selectedCategoryDef?.id),
    [fieldsQ.data, selectedCategoryDef?.id],
  );
  const displayNameRaw = form.watch("displayName");
  const nameRaw = form.watch("name");
  const titlePreview = useMemo(
    () => inventoryItemTitle({ displayName: displayNameRaw ?? null, customFields: customFieldsRaw ?? null, name: nameRaw ?? "" }, selectedCategoryFields),
    [displayNameRaw, nameRaw, customFieldsRaw, selectedCategoryFields],
  );
  const generatedName = useMemo(() => {
    const categoryName = selectedCategory?.trim();
    const fieldParts = selectedCategoryFields
      .map(field => String(customValues[field.id] ?? "").trim())
      .filter(Boolean);
    return [categoryName, ...fieldParts].filter(Boolean).join(" - ");
  }, [selectedCategory, selectedCategoryFields, customValues]);

  useEffect(() => {
    const currentName = String(form.getValues("name") ?? "").trim();
    if (selectedCategoryFields.length > 0 && generatedName) {
      if (currentName !== generatedName) {
        form.setValue("name", generatedName, { shouldDirty: true });
      }
      return;
    }
    if (mode === "new" && selectedCategory && !currentName) {
      form.setValue("name", selectedCategory, { shouldDirty: false });
    }
  }, [form, generatedName, mode, selectedCategory, selectedCategoryFields.length]);

  const setCustomValue = (fieldId: number, value: string) => {
    form.setValue("customFields", JSON.stringify({ ...customValues, [fieldId]: value }), { shouldDirty: true });
  };

  const onSubmit = (data: InsertInventoryItem) => {
    const categoryName = data.category?.trim() || "other";
    const fieldParts = selectedCategoryFields
      .map(field => String(customValues[field.id] ?? "").trim())
      .filter(Boolean);
    const computedName = (fieldParts.length > 0 ? [categoryName, ...fieldParts].join(" - ") : data.name?.trim()) || categoryName || "Inventory Item";
    const payload: InsertInventoryItem = {
      ...data,
      name: computedName,
      displayName: data.displayName?.trim() || null,
      category: categoryName,
      sku: null,
      partNumber: null,
      notes: data.notes?.trim() || null,
      stocked: !!data.lowStockAlert,
      lowStockQuantity: data.lowStockAlert ? data.lowStockQuantity : null,
      reorderPoint: data.reorderReminder ? data.reorderPoint : null,
      reorderQuantity: data.reorderReminder ? data.reorderQuantity : null,
      unitCost: data.costTracking ? data.unitCost : null,
      customFields: data.customFields || null,
    };
    if (mode === "new") createMut.mutate(payload);
    else updateMut.mutate(payload);
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const goBack = () => navigate("/inventory");

  return (
    <AppShell title={mode === "new" ? "Add Inventory Item" : "Edit Inventory Item"} subtitle={mode === "new" ? "NEW INVENTORY ITEM" : "EDIT INVENTORY ITEM"}>
      <div className="max-w-3xl space-y-5">
        <EditablePageActions
          hasChanges={form.formState.isDirty}
          isSaving={isPending}
          canSave={canEdit}
          onBack={goBack}
          onCancel={goBack}
          onSave={form.handleSubmit(onSubmit)}
          saveLabel={mode === "new" ? "Save" : "Save Changes"}
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="p-5 space-y-4">
              <h3 className="font-semibold">Item</h3>
              {!canEdit && (
                <div className="rounded-md border border-[hsl(var(--status-warn)/0.35)] bg-[hsl(var(--status-warn)/0.08)] p-3 text-sm">
                  Viewer access is read-only. Switch to an editor or admin user to save inventory changes.
                </div>
              )}
              <FormField name="name" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      readOnly={selectedCategoryFields.length > 0}
                      className={selectedCategoryFields.length > 0 ? "bg-muted/35" : undefined}
                      data-testid="input-inventory-name"
                      placeholder={selectedCategoryFields.length > 0 ? "Builds from category fields" : "Mobil 1 Extended Performance 5W-30"}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {selectedCategoryFields.length > 0
                      ? "Auto-built from the selected category and its configured fields."
                      : "No category fields are configured, so you can enter this item name manually."}
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="displayName" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name (nickname)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value || null)}
                      data-testid="input-inventory-display-name"
                      placeholder="Optional — overrides the title shown everywhere"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground" data-testid="text-inventory-title-preview">
                    Shown as: <span className="font-medium text-foreground">{titlePreview}</span>
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField name="category" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue("customFields", null, { shouldDirty: true });
                    }}>
                      <FormControl><SelectTrigger data-testid="select-inventory-category"><SelectValue placeholder="Choose category" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {categoryOptions.map(category => <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>)}
                        {categoryOptions.length === 0 && <SelectItem value="part">part</SelectItem>}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="unit" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <Select value={field.value ?? "each"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger data-testid="select-inventory-unit"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {selectedCategoryFields.length > 0 && (
                <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold">Category Fields</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        These fields come from the selected inventory category and define the item name.
                      </p>
                    </div>
                    {generatedName && (
                      <div className="rounded-full bg-background px-3 py-1 text-xs font-medium text-muted-foreground border border-border" data-testid="text-generated-inventory-name">
                        {generatedName}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedCategoryFields.map(field => (
                      <div key={field.id}>
                        <Label>{field.name}{field.required ? " *" : ""}</Label>
                        {field.fieldType === "boolean" ? (
                          <Select value={customValues[field.id] ?? ""} onValueChange={value => setCustomValue(field.id, value)}>
                            <SelectTrigger data-testid={`select-custom-field-${field.id}`}><SelectValue placeholder="Choose" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={field.fieldType === "number" || field.fieldType === "currency" ? "number" : field.fieldType === "date" ? "date" : field.fieldType === "url" ? "url" : "text"}
                            step={field.fieldType === "number" || field.fieldType === "currency" ? "0.01" : undefined}
                            value={customValues[field.id] ?? ""}
                            onChange={e => setCustomValue(field.id, e.target.value)}
                            data-testid={`input-custom-field-${field.id}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <FormField name="notes" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={3} {...field} value={field.value ?? ""} data-testid="textarea-inventory-notes" /></FormControl>
                </FormItem>
              )} />
            </Card>

            <Card className="p-5 space-y-4">
              <h3 className="font-semibold">Stock</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField name="onHand" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>On Hand</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} value={field.value ?? 0} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} data-testid="input-inventory-on-hand" />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField name="costTracking" control={form.control} render={({ field }) => (
                <FormItem className="rounded-md border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Label>Cost Tracking</Label>
                      <HelpTooltip content={COST_TRACKING_TOOLTIP} testId="tooltip-cost-tracking" />
                    </div>
                    <FormControl>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (!checked) form.setValue("unitCost", null, { shouldDirty: true });
                        }}
                        data-testid="switch-inventory-cost-tracking"
                      />
                    </FormControl>
                  </div>
                  {costTracking && (
                    <FormField name="unitCost" control={form.control} render={({ field: costField }) => (
                      <FormItem>
                        <FormLabel>{costLabel}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...costField} value={costField.value ?? ""} onChange={e => costField.onChange(e.target.value === "" ? null : Number(e.target.value))} data-testid="input-inventory-unit-cost" />
                        </FormControl>
                      </FormItem>
                    )} />
                  )}
                </FormItem>
              )} />
              <FormField name="lowStockAlert" control={form.control} render={({ field }) => (
                <FormItem className="rounded-md border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Label>Low Stock Alert</Label>
                      <HelpTooltip content={LOW_STOCK_TOOLTIP} testId="tooltip-low-stock-alert" />
                    </div>
                    <FormControl>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          form.setValue("stocked", checked, { shouldDirty: true });
                          if (!checked) form.setValue("lowStockQuantity", null, { shouldDirty: true });
                          else if (form.getValues("lowStockQuantity") == null) form.setValue("lowStockQuantity", form.getValues("onHand") ?? 0, { shouldDirty: true });
                        }}
                        data-testid="switch-inventory-low-stock-alert"
                      />
                    </FormControl>
                  </div>
                  {lowStockAlert && (
                    <FormField name="lowStockQuantity" control={form.control} render={({ field: qtyField }) => (
                      <FormItem>
                        <FormLabel>Low Stock Quantity</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...qtyField} value={qtyField.value ?? ""} onChange={e => qtyField.onChange(e.target.value === "" ? null : Number(e.target.value))} data-testid="input-inventory-low-stock-quantity" />
                        </FormControl>
                      </FormItem>
                    )} />
                  )}
                </FormItem>
              )} />
              <FormField name="reorderReminder" control={form.control} render={({ field }) => (
                <FormItem className="rounded-md border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Label>Reorder Alert</Label>
                      <HelpTooltip content={REORDER_ALERT_TOOLTIP} testId="tooltip-reorder-alert" />
                    </div>
                    <FormControl>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (!checked) {
                            form.setValue("reorderPoint", null, { shouldDirty: true });
                            form.setValue("reorderQuantity", null, { shouldDirty: true });
                          } else {
                            if (form.getValues("reorderPoint") == null) form.setValue("reorderPoint", form.getValues("lowStockQuantity") ?? form.getValues("onHand") ?? 0, { shouldDirty: true });
                            if (form.getValues("reorderQuantity") == null) form.setValue("reorderQuantity", 1, { shouldDirty: true });
                          }
                        }}
                        data-testid="switch-inventory-reorder-reminder"
                      />
                    </FormControl>
                  </div>
                  {reorderReminder && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField name="reorderPoint" control={form.control} render={({ field: pointField }) => (
                        <FormItem>
                          <FormLabel>Reorder Alert Quantity</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...pointField} value={pointField.value ?? ""} onChange={e => pointField.onChange(e.target.value === "" ? null : Number(e.target.value))} data-testid="input-inventory-reorder-point" />
                          </FormControl>
                        </FormItem>
                      )} />
                      <FormField name="reorderQuantity" control={form.control} render={({ field: qtyField }) => (
                        <FormItem>
                          <FormLabel>Reorder Quantity</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...qtyField} value={qtyField.value ?? ""} onChange={e => qtyField.onChange(e.target.value === "" ? null : Number(e.target.value))} data-testid="input-inventory-reorder-qty" />
                          </FormControl>
                        </FormItem>
                      )} />
                    </div>
                  )}
                </FormItem>
              )} />
            </Card>

          </form>
        </Form>
      </div>
    </AppShell>
  );
}

function HelpTooltip({ content, testId }: { content: string; testId: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 items-center justify-center rounded-full border border-muted-foreground/45 text-[10px] font-semibold leading-none text-muted-foreground transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={content}
          data-testid={testId}
        >
          ?
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
