import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppContext } from "@/lib/app-context";
import { badgeColorValue, tintedBadgeStyle } from "@/lib/badges";
import { CURRENCY_CODES, currencyName, currencySymbol } from "@/lib/currencies";
import { EQUIPMENT_ICON_OPTIONS, EquipmentTypeIcon, normalizeEquipmentIcon } from "@/lib/equipment-icons";
import { FUEL_ICON_OPTIONS, FuelTypeIcon, normalizeFuelIcon } from "@/lib/fuel-types";
import { STATE_PROVINCE_OPTIONS, regionLabel as usCaRegionLabel } from "@/lib/regions";
import type { FleetEquipmentType, FleetFuelType } from "@shared/schema";
import { ArrowLeft, BadgeDollarSign, CheckCircle2, Fuel, MapPin, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { EditablePageActions, DialogHeaderActions, useUnsavedChangeGuard } from "@/components/EditablePageActions";
import { DiagnosticsRegistration } from "@/lib/diagnostics-context";
import { COUNTRIES, countryName } from "@shared/countries";
import { getCountryAddressConfig } from "@/lib/address-format";
import {
  PHONE_COUNTRIES, PHONE_COUNTRIES_BY_CALLING_CODE, callingCodeLabel, formatPhoneAsYouType, formatPhoneForDisplay, phoneCountryFromE164, phoneToE164, normalizePhoneToE164,
} from "@/lib/phone";
import type { CountryCode } from "libphonenumber-js";
import { SearchableColumnSelect } from "@/components/SearchableColumnSelect";

type DraftEquipmentType = FleetEquipmentType & { isNew?: boolean };
type DraftFuelType = FleetFuelType & { isNew?: boolean };

const METER_OPTIONS = [
  ["mileage", "Mileage"],
  ["hours", "Hours"],
  ["count", "Count"],
  ["custom", "Custom"],
];

const VIN_FEATURE_DEFAULT_NAMES = new Set(["vehicle", "truck", "tractor", "trailer", "atv", "utv", "snowmobile"]);

const ASSET_TYPE_COMMON_ICONS = ["vehicle", "car", "truck", "trailer", "equipment", "generator"];
const FUEL_TYPE_COMMON_ICONS = ["fuel", "zap", "wind", "flame"];

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
  const [draftName, setDraftName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draftCurrency, setDraftCurrency] = useState("USD");
  const [draftAddressLine, setDraftAddressLine] = useState("");
  const [draftAddressLine2, setDraftAddressLine2] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [draftState, setDraftState] = useState("");
  const [draftZip, setDraftZip] = useState("");
  const [draftCountry, setDraftCountry] = useState("US");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftPhoneCountry, setDraftPhoneCountry] = useState<CountryCode>("US");
  const [draftDefaultCountryCode, setDraftDefaultCountryCode] = useState("US");
  const [draftDefaultCallingCode, setDraftDefaultCallingCode] = useState<CountryCode | "">("");
  const [addressAutoFilled, setAddressAutoFilled] = useState<Set<"city" | "state">>(new Set());
  const [draftTypes, setDraftTypes] = useState<DraftEquipmentType[]>([]);
  const [deletedTypeIds, setDeletedTypeIds] = useState<number[]>([]);
  const [draftFuelTypes, setDraftFuelTypes] = useState<DraftFuelType[]>([]);
  const [deletedFuelTypeIds, setDeletedFuelTypeIds] = useState<number[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addFuelTypeOpen, setAddFuelTypeOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [icon, setIcon] = useState("equipment");
  const [defaultMeter, setDefaultMeter] = useState("mileage");
  const [fuelName, setFuelName] = useState("");
  const [fuelColor, setFuelColor] = useState("#dc2626");
  const [fuelIcon, setFuelIcon] = useState("fuel");
  const [fuelActive, setFuelActive] = useState(true);

  useEffect(() => {
    if (Number.isFinite(fleetId)) setFleetId(fleetId);
  }, [fleetId, setFleetId]);

  const resetDraft = () => {
    setDraftName(fleet?.name ?? "");
    setEditingName(false);
    setDraftCurrency(fleet?.currency ?? "USD");
    setDraftAddressLine(fleet?.addressLine ?? "");
    setDraftAddressLine2(fleet?.addressLine2 ?? "");
    setDraftCity(fleet?.city ?? "");
    setDraftState(fleet?.state ?? "");
    setDraftZip(fleet?.zip ?? "");
    const initialCountry = fleet?.country ?? "US";
    setDraftCountry(initialCountry);
    setDraftPhone(fleet?.phone ? formatPhoneForDisplay(fleet.phone, initialCountry as CountryCode) : "");
    setDraftPhoneCountry(phoneCountryFromE164(fleet?.phone, initialCountry as CountryCode) ?? (initialCountry as CountryCode) ?? "US");
    setDraftDefaultCountryCode(fleet?.defaultCountryCode ?? "US");
    setDraftDefaultCallingCode((fleet?.defaultCallingCode as CountryCode) ?? "");
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
  };

  useEffect(() => {
    resetDraft();
  }, [fleet?.name, fleet?.currency, fleet?.addressLine, fleet?.addressLine2, fleet?.city, fleet?.state, fleet?.zip, fleet?.country, fleet?.phone, fleet?.defaultCountryCode, fleet?.defaultCallingCode, typesQ.data, fuelTypesQ.data]);

  const addressConfig = getCountryAddressConfig(draftCountry);

  const handleAddressZipBlur = async () => {
    const trimmed = draftZip.trim();
    if (trimmed.length < 3) return;
    try {
      const res = await fetch(`https://api.zippopotam.us/${draftCountry.toLowerCase()}/${encodeURIComponent(trimmed)}`);
      if (!res.ok) return; // country not supported by Zippopotam, or code not found — skip gracefully
      const place = await res.json();
      if (place.places?.[0]) {
        const filled = new Set<"city" | "state">();
        setDraftCity(place.places[0]["place name"]);
        filled.add("city");
        if (addressConfig.hasRegion && place.places[0]["state abbreviation"]) {
          setDraftState(place.places[0]["state abbreviation"]);
          filled.add("state");
        }
        setAddressAutoFilled(filled);
        window.setTimeout(() => setAddressAutoFilled(new Set()), 2800);
      }
    } catch { }
  };

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!fleet) return;
      const existingTypes = typesQ.data ?? [];
      const existingById = new Map(existingTypes.map(type => [type.id, type]));
      const existingFuelTypes = fuelTypesQ.data ?? [];
      const existingFuelById = new Map(existingFuelTypes.map(type => [type.id, type]));
      const work: Promise<unknown>[] = [];

      const fleetPatch: Record<string, unknown> = {};
      if (draftName.trim() && draftName.trim() !== fleet.name) fleetPatch.name = draftName.trim();
      if (draftCurrency !== (fleet.currency ?? "USD")) fleetPatch.currency = draftCurrency;
      if (draftAddressLine !== (fleet.addressLine ?? "")) fleetPatch.addressLine = draftAddressLine || null;
      if (draftAddressLine2 !== (fleet.addressLine2 ?? "")) fleetPatch.addressLine2 = draftAddressLine2 || null;
      if (draftCity !== (fleet.city ?? "")) fleetPatch.city = draftCity || null;
      if (draftState !== (fleet.state ?? "")) fleetPatch.state = draftState || null;
      if (draftZip !== (fleet.zip ?? "")) fleetPatch.zip = draftZip || null;
      if (draftCountry !== (fleet.country ?? "US")) fleetPatch.country = draftCountry;
      const nextPhone = phoneToE164(draftPhone, draftPhoneCountry);
      if ((nextPhone ?? "") !== (fleet.phone ?? "")) fleetPatch.phone = nextPhone;
      if (draftDefaultCountryCode !== (fleet.defaultCountryCode ?? "US")) fleetPatch.defaultCountryCode = draftDefaultCountryCode;
      if ((draftDefaultCallingCode || null) !== (fleet.defaultCallingCode ?? null)) fleetPatch.defaultCallingCode = draftDefaultCallingCode || null;
      if (Object.keys(fleetPatch).length) {
        work.push(apiRequest("PATCH", `/api/fleets/${fleet.id}`, fleetPatch));
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

      await Promise.all(work);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/fleets"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/fleet-equipment-types"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/fleet-fuel-types"] });
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

  const addTypeHasChanges = Boolean(name.trim());
  const resetAddTypeDraft = () => {
    setName(""); setColor("#2563eb"); setIcon("equipment"); setDefaultMeter("mileage");
  };
  const { confirmOrRun: confirmAddTypeClose, dialog: addTypeUnsavedDialog } = useUnsavedChangeGuard({
    hasChanges: addTypeHasChanges,
    onSave: addDraftType,
  });
  const handleAddTypeOpenChange = (next: boolean) => {
    if (!next) confirmAddTypeClose(() => { resetAddTypeDraft(); setAddOpen(false); });
    else setAddOpen(next);
  };

  const addFuelTypeHasChanges = Boolean(fuelName.trim());
  const resetAddFuelTypeDraft = () => {
    setFuelName(""); setFuelColor("#dc2626"); setFuelIcon("fuel"); setFuelActive(true);
  };
  const { confirmOrRun: confirmAddFuelTypeClose, dialog: addFuelTypeUnsavedDialog } = useUnsavedChangeGuard({
    hasChanges: addFuelTypeHasChanges,
    onSave: addDraftFuelType,
  });
  const handleAddFuelTypeOpenChange = (next: boolean) => {
    if (!next) confirmAddFuelTypeClose(() => { resetAddFuelTypeDraft(); setAddFuelTypeOpen(false); });
    else setAddFuelTypeOpen(next);
  };

  const hasChanges = !!fleet && (
    (!!draftName.trim() && draftName.trim() !== fleet.name)
    || draftCurrency !== (fleet.currency ?? "USD")
    || draftAddressLine !== (fleet.addressLine ?? "")
    || draftAddressLine2 !== (fleet.addressLine2 ?? "")
    || draftCity !== (fleet.city ?? "")
    || draftState !== (fleet.state ?? "")
    || draftZip !== (fleet.zip ?? "")
    || draftCountry !== (fleet.country ?? "US")
    || (phoneToE164(draftPhone, draftPhoneCountry) ?? "") !== (normalizePhoneToE164(fleet.phone, (fleet.country as CountryCode) ?? "US") ?? "")
    || draftDefaultCountryCode !== (fleet.defaultCountryCode ?? "US")
    || (draftDefaultCallingCode || null) !== (fleet.defaultCallingCode ?? null)
    || deletedTypeIds.length > 0
    || deletedFuelTypeIds.length > 0
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
  );
  if (!fleet) {
    return (
      <AppShell title="Fleet Settings" subtitle="FLEET SETTINGS">
        <Card className="max-w-3xl p-5 space-y-3">
          <h3 className="font-semibold">Fleet not found</h3>
          <p className="text-sm text-muted-foreground">This fleet may have been deleted or is still loading.</p>
          <Button variant="outline" onClick={() => navigate("/fleets")} data-testid="button-back-to-settings">
            <ArrowLeft className="size-4 mr-1.5" /> Back to Fleets
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title={fleet.name} subtitle="FLEET SETTINGS">
      <div className="max-w-6xl space-y-5">
        <EditablePageActions
          hasChanges={hasChanges}
          isSaving={saveSettings.isPending}
          canSave={!!canAdmin && hasChanges}
          onBack={() => navigate("/fleets")}
          onCancel={resetDraft}
          onSave={() => saveSettings.mutate()}
          description={hasChanges ? "You have unsaved fleet settings changes" : undefined}
        >
          <div className="min-w-0">
            {editingName ? (
              <Input
                autoFocus
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); setEditingName(false); }
                  if (e.key === "Escape") { setDraftName(fleet.name); setEditingName(false); }
                }}
                className="h-7 text-sm font-semibold"
                data-testid="input-fleet-name"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-semibold truncate" data-testid="text-fleet-name">{draftName || fleet.name}</div>
                {canAdmin && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => setEditingName(true)}
                    aria-label="Rename fleet"
                    data-testid="button-rename-fleet"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </div>
            )}
            <div className="text-xs text-muted-foreground truncate">/{fleet.slug}</div>
          </div>
        </EditablePageActions>

        {!canAdmin && (
          <Card className="p-4 status-warn">
            Your current fleet role can view these settings, but only Fleet Admins can save changes.
          </Card>
        )}

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto" data-testid="tabs-fleet-settings">
            <TabsTrigger value="general" data-testid="tab-fleet-general">General</TabsTrigger>
            <TabsTrigger value="fuel-types" data-testid="tab-fleet-fuel-types">Fuel Types</TabsTrigger>
            <TabsTrigger value="asset-types" data-testid="tab-fleet-asset-types">Asset Types</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-5">
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
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>Default Country Code</Label>
                    <HelpTooltip content="Pre-fills the address country for new Service Facilities, and the phone country too if no Default Calling Code is set below." testId={`tooltip-fleet-default-country-${fleet.id}`} />
                  </div>
                </div>
                <SearchableColumnSelect
                  items={COUNTRIES}
                  columns={[
                    { key: "name", label: "Country", get: c => c.name },
                    { key: "code", label: "Code", get: c => c.code },
                  ]}
                  getId={c => c.code}
                  value={draftDefaultCountryCode}
                  onSelect={setDraftDefaultCountryCode}
                  triggerLabel={countryName(draftDefaultCountryCode)}
                  placeholder="Select country"
                  disabled={!canAdmin || saveSettings.isPending}
                  data-testid="select-fleet-default-country-code"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>Default Calling Code</Label>
                    <HelpTooltip content="Pre-fills the phone country selector for new Service Facilities. Falls back to Default Country Code above when not set." testId={`tooltip-fleet-default-calling-code-${fleet.id}`} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <SearchableColumnSelect
                    items={PHONE_COUNTRIES_BY_CALLING_CODE}
                    columns={[
                      { key: "callingCode", label: "Code", get: c => `+${c.callingCode}` },
                      { key: "name", label: "Country", get: c => c.name },
                    ]}
                    getId={c => c.code}
                    value={draftDefaultCallingCode}
                    onSelect={code => setDraftDefaultCallingCode(code as CountryCode)}
                    triggerLabel={(() => {
                      const found = PHONE_COUNTRIES_BY_CALLING_CODE.find(c => c.code === draftDefaultCallingCode);
                      return found ? callingCodeLabel(found) : "";
                    })()}
                    placeholder="Same as Default Country Code"
                    disabled={!canAdmin || saveSettings.isPending}
                    data-testid="select-fleet-default-calling-code"
                  />
                  {draftDefaultCallingCode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-muted-foreground"
                      onClick={() => setDraftDefaultCallingCode("")}
                      disabled={!canAdmin || saveSettings.isPending}
                      data-testid="button-clear-fleet-default-calling-code"
                    >
                      Clear (use Default Country Code)
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-5 space-y-4 mt-5">
              <SectionHeader
                icon={<MapPin className="size-4" />}
                label="Address"
                description="Used to geocode this fleet's location for maps and distance-aware features."
              />
              <div>
                <Label>Country</Label>
                <SearchableColumnSelect
                  items={COUNTRIES}
                  columns={[
                    { key: "name", label: "Country", get: c => c.name },
                    { key: "code", label: "Code", get: c => c.code },
                  ]}
                  getId={c => c.code}
                  value={draftCountry}
                  onSelect={code => { setDraftCountry(code); setDraftState(""); }}
                  triggerLabel={countryName(draftCountry)}
                  placeholder="Select country"
                  disabled={!canAdmin || saveSettings.isPending}
                  data-testid="select-fleet-country"
                />
              </div>
              <div>
                <Label>Address Line</Label>
                <Input
                  value={draftAddressLine}
                  onChange={e => setDraftAddressLine(e.target.value)}
                  placeholder="123 Main St"
                  disabled={!canAdmin || saveSettings.isPending}
                  data-testid="input-fleet-address-line"
                />
              </div>
              <div>
                <Label>Address Line 2</Label>
                <Input
                  value={draftAddressLine2}
                  onChange={e => setDraftAddressLine2(e.target.value)}
                  placeholder="Suite, unit, etc. (optional)"
                  disabled={!canAdmin || saveSettings.isPending}
                  data-testid="input-fleet-address-line-2"
                />
              </div>
              <div className={`grid grid-cols-1 gap-3 ${addressConfig.order.length >= 3 ? "sm:grid-cols-[1fr_170px_150px]" : "sm:grid-cols-2"}`}>
                {addressConfig.order.map(key => {
                  if (key === "city") {
                    return (
                      <div key="city">
                        <Label>City</Label>
                        <div className="relative">
                          <Input
                            value={draftCity}
                            onChange={e => setDraftCity(e.target.value)}
                            placeholder="Springfield"
                            disabled={!canAdmin || saveSettings.isPending}
                            className={addressAutoFilled.has("city") ? "border-[hsl(var(--status-ok)/0.4)] bg-[hsl(var(--status-ok)/0.1)] pr-9 transition-colors" : undefined}
                            data-testid="input-fleet-city"
                          />
                          {addressAutoFilled.has("city") && <CheckCircle2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--status-ok))]" />}
                        </div>
                      </div>
                    );
                  }
                  if (key === "region") {
                    if (!addressConfig.hasRegion) return null;
                    return (
                      <div key="region">
                        <Label>{addressConfig.regionLabel}</Label>
                        {draftCountry === "US" || draftCountry === "CA" ? (
                          <SearchableColumnSelect
                            items={STATE_PROVINCE_OPTIONS.filter(option => option.group === (draftCountry === "US" ? "United States" : "Canada"))}
                            columns={[
                              { key: "code", label: "Code", get: o => o.value },
                              { key: "name", label: "Name", get: o => o.label },
                            ]}
                            getId={o => o.value}
                            value={draftState}
                            onSelect={setDraftState}
                            triggerLabel={draftState ? usCaRegionLabel(draftState) : ""}
                            placeholder={`Select ${addressConfig.regionLabel.toLowerCase()}`}
                            className={addressAutoFilled.has("state") ? "border-[hsl(var(--status-ok)/0.4)] bg-[hsl(var(--status-ok)/0.1)] transition-colors" : undefined}
                            disabled={!canAdmin || saveSettings.isPending}
                            data-testid="select-fleet-state"
                          />
                        ) : (
                          <Input
                            value={draftState}
                            onChange={e => setDraftState(e.target.value)}
                            placeholder={addressConfig.regionLabel}
                            disabled={!canAdmin || saveSettings.isPending}
                            className={addressAutoFilled.has("state") ? "border-[hsl(var(--status-ok)/0.4)] bg-[hsl(var(--status-ok)/0.1)] transition-colors" : undefined}
                            data-testid="input-fleet-state"
                          />
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key="postalCode">
                      <Label>ZIP/Postal Code</Label>
                      <Input
                        value={draftZip}
                        onChange={e => setDraftZip(e.target.value)}
                        onBlur={handleAddressZipBlur}
                        placeholder="62701"
                        disabled={!canAdmin || saveSettings.isPending}
                        data-testid="input-fleet-zip"
                      />
                    </div>
                  );
                })}
              </div>
              <div>
                <Label>Phone</Label>
                <div className="flex gap-2">
                  <SearchableColumnSelect
                    items={PHONE_COUNTRIES}
                    columns={[
                      { key: "name", label: "Country", get: c => c.name },
                      { key: "callingCode", label: "Code", get: c => `+${c.callingCode}` },
                    ]}
                    getId={c => c.code}
                    value={draftPhoneCountry}
                    onSelect={code => setDraftPhoneCountry(code as CountryCode)}
                    triggerLabel={(() => {
                      const cc = PHONE_COUNTRIES.find(c => c.code === draftPhoneCountry)?.callingCode;
                      return cc ? `${draftPhoneCountry} +${cc}` : draftPhoneCountry;
                    })()}
                    className="w-[104px] shrink-0 px-2"
                    disabled={!canAdmin || saveSettings.isPending}
                    data-testid="select-fleet-phone-country"
                  />
                  <Input
                    value={draftPhone}
                    onChange={e => setDraftPhone(formatPhoneAsYouType(e.target.value, draftPhoneCountry))}
                    placeholder="(555) 555-1234"
                    className="flex-1"
                    disabled={!canAdmin || saveSettings.isPending}
                    data-testid="input-fleet-phone"
                  />
                </div>
              </div>
              {fleet.latitude != null && fleet.longitude != null ? (
                <p className="text-xs text-muted-foreground" data-testid="text-fleet-geocoded">
                  Located at {fleet.latitude.toFixed(4)}, {fleet.longitude.toFixed(4)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground" data-testid="text-fleet-not-geocoded">
                  Not yet located on a map. Save an address to geocode it.
                </p>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="fuel-types" className="mt-5">
            <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <SectionHeader
              icon={<Fuel className="size-4" />}
              label="Fuel Types"
              description="Configure the fuel options that appear on VIN-enabled asset forms and header pills."
            />
            {addFuelTypeOpen && (
              <DiagnosticsRegistration name="Add Fuel Type" context={{ fleetId, hasChanges: addFuelTypeHasChanges }} />
            )}
            <Dialog open={addFuelTypeOpen} onOpenChange={handleAddFuelTypeOpenChange}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto" disabled={!canAdmin || saveSettings.isPending} data-testid="button-open-add-fuel-type">
                  <Plus className="size-4 mr-1.5" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent hideCloseButton className="max-w-lg">
                <DialogHeader className="flex-row items-center justify-between space-y-0">
                  <DialogTitle>Add Fuel Type</DialogTitle>
                  <DialogHeaderActions
                    onCancel={() => handleAddFuelTypeOpenChange(false)}
                    onSave={addDraftFuelType}
                    canSave={!!canAdmin && !!fuelName.trim()}
                    hasChanges={addFuelTypeHasChanges}
                  />
                </DialogHeader>
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
                </div>
                {addFuelTypeUnsavedDialog}
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
          </TabsContent>

          <TabsContent value="asset-types" className="mt-5">
            <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <SectionHeader
              icon={<Tags className="size-4" />}
              label="Asset Types"
              description="Configure the asset tag, default meter, and whether VIN-powered features are available for this fleet."
            />
            {addOpen && (
              <DiagnosticsRegistration name="Add Asset Type" context={{ fleetId, hasChanges: addTypeHasChanges }} />
            )}
            <Dialog open={addOpen} onOpenChange={handleAddTypeOpenChange}>
              <DialogTrigger asChild>
                <Button size="sm" className="ml-auto" disabled={!canAdmin || saveSettings.isPending} data-testid="button-open-add-equipment-type">
                  <Plus className="size-4 mr-1.5" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent hideCloseButton className="max-w-lg">
                <DialogHeader className="flex-row items-center justify-between space-y-0">
                  <DialogTitle>Add Asset Type</DialogTitle>
                  <DialogHeaderActions
                    onCancel={() => handleAddTypeOpenChange(false)}
                    onSave={addDraftType}
                    canSave={!!canAdmin && !!name.trim()}
                    hasChanges={addTypeHasChanges}
                  />
                </DialogHeader>
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
                </div>
                {addTypeUnsavedDialog}
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
          </TabsContent>
        </Tabs>
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
  const commonIcons = EQUIPMENT_ICON_OPTIONS.filter(option => ASSET_TYPE_COMMON_ICONS.includes(option.value));

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
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {commonIcons.map(option => (
              <button
                key={option.value}
                type="button"
                title={option.label}
                className={`flex h-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${normalizeEquipmentIcon(type.icon) === option.value ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : ""}`}
                onClick={() => onChange({ icon: normalizeEquipmentIcon(option.value) })}
                data-testid={`button-asset-type-icon-common-${type.id}-${option.value}`}
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
  const commonIcons = FUEL_ICON_OPTIONS.filter(option => FUEL_TYPE_COMMON_ICONS.includes(option.value));
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
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {commonIcons.map(option => (
              <button
                key={option.value}
                type="button"
                title={option.label}
                className={`flex h-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${normalizeFuelIcon(type.icon) === option.value ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : ""}`}
                onClick={() => onChange({ icon: normalizeFuelIcon(option.value) })}
                data-testid={`button-fuel-type-icon-common-${type.id}-${option.value}`}
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
