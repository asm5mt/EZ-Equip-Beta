import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppContext } from "@/lib/app-context";
import { badgeColorValue, tintedBadgeStyle } from "@/lib/badges";
import { CURRENCY_CODES, currencyName, currencySymbol } from "@/lib/currencies";
import { EQUIPMENT_ICON_OPTIONS, EquipmentTypeIcon, normalizeEquipmentIcon } from "@/lib/equipment-icons";
import { FUEL_ICON_OPTIONS, FuelTypeIcon, normalizeFuelIcon } from "@/lib/fuel-types";
import type { FleetEquipmentType, FleetFuelType, InventoryCategory, InventoryCategoryField } from "@shared/schema";
import { ArrowLeft, BadgeDollarSign, Boxes, Fuel, Plus, Save, Tags, Trash2, X } from "lucide-react";
import { useUnsavedChangeGuard } from "@/components/EditablePageActions";

type DraftEquipmentType = FleetEquipmentType & { isNew?: boolean };
type DraftFuelType = FleetFuelType & { isNew?: boolean };
type DraftInventoryField = InventoryCategoryField & { isNew?: boolean };
type DraftInventoryCategory = InventoryCategory & { isNew?: boolean; fields: DraftInventoryField[] };

const METER_OPTIONS = [
  ["mileage", "Mileage"],
  ["hours", "Hours"],
  ["count", "Count"],
  ["custom", "Custom"],
];

const FIELD_TYPE_OPTIONS = [
  ["text", "Text"],
  ["number", "Numeric"],
  ["date", "Date"],
  ["boolean", "Yes / No"],
  ["currency", "Currency"],
  ["url", "URL"],
];

const VIN_FEATURE_DEFAULT_NAMES = new Set(["vehicle", "truck", "tractor", "trailer", "atv", "utv", "snowmobile"]);

function defaultVinFeaturesForName(value: string) {
  return VIN_FEATURE_DEFAULT_NAMES.has(value.trim().toLowerCase());
}

export default function FleetSettings({ fleetId }: { fleetId: number }) {
  const [, navigate] = useLocation();
  const { fleets, canAdmin, setFleetId } = useAppContext();
  const { toast } = useToast();
  const fleet = useMemo(() => fleets.find(f => f.id === fleetId) ?? null, [fleetId, fleets]);
  const typesQ = useQuery<FleetEquipmentType[]>({
    queryKey: ["/api/fleet-equipment-types", { fleetId }],
    enabled: Number.isFinite(fleetId),
  });
  const fuelTypesQ = useQuery<FleetFuelType[]>({
    queryKey: ["/api/fleet-fuel-types", { fleetId }],
    enabled: Number.isFinite(fleetId),
  });
  const inventoryCategoriesQ = useQuery<InventoryCategory[]>({
    queryKey: ["/api/inventory-categories", { fleetId }],
    enabled: Number.isFinite(fleetId),
  });
  const inventoryFieldsQ = useQuery<InventoryCategoryField[]>({
    queryKey: ["/api/inventory-category-fields", { fleetId }],
    enabled: Number.isFinite(fleetId),
  });

  const [draftCurrency, setDraftCurrency] = useState("USD");
  const [draftTypes, setDraftTypes] = useState<DraftEquipmentType[]>([]);
  const [deletedTypeIds, setDeletedTypeIds] = useState<number[]>([]);
  const [draftFuelTypes, setDraftFuelTypes] = useState<DraftFuelType[]>([]);
  const [deletedFuelTypeIds, setDeletedFuelTypeIds] = useState<number[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addFuelTypeOpen, setAddFuelTypeOpen] = useState(false);
  const [addInventoryCategoryOpen, setAddInventoryCategoryOpen] = useState(false);
  const [fieldDialogCategoryId, setFieldDialogCategoryId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [icon, setIcon] = useState("equipment");
  const [defaultMeter, setDefaultMeter] = useState("mileage");
  const [fuelName, setFuelName] = useState("");
  const [fuelColor, setFuelColor] = useState("#dc2626");
  const [fuelIcon, setFuelIcon] = useState("fuel");
  const [fuelActive, setFuelActive] = useState(true);
  const [draftInventoryCategories, setDraftInventoryCategories] = useState<DraftInventoryCategory[]>([]);
  const [deletedInventoryCategoryIds, setDeletedInventoryCategoryIds] = useState<number[]>([]);
  const [deletedInventoryFieldIds, setDeletedInventoryFieldIds] = useState<number[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");

  useEffect(() => {
    if (Number.isFinite(fleetId)) setFleetId(fleetId);
  }, [fleetId, setFleetId]);

  const resetDraft = () => {
    setDraftCurrency(fleet?.currency ?? "USD");
    setDraftTypes((typesQ.data ?? []).map(type => ({ ...type })));
    setDeletedTypeIds([]);
    setDraftFuelTypes((fuelTypesQ.data ?? []).map(type => ({ ...type })));
    setDeletedFuelTypeIds([]);
    setName("");
    setColor("#2563eb");
    setIcon("equipment");
    setDefaultMeter("mileage");
    setAddOpen(false);
    setFuelName("");
    setFuelColor("#dc2626");
    setFuelIcon("fuel");
    setFuelActive(true);
    setAddFuelTypeOpen(false);
    setDraftInventoryCategories((inventoryCategoriesQ.data ?? []).map(category => ({
      ...category,
      fields: (inventoryFieldsQ.data ?? [])
        .filter(field => field.categoryId === category.id)
        .map(field => ({ ...field })),
    })));
    setDeletedInventoryCategoryIds([]);
    setDeletedInventoryFieldIds([]);
    setCategoryName("");
    setCategoryDescription("");
    setFieldName("");
    setFieldType("text");
    setAddInventoryCategoryOpen(false);
    setFieldDialogCategoryId(null);
  };

  useEffect(() => {
    resetDraft();
  }, [fleet?.currency, typesQ.data, fuelTypesQ.data, inventoryCategoriesQ.data, inventoryFieldsQ.data]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!fleet) return;
      const existingTypes = typesQ.data ?? [];
      const existingById = new Map(existingTypes.map(type => [type.id, type]));
      const existingFuelTypes = fuelTypesQ.data ?? [];
      const existingFuelById = new Map(existingFuelTypes.map(type => [type.id, type]));
      const existingCategories = inventoryCategoriesQ.data ?? [];
      const existingCategoryById = new Map(existingCategories.map(category => [category.id, category]));
      const existingFields = inventoryFieldsQ.data ?? [];
      const existingFieldById = new Map(existingFields.map(field => [field.id, field]));
      const work: Promise<unknown>[] = [];
      const createdCategoryMap = new Map<number, number>();

      if (draftCurrency !== (fleet.currency ?? "USD")) {
        work.push(apiRequest("PATCH", `/api/fleets/${fleet.id}`, { currency: draftCurrency }));
      }

      for (const id of deletedTypeIds) {
        work.push(apiRequest("DELETE", `/api/fleet-equipment-types/${id}`));
      }

      for (const id of deletedFuelTypeIds) {
        work.push(apiRequest("DELETE", `/api/fleet-fuel-types/${id}`));
      }

      for (const type of draftTypes) {
        if (type.isNew) {
          work.push(apiRequest("POST", "/api/fleet-equipment-types", {
            fleetId: fleet.id,
            name: type.name.trim(),
            color: type.color,
            icon: normalizeEquipmentIcon(type.icon),
            defaultMeter: type.defaultMeter,
            enableVinFeatures: type.enableVinFeatures,
            active: true,
          }));
          continue;
        }

        const original = existingById.get(type.id);
        if (!original) continue;
        const patch: Partial<FleetEquipmentType> = {};
        if (type.name.trim() !== original.name) patch.name = type.name.trim();
        if (type.color !== original.color) patch.color = type.color;
        if (normalizeEquipmentIcon(type.icon) !== normalizeEquipmentIcon(original.icon)) patch.icon = normalizeEquipmentIcon(type.icon);
        if (type.defaultMeter !== original.defaultMeter) patch.defaultMeter = type.defaultMeter;
        if (type.enableVinFeatures !== original.enableVinFeatures) patch.enableVinFeatures = type.enableVinFeatures;
        if (Object.keys(patch).length) {
          work.push(apiRequest("PATCH", `/api/fleet-equipment-types/${type.id}`, patch));
        }
      }

      for (const fuelType of draftFuelTypes) {
        if (fuelType.isNew) {
          work.push(apiRequest("POST", "/api/fleet-fuel-types", {
            fleetId: fleet.id,
            name: fuelType.name.trim(),
            color: fuelType.color,
            icon: normalizeFuelIcon(fuelType.icon),
            active: fuelType.active,
          }));
          continue;
        }

        const original = existingFuelById.get(fuelType.id);
        if (!original) continue;
        const patch: Partial<FleetFuelType> = {};
        if (fuelType.name.trim() !== original.name) patch.name = fuelType.name.trim();
        if (fuelType.color !== original.color) patch.color = fuelType.color;
        if (normalizeFuelIcon(fuelType.icon) !== normalizeFuelIcon(original.icon)) patch.icon = normalizeFuelIcon(fuelType.icon);
        if (fuelType.active !== original.active) patch.active = fuelType.active;
        if (Object.keys(patch).length) {
          work.push(apiRequest("PATCH", `/api/fleet-fuel-types/${fuelType.id}`, patch));
        }
      }

      for (const id of deletedInventoryFieldIds) {
        work.push(apiRequest("DELETE", `/api/inventory-category-fields/${id}`));
      }

      for (const id of deletedInventoryCategoryIds) {
        work.push(apiRequest("DELETE", `/api/inventory-categories/${id}`));
      }

      await Promise.all(work);

      for (const category of draftInventoryCategories) {
        if (category.isNew) {
          const res = await apiRequest("POST", "/api/inventory-categories", {
            fleetId: fleet.id,
            name: category.name.trim(),
            description: category.description?.trim() || null,
            active: true,
          });
          const created = await res.json();
          createdCategoryMap.set(category.id, created.id);
          continue;
        }

        const original = existingCategoryById.get(category.id);
        if (!original) continue;
        const patch: Partial<InventoryCategory> = {};
        if (category.name.trim() !== original.name) patch.name = category.name.trim();
        if ((category.description ?? "").trim() !== (original.description ?? "")) patch.description = category.description?.trim() || null;
        if (category.active !== original.active) patch.active = category.active;
        if (Object.keys(patch).length) {
          await apiRequest("PATCH", `/api/inventory-categories/${category.id}`, patch);
        }
      }

      for (const category of draftInventoryCategories) {
        const categoryId = category.isNew ? createdCategoryMap.get(category.id) : category.id;
        if (!categoryId) continue;
        for (const field of category.fields) {
          if (field.isNew) {
            await apiRequest("POST", "/api/inventory-category-fields", {
              categoryId,
              name: field.name.trim(),
              fieldType: field.fieldType,
              required: field.required,
              sortOrder: field.sortOrder,
            });
            continue;
          }
          const original = existingFieldById.get(field.id);
          if (!original) continue;
          const patch: Partial<InventoryCategoryField> = {};
          if (field.name.trim() !== original.name) patch.name = field.name.trim();
          if (field.fieldType !== original.fieldType) patch.fieldType = field.fieldType;
          if (field.required !== original.required) patch.required = field.required;
          if (field.sortOrder !== original.sortOrder) patch.sortOrder = field.sortOrder;
          if (Object.keys(patch).length) {
            await apiRequest("PATCH", `/api/inventory-category-fields/${field.id}`, patch);
          }
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/fleets"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/fleet-equipment-types"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/fleet-fuel-types"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/inventory-categories"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/inventory-category-fields"] });
      toast({ title: "Fleet settings saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const addDraftType = () => {
    if (!fleet || !name.trim()) return;
    setDraftTypes(types => [
      ...types,
      { id: -Date.now(), fleetId: fleet.id, name: name.trim(), color, icon: normalizeEquipmentIcon(icon), defaultMeter, enableVinFeatures: defaultVinFeaturesForName(name), active: true, isNew: true },
    ]);
    setName("");
    setColor("#2563eb");
    setIcon("equipment");
    setDefaultMeter("mileage");
    setAddOpen(false);
  };

  const updateDraftType = (id: number, patch: Partial<FleetEquipmentType>) => {
    setDraftTypes(types => types.map(type => type.id === id ? { ...type, ...patch } : type));
  };

  const removeDraftType = (type: DraftEquipmentType) => {
    setDraftTypes(types => types.filter(t => t.id !== type.id));
    if (!type.isNew) setDeletedTypeIds(ids => [...ids, type.id]);
  };

  const addDraftFuelType = () => {
    if (!fleet || !fuelName.trim()) return;
    setDraftFuelTypes(types => [
      ...types,
      {
        id: -Date.now(),
        fleetId: fleet.id,
        name: fuelName.trim(),
        color: fuelColor,
        icon: normalizeFuelIcon(fuelIcon),
        active: fuelActive,
        isNew: true,
      },
    ]);
    setFuelName("");
    setFuelColor("#dc2626");
    setFuelIcon("fuel");
    setFuelActive(true);
    setAddFuelTypeOpen(false);
  };

  const updateDraftFuelType = (id: number, patch: Partial<FleetFuelType>) => {
    setDraftFuelTypes(types => types.map(type => type.id === id ? { ...type, ...patch } : type));
  };

  const removeDraftFuelType = (type: DraftFuelType) => {
    setDraftFuelTypes(types => types.filter(t => t.id !== type.id));
    if (!type.isNew) setDeletedFuelTypeIds(ids => [...ids, type.id]);
  };

  const addDraftInventoryCategory = () => {
    if (!fleet || !categoryName.trim()) return;
    setDraftInventoryCategories(categories => [
      ...categories,
      {
        id: -Date.now(),
        fleetId: fleet.id,
        name: categoryName.trim(),
        description: categoryDescription.trim() || null,
        active: true,
        isNew: true,
        fields: [],
      },
    ]);
    setCategoryName("");
    setCategoryDescription("");
    setAddInventoryCategoryOpen(false);
  };

  const updateDraftInventoryCategory = (id: number, patch: Partial<InventoryCategory>) => {
    setDraftInventoryCategories(categories => categories.map(category => category.id === id ? { ...category, ...patch } : category));
  };

  const removeDraftInventoryCategory = (category: DraftInventoryCategory) => {
    setDraftInventoryCategories(categories => categories.filter(c => c.id !== category.id));
    if (!category.isNew) setDeletedInventoryCategoryIds(ids => [...ids, category.id]);
    for (const field of category.fields) {
      if (!field.isNew) setDeletedInventoryFieldIds(ids => [...ids, field.id]);
    }
  };

  const addDraftInventoryField = () => {
    if (!fieldDialogCategoryId || !fieldName.trim()) return;
    setDraftInventoryCategories(categories => categories.map(category => {
      if (category.id !== fieldDialogCategoryId) return category;
      return {
        ...category,
        fields: [
          ...category.fields,
          {
            id: -Date.now(),
            categoryId: category.id,
            name: fieldName.trim(),
            fieldType,
            required: false,
            sortOrder: category.fields.length + 1,
            isNew: true,
          },
        ],
      };
    }));
    setFieldName("");
    setFieldType("text");
    setFieldDialogCategoryId(null);
  };

  const updateDraftInventoryField = (categoryId: number, fieldId: number, patch: Partial<InventoryCategoryField>) => {
    setDraftInventoryCategories(categories => categories.map(category => category.id === categoryId
      ? { ...category, fields: category.fields.map(field => field.id === fieldId ? { ...field, ...patch } : field) }
      : category
    ));
  };

  const removeDraftInventoryField = (categoryId: number, field: DraftInventoryField) => {
    setDraftInventoryCategories(categories => categories.map(category => category.id === categoryId
      ? { ...category, fields: category.fields.filter(f => f.id !== field.id) }
      : category
    ));
    if (!field.isNew) setDeletedInventoryFieldIds(ids => [...ids, field.id]);
  };

  const hasChanges = !!fleet && (
    draftCurrency !== (fleet.currency ?? "USD")
    || deletedTypeIds.length > 0
    || deletedFuelTypeIds.length > 0
    || deletedInventoryCategoryIds.length > 0
    || deletedInventoryFieldIds.length > 0
    || draftTypes.some(type => {
      if (type.isNew) return true;
      const original = (typesQ.data ?? []).find(t => t.id === type.id);
      return !original
        || type.name.trim() !== original.name
        || type.color !== original.color
        || normalizeEquipmentIcon(type.icon) !== normalizeEquipmentIcon(original.icon)
        || type.defaultMeter !== original.defaultMeter
        || type.enableVinFeatures !== original.enableVinFeatures;
    })
    || draftFuelTypes.some(type => {
      if (type.isNew) return true;
      const original = (fuelTypesQ.data ?? []).find(t => t.id === type.id);
      return !original
        || type.name.trim() !== original.name
        || type.color !== original.color
        || normalizeFuelIcon(type.icon) !== normalizeFuelIcon(original.icon)
        || type.active !== original.active;
    })
    || draftInventoryCategories.some(category => {
      if (category.isNew) return true;
      const original = (inventoryCategoriesQ.data ?? []).find(c => c.id === category.id);
      return !original
        || category.name.trim() !== original.name
        || (category.description ?? "").trim() !== (original.description ?? "")
        || category.fields.some(field => {
          if (field.isNew) return true;
          const originalField = (inventoryFieldsQ.data ?? []).find(f => f.id === field.id);
          return !originalField
            || field.name.trim() !== originalField.name
            || field.fieldType !== originalField.fieldType
            || field.required !== originalField.required
            || field.sortOrder !== originalField.sortOrder;
        });
    })
  );
  const { confirmOrRun, dialog: unsavedDialog } = useUnsavedChangeGuard({
    hasChanges,
    onSave: () => saveSettings.mutate(),
  });

  if (!fleet) {
    return (
      <AppShell title="Fleet Settings" subtitle="FLEET SETTINGS">
        <Card className="max-w-3xl p-5 space-y-3">
          <h3 className="font-semibold">Fleet not found</h3>
          <p className="text-sm text-muted-foreground">This fleet may have been deleted or is still loading.</p>
          <Button variant="outline" onClick={() => navigate("/settings")} data-testid="button-back-to-settings">
            <ArrowLeft className="size-4 mr-1.5" /> Back to Settings
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title={fleet.name} subtitle="FLEET SETTINGS">
      <div className="max-w-6xl space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="outline" onClick={() => confirmOrRun(() => navigate("/settings"))} data-testid="button-back-settings">
              <ArrowLeft className="size-4 mr-1.5" /> Back
            </Button>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{fleet.name}</div>
              <div className="text-xs text-muted-foreground truncate">/{fleet.slug}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] tracking-wide ${hasChanges ? "status-warn" : ""}`} data-testid="badge-fleet-settings-state">
              {hasChanges ? "Unsaved changes" : "No pending changes"}
            </Badge>
            <Button variant="cancel" disabled={saveSettings.isPending} onClick={resetDraft} data-testid="button-cancel-fleet-settings">
              <X className="size-4 mr-1.5" /> Cancel
            </Button>
            <Button variant="success" disabled={!canAdmin || !hasChanges || saveSettings.isPending} onClick={() => saveSettings.mutate()} data-testid="button-save-fleet-settings">
              <Save className="size-4 mr-1.5" /> {saveSettings.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {!canAdmin && (
          <Card className="p-4 status-warn">
            Your current fleet role can view these settings, but only Fleet Admins can save changes.
          </Card>
        )}
        {unsavedDialog}

        <Card className="p-5 space-y-4">
          <SectionHeader
            icon={<BadgeDollarSign className="size-4" />}
            label="Fleet Defaults"
            description="Currency is stored per fleet so costs and reports can use the correct symbol."
          />
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label>Currency</Label>
                <HelpTooltip content="Sets the currency symbol used for this fleet's inventory costs, service totals, reports, and price displays." testId={`tooltip-fleet-currency-${fleet.id}`} />
              </div>
              <p className="text-xs text-muted-foreground">Current display symbol: {currencySymbol(draftCurrency)}</p>
            </div>
            <Select value={draftCurrency} onValueChange={setDraftCurrency} disabled={!canAdmin || saveSettings.isPending}>
              <SelectTrigger data-testid={`select-fleet-currency-${fleet.id}`}><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {CURRENCY_CODES.map(code => (
                  <SelectItem key={code} value={code}>{code} {currencySymbol(code)} — {currencyName(code)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <SectionHeader
              icon={<Fuel className="size-4" />}
              label="Fuel Types"
              description="Configure the fuel options that appear on VIN-enabled asset forms and header pills."
            />
            <Dialog open={addFuelTypeOpen} onOpenChange={setAddFuelTypeOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto" disabled={!canAdmin || saveSettings.isPending} data-testid="button-open-add-fuel-type">
                  <Plus className="size-4 mr-1.5" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Add Fuel Type</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={fuelName} onChange={e => setFuelName(e.target.value)} placeholder="Gasoline" data-testid="input-new-fuel-type" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Color</Label>
                      <Input type="color" value={fuelColor} onChange={e => setFuelColor(e.target.value)} data-testid="input-new-fuel-color" />
                    </div>
                    <FuelIconSelect value={fuelIcon} onChange={setFuelIcon} testid="select-new-fuel-icon" />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/35 p-3">
                    <div>
                      <Label>Active</Label>
                      <p className="text-xs text-muted-foreground">Inactive fuel types stay saved for old records but hide from new asset forms.</p>
                    </div>
                    <Switch checked={fuelActive} onCheckedChange={setFuelActive} data-testid="switch-new-fuel-active" />
                  </div>
                  <div className="rounded-md border border-border bg-muted/50 p-3">
                    <span className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-medium" style={tintedFuelPreviewStyle(fuelColor)}>
                      <FuelTypeIcon icon={fuelIcon} className="size-4" style={{ color: fuelColor }} />
                      {fuelName.trim() || "Fuel Type"}
                    </span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="cancel" onClick={() => setAddFuelTypeOpen(false)} data-testid="button-cancel-add-fuel-type">
                      <X className="size-4 mr-1.5" /> Cancel
                    </Button>
                    <Button variant="success" disabled={!canAdmin || !fuelName.trim()} onClick={addDraftFuelType} data-testid="button-create-fuel-type">
                      <Save className="size-4 mr-1.5" /> Save
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Configured Fuel Types</div>
            <HelpTooltip content="Active fuel types populate the Fuel Type dropdown on VIN-enabled asset forms. Color and icon also drive the fuel pill shown in the asset header." testId={`tooltip-fuel-types-${fleet.id}`} />
            <Badge variant="outline" className="ml-auto text-[10px] tracking-wide" data-testid="badge-fuel-type-count">{draftFuelTypes.length} total</Badge>
          </div>

          <div className="grid gap-2">
            {draftFuelTypes.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="empty-fuel-types">
                No fuel types are configured yet. Add one when you are ready, then save the fleet settings.
              </div>
            )}
            {draftFuelTypes.map(type => (
              <div key={type.id} className="grid grid-cols-1 lg:grid-cols-[140px_minmax(180px,1fr)_118px_40px] gap-2 rounded-md border border-border px-2.5 py-2 items-center" data-testid={`row-fuel-type-${type.id}`}>
                <FuelTypeStylePopover
                  type={type}
                  disabled={!canAdmin || saveSettings.isPending}
                  onChange={patch => updateDraftFuelType(type.id, patch)}
                />
                <Input
                  className="h-9"
                  value={type.name}
                  disabled={!canAdmin || saveSettings.isPending}
                  onChange={e => updateDraftFuelType(type.id, { name: e.target.value })}
                  data-testid={`input-fuel-type-name-${type.id}`}
                />
                <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted/35 px-2.5 py-2">
                  <Switch
                    checked={Boolean(type.active)}
                    onCheckedChange={checked => updateDraftFuelType(type.id, { active: checked })}
                    disabled={!canAdmin || saveSettings.isPending}
                    data-testid={`switch-fuel-type-active-${type.id}`}
                  />
                  <div className="text-xs font-medium">Active</div>
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9" disabled={!canAdmin || saveSettings.isPending} onClick={() => removeDraftFuelType(type)} data-testid={`button-delete-fuel-type-${type.id}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <SectionHeader
              icon={<Tags className="size-4" />}
              label="Asset Types"
              description="Configure the asset tag, default meter, and whether VIN-powered features are available for this fleet."
            />
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto" disabled={!canAdmin || saveSettings.isPending} data-testid="button-open-add-equipment-type">
                  <Plus className="size-4 mr-1.5" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Add Asset Type</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Snow Blower" data-testid="input-new-equipment-type" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SelectField label="Default Meter" value={defaultMeter} onChange={setDefaultMeter} options={METER_OPTIONS} testid="select-new-equipment-meter" />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 p-3">
                    <div className="text-xs text-muted-foreground">Preview</div>
                    <Badge variant="outline" className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide" style={tintedBadgeStyle(color)}>
                      <EquipmentTypeIcon icon={icon} className="size-3" />
                      {name.trim() || "asset type"}
                    </Badge>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="cancel" onClick={() => setAddOpen(false)} data-testid="button-cancel-add-equipment-type">
                      <X className="size-4 mr-1.5" /> Cancel
                    </Button>
                    <Button variant="success" disabled={!canAdmin || !name.trim()} onClick={addDraftType} data-testid="button-create-equipment-type">
                      <Save className="size-4 mr-1.5" /> Save
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Configured Types</div>
            <HelpTooltip content="Asset types define the label, pill color, icon, default meter, and VIN feature availability used when creating assets in this fleet." testId={`tooltip-equipment-types-${fleet.id}`} />
            <Badge variant="outline" className="ml-auto text-[10px] tracking-wide" data-testid="badge-equipment-type-count">{draftTypes.length} total</Badge>
          </div>

          <div className="grid gap-2">
            {draftTypes.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="empty-equipment-types">
                No asset types are configured for this fleet yet. Add one when you are ready, then save the fleet settings.
              </div>
            )}
            {draftTypes.map(type => (
              <div key={type.id} className="grid grid-cols-1 lg:grid-cols-[140px_minmax(180px,1fr)_140px_145px_40px] gap-2 rounded-md border border-border px-2.5 py-2 items-center" data-testid={`row-equipment-type-${type.id}`}>
                <AssetTypeStylePopover
                  type={type}
                  disabled={!canAdmin || saveSettings.isPending}
                  onChange={patch => updateDraftType(type.id, patch)}
                />
                <Input
                  className="h-9 w-full"
                  value={type.name}
                  disabled={!canAdmin || saveSettings.isPending}
                  onChange={e => updateDraftType(type.id, { name: e.target.value })}
                  data-testid={`input-equipment-type-name-${type.id}`}
                />
                <Select value={type.defaultMeter} onValueChange={value => updateDraftType(type.id, { defaultMeter: value })} disabled={!canAdmin || saveSettings.isPending}>
                  <SelectTrigger className="h-9" data-testid={`select-equipment-type-meter-${type.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{METER_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted/35 px-2.5 py-2">
                  <Switch
                    checked={Boolean(type.enableVinFeatures)}
                    onCheckedChange={checked => updateDraftType(type.id, { enableVinFeatures: checked })}
                    disabled={!canAdmin || saveSettings.isPending}
                    data-testid={`switch-equipment-type-vin-${type.id}`}
                  />
                  <div className="text-xs font-medium">VIN Features</div>
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9" disabled={!canAdmin || saveSettings.isPending} onClick={() => removeDraftType(type)} data-testid={`button-delete-equipment-type-${type.id}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <SectionHeader
              icon={<Boxes className="size-4" />}
              label="Inventory Types"
              description="Create fleet-specific inventory categories and optional fields that appear on inventory items."
            />
            <Dialog open={addInventoryCategoryOpen} onOpenChange={setAddInventoryCategoryOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto" disabled={!canAdmin || saveSettings.isPending} data-testid="button-open-add-inventory-category">
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
                  <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                    You can create the type with zero fields, then add as many custom fields as needed from the type row.
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="cancel" onClick={() => setAddInventoryCategoryOpen(false)} data-testid="button-cancel-add-inventory-category">
                      <X className="size-4 mr-1.5" /> Cancel
                    </Button>
                    <Button variant="success" disabled={!canAdmin || !categoryName.trim()} onClick={addDraftInventoryCategory} data-testid="button-create-inventory-category">
                      <Save className="size-4 mr-1.5" /> Save
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Configured Inventory Types</div>
            <HelpTooltip content="Inventory types become the category options on inventory items. Fields are optional prompts, such as viscosity, thread size, date code, voltage, or warranty expiration." testId={`tooltip-inventory-types-${fleet.id}`} />
            <Badge variant="outline" className="ml-auto text-[10px] tracking-wide" data-testid="badge-inventory-category-count">{draftInventoryCategories.length} total</Badge>
          </div>

          <div className="grid gap-2">
            {draftInventoryCategories.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="empty-inventory-categories">
                No inventory types are configured yet. Inventory items can still use free-form categories until you add saved types.
              </div>
            )}
            {draftInventoryCategories.map(category => (
              <div key={category.id} className="rounded-md border border-border p-3 space-y-3" data-testid={`row-inventory-category-${category.id}`}>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(180px,0.7fr)_minmax(220px,1fr)_auto_auto] gap-2 items-center">
                  <Input
                    className="h-9"
                    value={category.name}
                    disabled={!canAdmin || saveSettings.isPending}
                    onChange={e => updateDraftInventoryCategory(category.id, { name: e.target.value })}
                    data-testid={`input-inventory-category-name-${category.id}`}
                  />
                  <Input
                    className="h-9"
                    value={category.description ?? ""}
                    placeholder="Description"
                    disabled={!canAdmin || saveSettings.isPending}
                    onChange={e => updateDraftInventoryCategory(category.id, { description: e.target.value })}
                    data-testid={`input-inventory-category-description-${category.id}`}
                  />
                  <Button variant="secondary" size="sm" disabled={!canAdmin || saveSettings.isPending} onClick={() => setFieldDialogCategoryId(category.id)} data-testid={`button-open-add-inventory-field-${category.id}`}>
                    <Plus className="size-4 mr-1.5" /> Add Field
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9" disabled={!canAdmin || saveSettings.isPending} onClick={() => removeDraftInventoryCategory(category)} data-testid={`button-delete-inventory-category-${category.id}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Fields</div>
                  <HelpTooltip content="Add only the fields this inventory type needs. Field type controls the input used when creating inventory items in this category." testId={`tooltip-inventory-category-fields-${category.id}`} />
                  <Badge variant="outline" className="text-[10px] tracking-wide">{category.fields.length} total</Badge>
                </div>
                {category.fields.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">No custom fields. Items in this category will use the standard inventory form only.</div>
                ) : (
                  <div className="grid gap-2">
                    {category.fields.map(field => (
                      <div key={field.id} className="grid grid-cols-1 md:grid-cols-[minmax(180px,1fr)_150px_120px_40px] gap-2 items-center rounded-md bg-muted/45 px-2 py-2" data-testid={`row-inventory-field-${field.id}`}>
                        <Input
                          className="h-8"
                          value={field.name}
                          disabled={!canAdmin || saveSettings.isPending}
                          onChange={e => updateDraftInventoryField(category.id, field.id, { name: e.target.value })}
                          data-testid={`input-inventory-field-name-${field.id}`}
                        />
                        <Select value={field.fieldType} onValueChange={value => updateDraftInventoryField(category.id, field.id, { fieldType: value })} disabled={!canAdmin || saveSettings.isPending}>
                          <SelectTrigger className="h-8" data-testid={`select-inventory-field-type-${field.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{FIELD_TYPE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={field.required ? "required" : "optional"} onValueChange={value => updateDraftInventoryField(category.id, field.id, { required: value === "required" })} disabled={!canAdmin || saveSettings.isPending}>
                          <SelectTrigger className="h-8" data-testid={`select-inventory-field-required-${field.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="optional">Optional</SelectItem>
                            <SelectItem value="required">Required</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canAdmin || saveSettings.isPending} onClick={() => removeDraftInventoryField(category.id, field)} data-testid={`button-delete-inventory-field-${field.id}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
                  <div className="flex items-center gap-2 mb-2">
                    <Label>Field Name</Label>
                    <HelpTooltip content="Use a concise label that makes sense while entering an inventory item, such as Viscosity, Voltage, Warranty Expiration, Thread Size, or Date Code." testId="tooltip-new-inventory-field-name" />
                  </div>
                  <Input value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder="Viscosity" data-testid="input-new-inventory-field-name" />
                </div>
                <SelectField label="Field Type" value={fieldType} onChange={setFieldType} options={FIELD_TYPE_OPTIONS} testid="select-new-inventory-field-type" />
                <div className="flex justify-end gap-2">
                  <Button variant="cancel" onClick={() => setFieldDialogCategoryId(null)} data-testid="button-cancel-add-inventory-field">
                    <X className="size-4 mr-1.5" /> Cancel
                  </Button>
                  <Button variant="success" disabled={!canAdmin || !fieldName.trim()} onClick={addDraftInventoryField} data-testid="button-create-inventory-field">
                    <Save className="size-4 mr-1.5" /> Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </Card>
      </div>
    </AppShell>
  );
}

function SectionHeader({ icon, label, description }: { icon: ReactNode; label: string; description: string }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="mt-0.5 rounded-md border border-border bg-muted p-2 text-[hsl(var(--primary))]">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, testid }: {
  label: string; value: string; onChange: (v: string) => void; options: string[][]; testid: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testid}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function FuelIconSelect({ value, onChange, testid, disabled = false }: {
  value: string;
  onChange: (v: string) => void;
  testid: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label>Icon</Label>
      <Select value={normalizeFuelIcon(value)} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger data-testid={testid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FUEL_ICON_OPTIONS.map(option => (
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

function tintedFuelPreviewStyle(color?: string | null) {
  const safe = /^#[0-9a-f]{6}$/i.test(String(color ?? "")) ? String(color) : "#64748b";
  return {
    borderColor: `${safe}55`,
    backgroundColor: `${safe}26`,
    color: safe,
  };
}

function AssetTypeStylePopover({
  type,
  disabled,
  onChange,
}: {
  type: DraftEquipmentType;
  disabled: boolean;
  onChange: (patch: Partial<FleetEquipmentType>) => void;
}) {
  const [iconSearch, setIconSearch] = useState("");
  const filteredIcons = EQUIPMENT_ICON_OPTIONS.filter(option =>
    option.label.toLowerCase().includes(iconSearch.trim().toLowerCase())
    || String(option.value).toLowerCase().includes(iconSearch.trim().toLowerCase())
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex w-full max-w-[140px] items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          data-testid={`button-asset-type-style-${type.id}`}
        >
          <Badge
            variant="outline"
            className="inline-flex w-full items-center justify-start gap-1.5 truncate text-[10px] font-medium tracking-wide transition-shadow hover:shadow-sm"
            style={tintedBadgeStyle(type.color)}
          >
            <EquipmentTypeIcon icon={type.icon} className="size-3 shrink-0" />
            <span className="truncate">{type.name || "Asset Type"}</span>
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] space-y-4" data-testid={`popover-asset-type-style-${type.id}`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Color</div>
          <div className="mt-2 grid grid-cols-[56px_1fr] items-center gap-3 rounded-md border border-border bg-muted/35 p-2">
            <Input
              type="color"
              className="h-10 w-14 cursor-pointer p-1"
              value={badgeColorValue(type.color)}
              onChange={event => onChange({ color: event.target.value })}
              data-testid={`input-asset-type-color-${type.id}`}
              aria-label="Choose asset type color"
            />
            <Badge
              variant="outline"
              className="inline-flex w-full items-center justify-start gap-1.5 truncate text-[10px] font-medium tracking-wide"
              style={tintedBadgeStyle(type.color)}
            >
              <EquipmentTypeIcon icon={type.icon} className="size-3 shrink-0" />
              <span className="truncate">{type.name || "Asset Type"}</span>
            </Badge>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Icon</div>
          <Input
            className="mt-2 h-8"
            value={iconSearch}
            onChange={event => setIconSearch(event.target.value)}
            placeholder="Search icons"
            data-testid={`input-asset-type-icon-search-${type.id}`}
          />
          <div className="mt-2 grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
            {filteredIcons.map(option => (
              <button
                key={option.value}
                type="button"
                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${normalizeEquipmentIcon(type.icon) === option.value ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : ""}`}
                onClick={() => onChange({ icon: normalizeEquipmentIcon(option.value) })}
                data-testid={`button-asset-type-icon-${type.id}-${option.value}`}
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

function FuelTypeStylePopover({
  type,
  disabled,
  onChange,
}: {
  type: DraftFuelType;
  disabled: boolean;
  onChange: (patch: Partial<FleetFuelType>) => void;
}) {
  const [iconSearch, setIconSearch] = useState("");
  const filteredIcons = FUEL_ICON_OPTIONS.filter(option =>
    option.label.toLowerCase().includes(iconSearch.trim().toLowerCase())
    || String(option.value).toLowerCase().includes(iconSearch.trim().toLowerCase())
  );
  const color = /^#[0-9a-f]{6}$/i.test(String(type.color ?? "")) ? String(type.color) : "#64748b";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex w-full max-w-[140px] items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          data-testid={`button-fuel-type-style-${type.id}`}
        >
          <Badge
            variant="outline"
            className="inline-flex w-full items-center justify-start gap-1.5 truncate text-[10px] font-medium tracking-wide transition-shadow hover:shadow-sm"
            style={tintedFuelPreviewStyle(type.color)}
          >
            <FuelTypeIcon icon={type.icon} className="size-3 shrink-0" style={{ color }} />
            <span className="truncate">{type.name || "Fuel Type"}</span>
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] space-y-4" data-testid={`popover-fuel-type-style-${type.id}`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Color</div>
          <div className="mt-2 grid grid-cols-[56px_1fr] items-center gap-3 rounded-md border border-border bg-muted/35 p-2">
            <Input
              type="color"
              className="h-10 w-14 cursor-pointer p-1"
              value={color}
              onChange={event => onChange({ color: event.target.value })}
              data-testid={`input-fuel-type-color-${type.id}`}
              aria-label="Choose fuel type color"
            />
            <Badge
              variant="outline"
              className="inline-flex w-full items-center justify-start gap-1.5 truncate text-[10px] font-medium tracking-wide"
              style={tintedFuelPreviewStyle(type.color)}
            >
              <FuelTypeIcon icon={type.icon} className="size-3 shrink-0" style={{ color }} />
              <span className="truncate">{type.name || "Fuel Type"}</span>
            </Badge>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Icon</div>
          <Input
            className="mt-2 h-8"
            value={iconSearch}
            onChange={event => setIconSearch(event.target.value)}
            placeholder="Search icons"
            data-testid={`input-fuel-type-icon-search-${type.id}`}
          />
          <div className="mt-2 grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
            {filteredIcons.map(option => (
              <button
                key={option.value}
                type="button"
                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${normalizeFuelIcon(type.icon) === option.value ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : ""}`}
                onClick={() => onChange({ icon: normalizeFuelIcon(option.value) })}
                data-testid={`button-fuel-type-icon-${type.id}-${option.value}`}
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
