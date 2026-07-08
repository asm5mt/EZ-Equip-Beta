import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditablePageActions } from "@/components/EditablePageActions";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
import { insertAssetSchema, type Asset, type FleetEquipmentType, type FleetFuelType } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { PLATE_JURISDICTIONS } from "@/lib/plates";
import { SearchableColumnSelect } from "@/components/SearchableColumnSelect";
import { FuelTypeIcon, activeFuelTypes, fuelTypeByName, mapVinFuelType } from "@/lib/fuel-types";
import { CheckCircle2, Info, Loader2, Search } from "lucide-react";

const METER_TYPES = ["mileage", "hours", "count", "custom"] as const;
const VIN_LENGTH = 17;
const INACTIVE_REASON_OPTIONS = ["Sold", "In Repair", "Stored Seasonally", "Retired", "Other"] as const;

const formSchema = insertAssetSchema.extend({
  friendlyName: z.string().min(1, "Required"),
  assetType: z.string().min(1, "Required"),
  meterType: z.enum(METER_TYPES),
});

type FormValues = z.infer<typeof formSchema>;

type DecodedVinValues = Partial<Record<
  "ModelYear" | "Make" | "Model" | "Trim" | "EngineModel" | "DisplacementL" | "EngineCylinders" | "EngineConfiguration" | "DriveType" | "TransmissionStyle" | "FuelTypePrimary" | "GVWR" | "BodyClass",
  string | null
>>;

const ENGINE_CONFIGURATION_OPTIONS = [
  ["Inline (I)", "Inline (I)"],
  ["V", "V"],
  ["Opposed / Flat (H)", "Opposed / Flat (H)"],
  ["Rotary (Wankel)", "Rotary (Wankel)"],
  ["W", "W"],
  ["Single-cylinder", "Single-cylinder"],
  ["Other", "Other"],
] as const;

export default function AssetForm({ mode }: { mode: "new" | "edit" }) {
  const [, params] = useRoute("/assets/:id/edit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { fleet, canEdit } = useAppContext();
  const id = mode === "edit" && params ? Number(params.id) : null;
  const [vinError, setVinError] = useState<string | null>(null);
  const [vinSuccess, setVinSuccess] = useState<string | null>(null);
  const [vinFuelWarning, setVinFuelWarning] = useState<string | null>(null);
  const [vinDecoding, setVinDecoding] = useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<keyof FormValues>>(new Set());

  const assetQ = useQuery<Asset>({ queryKey: ["/api/assets", id], enabled: !!id });
  const typeFleetId = assetQ.data?.fleetId ?? fleet?.id;
  const typesQ = useQuery<FleetEquipmentType[]>({ queryKey: ["/api/fleet-equipment-types", { fleetId: typeFleetId }], enabled: !!typeFleetId });
  const fuelTypesQ = useQuery<FleetFuelType[]>({ queryKey: ["/api/fleet-fuel-types", { fleetId: typeFleetId }], enabled: !!typeFleetId });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fleetId: fleet?.id ?? 1,
      friendlyName: "",
      assetType: "",
      year: undefined as any,
      make: "",
      model: "",
      trim: "",
      vin: "",
      serial: "",
      plateJurisdiction: null,
      plateNumber: "",
      engine: "",
      transmission: "",
      drivetrain: "",
      fuelType: "",
      displacementLiters: null,
      engineCylinders: null,
      engineConfiguration: "",
      gvwr: "",
      bodyType: "",
      vinDecodedFields: "[]",
      acquisitionDate: null,
      meterType: "mileage",
      meterLabel: "",
      currentMeter: 0,
      meterAsOf: new Date(),
      isActive: true,
      inactiveReason: "",
      status: "active",
      notes: "",
    } as any,
  });

  useEffect(() => {
    if (assetQ.data) {
      form.reset({
        ...assetQ.data,
        vin: cleanVin(assetQ.data.vin ?? ""),
        meterAsOf: assetQ.data.meterAsOf ? new Date(assetQ.data.meterAsOf) : new Date(),
        acquisitionDate: assetQ.data.acquisitionDate ? new Date(assetQ.data.acquisitionDate) : null,
      } as any);
    }
  }, [assetQ.data]);

  useEffect(() => {
    if (mode === "new" && fleet) form.setValue("fleetId", fleet.id);
  }, [fleet, mode]);

  useEffect(() => {
    if (mode === "new" && typesQ.data?.length) {
      const first = typesQ.data.find(t => t.active) ?? typesQ.data[0];
      if (first && !form.getValues("assetType")) {
        form.setValue("assetType", first.name);
        form.setValue("meterType", first.defaultMeter as any);
      }
    }
  }, [typesQ.data, mode]);

  const selectedAssetType = form.watch("assetType");
  const selectedType = useMemo(
    () => typesQ.data?.find(type => type.name === selectedAssetType),
    [typesQ.data, selectedAssetType],
  );
  const vinFeaturesEnabled = Boolean(selectedType?.enableVinFeatures);
  const vinValue = cleanVin(String(form.watch("vin") ?? ""));
  const vinDecodedFieldsValue = String(form.watch("vinDecodedFields") ?? "[]");
  const vinSourceFields = useMemo(() => parseVinDecodedFields(vinDecodedFieldsValue), [vinDecodedFieldsValue]);

  const setAutoFilled = (fields: Array<keyof FormValues>) => {
    setAutoFilledFields(new Set(fields));
    window.setTimeout(() => setAutoFilledFields(new Set()), 2800);
  };

  const decodeVin = async (vin = vinValue) => {
    const cleaned = cleanVin(vin);
    form.setValue("vin", cleaned as any, { shouldDirty: true, shouldValidate: true });
    setVinSuccess(null);
    setVinFuelWarning(null);
    if (cleaned.length !== VIN_LENGTH) {
      setVinError("A VIN must be exactly 17 characters");
      return;
    }
    if (vinDecoding) return;
    setVinError(null);
    setVinDecoding(true);
    try {
      const decoded = await fetchDecodedVin(cleaned);
      const updates: Array<[keyof FormValues, any]> = [];
      const year = meaningfulValue(decoded.ModelYear);
      const make = meaningfulValue(decoded.Make);
      const model = meaningfulValue(decoded.Model);
      const trim = meaningfulValue(decoded.Trim);
      const engineModel = meaningfulValue(decoded.EngineModel);
      const engineFallback = buildEngineFallback(decoded);
      const driveType = meaningfulValue(decoded.DriveType);
      const transmissionStyle = meaningfulValue(decoded.TransmissionStyle);
      const fuel = mapVinFuelType(decoded.FuelTypePrimary, fuelTypesQ.data);
      const displacement = meaningfulValue(decoded.DisplacementL);
      const cylinders = meaningfulValue(decoded.EngineCylinders);
      const engineConfiguration = mapEngineConfiguration(decoded.EngineConfiguration);
      const gvwr = meaningfulValue(decoded.GVWR);
      const bodyType = meaningfulValue(decoded.BodyClass);

      if (year) updates.push(["year", Number(year)]);
      if (make) updates.push(["make", make]);
      if (model) updates.push(["model", model]);
      if (trim) updates.push(["trim", trim]);
      if (engineModel || engineFallback) updates.push(["engine", engineModel || engineFallback]);
      if (driveType) updates.push(["drivetrain", driveType]);
      if (transmissionStyle) updates.push(["transmission", transmissionStyle]);
      if (fuel.value) updates.push(["fuelType", fuel.value]);
      if (displacement) updates.push(["displacementLiters", Number(displacement)]);
      if (cylinders) updates.push(["engineCylinders", Number(cylinders)]);
      if (engineConfiguration) updates.push(["engineConfiguration", engineConfiguration]);
      if (gvwr) updates.push(["gvwr", gvwr]);
      if (bodyType) updates.push(["bodyType", bodyType]);

      for (const [field, value] of updates) {
        form.setValue(field as any, value, { shouldDirty: true, shouldValidate: true });
      }
      form.setValue("vinDecodedFields" as any, JSON.stringify(updates.map(([field]) => field)), { shouldDirty: true });
      setVinFuelWarning(fuel.warning || null);
      setAutoFilled(updates.map(([field]) => field));
      setVinSuccess(updates.length
        ? "VIN decoded; asset details were updated."
        : "VIN decoded, but no matching detail fields were returned.");
    } catch (error) {
      setVinError(`VIN decode unavailable. ${String((error as Error)?.message ?? error)}`);
    } finally {
      setVinDecoding(false);
    }
  };

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: any = { ...values };
      const configuredType = typesQ.data?.find(type => type.name === values.assetType);
      if (configuredType && !configuredType.enableVinFeatures) {
        for (const k of ["trim", "vin", "plateJurisdiction", "plateNumber", "engine", "transmission", "drivetrain", "fuelType", "displacementLiters", "engineCylinders", "engineConfiguration", "gvwr", "bodyType", "vinDecodedFields"] as const) {
          payload[k] = null;
        }
      }
      for (const k of ["make","model","trim","vin","serial","plateJurisdiction","plateNumber","engine","transmission","drivetrain","fuelType","engineConfiguration","gvwr","bodyType","vinDecodedFields","meterLabel","notes"] as const) {
        if (payload[k] === "") payload[k] = null;
      }
      if (payload.vin) payload.vin = cleanVin(payload.vin);
      if (payload.plateNumber) payload.plateNumber = String(payload.plateNumber).toUpperCase();
      if (payload.acquisitionDate === "") payload.acquisitionDate = null;
      payload.isActive = payload.isActive !== false;
      payload.inactiveReason = payload.isActive ? null : (String(payload.inactiveReason ?? "").trim() || null);
      payload.status = payload.isActive ? "active" : "inactive";
      if (payload.year === "" || payload.year == null) payload.year = null;
      if (payload.displacementLiters === "" || payload.displacementLiters == null || Number.isNaN(payload.displacementLiters)) payload.displacementLiters = null;
      if (payload.engineCylinders === "" || payload.engineCylinders == null || Number.isNaN(payload.engineCylinders)) payload.engineCylinders = null;
      if (id) {
        const r = await apiRequest("PATCH", `/api/assets/${id}`, payload);
        return r.json() as Promise<Asset>;
      }
      const r = await apiRequest("POST", "/api/assets", payload);
      return r.json() as Promise<Asset>;
    },
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", a.id] });
      toast({ title: id ? "Asset updated" : "Asset created" });
      navigate(`/assets/${a.id}`);
    },
    onError: (e) => toast({ title: "Save failed", description: String(e), variant: "destructive" }),
  });

  const submit = (values: FormValues) => {
    const configuredType = typesQ.data?.find(type => type.name === values.assetType);
    const requiresYmm = Boolean(configuredType?.enableVinFeatures);
    let blocked = false;
    if (requiresYmm && !values.year) {
      form.setError("year", { message: "Required" });
      blocked = true;
    }
    if (requiresYmm && !String(values.make ?? "").trim()) {
      form.setError("make", { message: "Required" });
      blocked = true;
    }
    if (requiresYmm && !String(values.model ?? "").trim()) {
      form.setError("model", { message: "Required" });
      blocked = true;
    }
    if (blocked) return;
    save.mutate(values);
  };
  const goBack = () => navigate(id ? `/assets/${id}` : "/assets");

  return (
    <AppShell title={assetQ.data?.friendlyName ?? (mode === "edit" ? "Asset" : "New Asset")} subtitle={mode === "edit" ? "EDIT ASSET" : "NEW ASSET"}>
      <div className="space-y-5">
        <EditablePageActions
          hasChanges={form.formState.isDirty}
          isSaving={save.isPending}
          canSave={canEdit}
          onBack={goBack}
          onCancel={goBack}
          onSave={form.handleSubmit(submit)}
          saveLabel={id ? "Save Changes" : "Save"}
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
            {!canEdit && (
              <Card className="rounded-xl border-[hsl(var(--status-warn)/0.35)] bg-[hsl(var(--status-warn)/0.08)] p-4 text-sm">
                Viewer access is read-only. Switch to an editor or admin user to save asset changes.
              </Card>
            )}

            <div className={vinFeaturesEnabled ? "grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start" : ""}>
              {vinFeaturesEnabled && (
                <SectionCard title="VIN Lookup" description="Decode a 17-character VIN to auto-fill core asset details.">
                  <FormField name="vin" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FieldLabel
                        required={false}
                        label="VIN"
                        tooltip="Vehicle Identification Number — 17 characters. Decode to auto-fill year, make, model, and technical specs."
                      />
                      <FormControl>
                        <VinSegmentInput
                          value={String(field.value ?? "")}
                          onChange={value => {
                            setVinError(null);
                            setVinSuccess(null);
                            setVinFuelWarning(null);
                            field.onChange(value);
                          }}
                          disabled={!canEdit || save.isPending}
                        />
                      </FormControl>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">Enter VIN to auto-fill asset details, or fill fields manually below.</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => decodeVin(vinValue)}
                          disabled={!canEdit || vinDecoding || save.isPending}
                          data-testid="button-decode-vin-form"
                        >
                          {vinDecoding ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Search className="mr-1.5 size-3.5" />}
                          Decode VIN
                        </Button>
                      </div>
                      {vinError && <p className="text-xs font-medium text-[hsl(var(--status-overdue))]" data-testid="error-vin-decode">{vinError}</p>}
                      {vinSuccess && <p className="text-xs font-medium text-[hsl(var(--status-ok))]" data-testid="success-vin-decode">{vinSuccess}</p>}
                      {vinFuelWarning && <p className="rounded-md border border-[hsl(var(--status-warn)/0.25)] bg-[hsl(var(--status-warn)/0.1)] px-3 py-2 text-xs font-medium text-[hsl(var(--status-warn))]" data-testid="warning-vin-fuel">{vinFuelWarning}</p>}
                      <FormMessage />
                    </FormItem>
                  )} />
                </SectionCard>
              )}

              <SectionCard title="Basic Information" description={vinFeaturesEnabled ? "Core identity fields for this asset." : "Essential identifying information for this asset."}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <FormField name="friendlyName" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FieldLabel label="Friendly Name" required />
                      <FormControl><Input data-testid="input-friendly-name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField name="assetType" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FieldLabel
                        label="Asset Type"
                        required
                        tooltip={vinFeaturesEnabled ? "VIN lookup is enabled for this asset type. Enter a VIN above to auto-fill details." : undefined}
                      />
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        const selected = typesQ.data?.find(t => t.name === value);
                        if (selected) form.setValue("meterType", selected.defaultMeter as any, { shouldDirty: true });
                      }} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-asset-type"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>{(typesQ.data ?? []).filter(t => t.active).map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {vinFeaturesEnabled ? (
                    <>
                      <AutoFillField name="year" label="Year" required control={form.control} autoFilled={autoFilledFields.has("year")} vinSource={vinSourceFields.has("year")} type="number" />
                      <AutoFillField name="make" label="Make" required control={form.control} autoFilled={autoFilledFields.has("make")} vinSource={vinSourceFields.has("make")} />
                      <AutoFillField name="model" label="Model" required control={form.control} autoFilled={autoFilledFields.has("model")} vinSource={vinSourceFields.has("model")} />
                      <AutoFillField name="trim" label="Trim" control={form.control} autoFilled={autoFilledFields.has("trim")} vinSource={vinSourceFields.has("trim")} />
                    </>
                  ) : (
                    <>
                      <AutoFillField name="make" label="Manufacturer" control={form.control} autoFilled={false} />
                      <AutoFillField name="model" label="Model" control={form.control} autoFilled={false} />
                      <AutoFillField name="year" label="Year" control={form.control} autoFilled={false} type="number" />
                      <FormField name="serial" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FieldLabel label="Serial Number" tooltip="Manufacturer serial number or equipment ID, used for warranty and service records." />
                          <FormControl><Input data-testid="input-serial" {...field} value={field.value ?? ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </>
                  )}
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Status" description="Inactive assets stay in EZ-EQUIP for history and reporting, but are hidden from the active assets list by default.">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,0.55fr)_1fr] lg:items-start">
                <FormField name="isActive" control={form.control} render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3">
                    <div>
                      <FieldLabel label="Active" />
                      <p className="mt-1 text-xs text-muted-foreground">Turn off when this asset is sold, stored, retired, or otherwise out of active service.</p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value !== false}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (checked) form.setValue("inactiveReason", "" as any, { shouldDirty: true });
                        }}
                        disabled={!canEdit || save.isPending}
                        data-testid="switch-asset-active"
                      />
                    </FormControl>
                  </FormItem>
                )} />
                {form.watch("isActive") === false && (
                  <FormField name="inactiveReason" control={form.control} render={({ field }) => {
                    const value = String(field.value ?? "");
                    const presetValues = INACTIVE_REASON_OPTIONS.filter(option => option !== "Other");
                    const selected = value && presetValues.includes(value as any) ? value : "Other";
                    return (
                      <FormItem>
                        <FieldLabel label="Inactive Reason" />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr]">
                          <Select
                            value={selected}
                            onValueChange={(next) => field.onChange(next === "Other" ? "" : next)}
                            disabled={!canEdit || save.isPending}
                          >
                            <FormControl><SelectTrigger data-testid="select-inactive-reason"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {INACTIVE_REASON_OPTIONS.map(reason => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormControl>
                            <Input
                              data-testid="input-inactive-reason"
                              value={value}
                              onChange={event => field.onChange(event.target.value)}
                              placeholder="Reason, if different"
                              disabled={!canEdit || save.isPending}
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                )}
              </div>
            </SectionCard>

            {vinFeaturesEnabled && (
              <SectionCard title="Technical Details" description="Optional technical details decoded from VIN or entered manually.">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <AutoFillField name="engine" label="Engine" control={form.control} autoFilled={autoFilledFields.has("engine")} vinSource={vinSourceFields.has("engine")} />
                  <AutoFillField name="transmission" label="Transmission" control={form.control} autoFilled={autoFilledFields.has("transmission")} vinSource={vinSourceFields.has("transmission")} />
                  <AutoFillField name="drivetrain" label="Drivetrain" control={form.control} autoFilled={autoFilledFields.has("drivetrain")} vinSource={vinSourceFields.has("drivetrain")} />
                  <FuelTypeField
                    control={form.control}
                    fuelTypes={activeFuelTypes(fuelTypesQ.data)}
                    autoFilled={autoFilledFields.has("fuelType")}
                    vinSource={vinSourceFields.has("fuelType")}
                  />
                  <AutoFillField name="displacementLiters" label="Displacement (L)" control={form.control} autoFilled={autoFilledFields.has("displacementLiters")} vinSource={vinSourceFields.has("displacementLiters")} type="number" />
                  <AutoFillField name="engineCylinders" label="Engine Cylinders" control={form.control} autoFilled={autoFilledFields.has("engineCylinders")} vinSource={vinSourceFields.has("engineCylinders")} type="number" />
                  <EngineConfigurationField
                    control={form.control}
                    autoFilled={autoFilledFields.has("engineConfiguration")}
                    vinSource={vinSourceFields.has("engineConfiguration")}
                  />
                  <AutoFillField name="gvwr" label="GVWR / Weight Class" control={form.control} autoFilled={autoFilledFields.has("gvwr")} vinSource={vinSourceFields.has("gvwr")} />
                  <AutoFillField name="bodyType" label="Body Type" control={form.control} autoFilled={autoFilledFields.has("bodyType")} vinSource={vinSourceFields.has("bodyType")} />
                  <FormField name="serial" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FieldLabel label="Serial / Equipment Number" />
                      <FormControl><Input data-testid="input-serial" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField name="plateJurisdiction" control={form.control} render={({ field }) => {
                    const value = (field.value as string | null) ?? "none";
                    const selected = PLATE_JURISDICTIONS.find(j => j.code === value);
                    return (
                      <FormItem>
                        <FieldLabel label="Plate State / Province" />
                        <SearchableColumnSelect
                          items={[{ code: "none", short: "—", label: "Not set", country: "US" as const }, ...PLATE_JURISDICTIONS]}
                          columns={[
                            { key: "short", label: "Code", get: j => j.short },
                            { key: "label", label: "State / Province", get: j => j.label },
                          ]}
                          getId={j => j.code}
                          value={value}
                          onSelect={(code) => field.onChange(code === "none" ? null : code)}
                          triggerLabel={selected ? selected.label : "Not set"}
                          placeholder="Select"
                          data-testid="select-plate-jurisdiction"
                        />
                        <FormMessage />
                      </FormItem>
                    );
                  }} />
                  <FormField name="plateNumber" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FieldLabel label="Plate Number" />
                      <FormControl><Input data-testid="input-plate-number" {...field} value={field.value ?? ""} className="uppercase" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </SectionCard>
            )}

            <SectionCard title="Meter & Tracking" description="Set the starting point for maintenance tracking.">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <FormField name="meterType" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FieldLabel label="Meter Type" tooltip="Primary tracking unit for maintenance schedules. This default was set when the asset type was configured." />
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-meter-type"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{METER_TYPES.map(t => <SelectItem key={t} value={t}>{labelMeterType(t)}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {form.watch("meterType") === "custom" && (
                  <FormField name="meterLabel" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FieldLabel label="Custom Meter Label" />
                      <FormControl><Input data-testid="input-meter-label" {...field} value={field.value ?? ""} placeholder="e.g. cycles, starts, bales" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                <FormField name="currentMeter" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FieldLabel label="Current Reading" tooltip="Starting value for meter tracking. Leave at 0 for a new asset or enter the current odometer/hour reading." />
                    <FormControl><Input type="number" step="any" data-testid="input-current-meter" {...field} value={field.value ?? 0} onChange={e => field.onChange(Number(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="acquisitionDate" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FieldLabel label="Acquisition Date" />
                    <FormControl><Input type="date" data-testid="input-acquisition-date" value={field.value ? new Date(field.value as any).toISOString().slice(0, 10) : ""} onChange={e => field.onChange(e.target.value ? new Date(e.target.value) : null)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </SectionCard>

            <SectionCard title="Notes" description="Free-form notes for this asset.">
              <FormField name="notes" control={form.control} render={({ field }) => (
                <FormItem>
                  <FieldLabel label="Notes" />
                  <FormControl><Textarea rows={4} data-testid="textarea-notes" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </SectionCard>
          </form>
        </Form>
      </div>
    </AppShell>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-xl border-border/80 bg-card/95 p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </Card>
  );
}

function FieldLabel({ label, required, tooltip, vinSource }: { label: string; required?: boolean; tooltip?: string; vinSource?: boolean }) {
  return (
    <FormLabel className="flex items-center gap-1.5">
      <span>{label}{required && <span className="text-[hsl(var(--status-overdue))]"> *</span>}</span>
      {vinSource && (
        <span className="rounded-full border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.12)] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-[hsl(var(--primary))]">
          VIN
        </span>
      )}
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={tooltip}
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </FormLabel>
  );
}

function AutoFillField({
  name,
  label,
  control,
  required = false,
  autoFilled,
  vinSource = false,
  type = "text",
}: {
  name: keyof FormValues;
  label: string;
  control: any;
  required?: boolean;
  autoFilled: boolean;
  vinSource?: boolean;
  type?: "text" | "number";
}) {
  return (
    <FormField name={name as any} control={control} render={({ field }) => (
      <FormItem>
        <FieldLabel label={label} required={required} vinSource={vinSource} />
        <FormControl>
          <div className="relative">
            <Input
              type={type}
              data-testid={`input-${String(name).replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`}
              {...field}
              value={field.value ?? ""}
              onChange={event => {
                if (type === "number") field.onChange(event.target.value === "" ? null : Number(event.target.value));
                else field.onChange(event.target.value);
              }}
              className={autoFilled ? "border-[hsl(var(--status-ok)/0.4)] bg-[hsl(var(--status-ok)/0.1)] pr-9 transition-colors" : vinSource ? "bg-[hsl(var(--primary)/0.06)] italic" : undefined}
            />
            {autoFilled && <CheckCircle2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--status-ok))]" />}
          </div>
        </FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );
}

function FuelTypeField({
  control,
  fuelTypes,
  autoFilled,
  vinSource,
}: {
  control: any;
  fuelTypes: FleetFuelType[];
  autoFilled: boolean;
  vinSource: boolean;
}) {
  return (
    <FormField name={"fuelType" as any} control={control} render={({ field }) => {
      const selected = fuelTypeByName(fuelTypes, field.value);
      return (
        <FormItem>
          <FieldLabel label="Fuel Type" vinSource={vinSource} />
          <Select value={field.value || "none"} onValueChange={value => field.onChange(value === "none" ? "" : value)}>
            <FormControl>
              <SelectTrigger
                className={autoFilled ? "border-[hsl(var(--status-ok)/0.4)] bg-[hsl(var(--status-ok)/0.1)] transition-colors" : vinSource ? "bg-[hsl(var(--primary)/0.06)] italic" : undefined}
                data-testid="select-fuel-type"
              >
                <SelectValue placeholder="Select fuel type">
                  {selected ? (
                    <span className="inline-flex items-center gap-2">
                      <FuelTypeIcon icon={selected.icon} className="size-4" style={{ color: selected.color }} />
                      {selected.name}
                    </span>
                  ) : "Select fuel type"}
                </SelectValue>
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {fuelTypes.map(type => (
                <SelectItem key={type.id} value={type.name}>
                  <span className="inline-flex items-center gap-2">
                    <FuelTypeIcon icon={type.icon} className="size-4" style={{ color: type.color }} />
                    {type.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      );
    }} />
  );
}

function EngineConfigurationField({
  control,
  autoFilled,
  vinSource,
}: {
  control: any;
  autoFilled: boolean;
  vinSource: boolean;
}) {
  return (
    <FormField name={"engineConfiguration" as any} control={control} render={({ field }) => (
      <FormItem>
        <FieldLabel label="Engine Configuration" vinSource={vinSource} />
        <Select value={field.value || "none"} onValueChange={value => field.onChange(value === "none" ? "" : value)}>
          <FormControl>
            <SelectTrigger
              className={autoFilled ? "border-[hsl(var(--status-ok)/0.4)] bg-[hsl(var(--status-ok)/0.1)] transition-colors" : vinSource ? "bg-[hsl(var(--primary)/0.06)] italic" : undefined}
              data-testid="select-engine-configuration"
            >
              <SelectValue placeholder="Select engine configuration" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            <SelectItem value="none">Not set</SelectItem>
            {ENGINE_CONFIGURATION_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    )} />
  );
}

function VinSegmentInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cleaned = cleanVin(value);
  const activeIndex = Math.min(cleaned.length, VIN_LENGTH - 1);
  const chars = Array.from({ length: VIN_LENGTH }, (_, index) => cleaned[index] ?? "");

  return (
    <div
      className="relative rounded-xl border border-border bg-muted/30 p-3 transition-colors focus-within:border-[hsl(var(--primary))] focus-within:bg-background"
      onClick={() => inputRef.current?.focus()}
      data-testid="widget-vin-segmented"
    >
      <input
        ref={inputRef}
        value={cleaned}
        disabled={disabled}
        maxLength={VIN_LENGTH}
        onChange={event => onChange(cleanVin(event.target.value))}
        onPaste={event => {
          event.preventDefault();
          onChange(cleanVin(event.clipboardData.getData("text")));
        }}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
        aria-label="VIN"
        data-testid="input-vin-segmented"
      />
      <div className="grid grid-cols-[repeat(17,minmax(0,1fr))] gap-1 sm:gap-1.5" aria-hidden="true">
        {chars.map((char, index) => (
          <div
            key={index}
            className={`flex h-10 items-center justify-center border-b-2 font-mono text-base font-semibold tracking-widest transition-colors sm:h-11 sm:text-lg ${
              index === activeIndex && cleaned.length < VIN_LENGTH
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] text-foreground"
                : char
                  ? "border-foreground/40 text-foreground"
                  : "border-muted-foreground/35 text-muted-foreground"
            }`}
          >
            {char || "_"}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-mono">{cleaned.length}/{VIN_LENGTH}</span>
        <span>Paste or type the full VIN</span>
      </div>
    </div>
  );
}

async function fetchDecodedVin(vin: string): Promise<DecodedVinValues> {
  const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
  if (!response.ok) throw new Error(`NHTSA vPIC returned ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.Results) ? data.Results[0] ?? {} : {};
}

function cleanVin(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, VIN_LENGTH);
}

function meaningfulValue(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (normalized === "0" || normalized === "not applicable" || normalized === "n/a") return "";
  return text;
}

function buildEngineFallback(decoded: DecodedVinValues) {
  const displacement = meaningfulValue(decoded.DisplacementL);
  const cylinders = meaningfulValue(decoded.EngineCylinders);
  const parts = [];
  if (displacement) parts.push(`${displacement}L`);
  if (cylinders) parts.push(`${cylinders} cyl`);
  return parts.join(" ");
}

function mapEngineConfiguration(value?: string | null) {
  const text = meaningfulValue(value);
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (normalized.includes("in-line") || normalized.includes("inline")) return "Inline (I)";
  if (normalized === "v" || normalized.includes("v-shape")) return "V";
  if (normalized.includes("opposed") || normalized.includes("flat")) return "Opposed / Flat (H)";
  if (normalized.includes("rotary") || normalized.includes("wankel")) return "Rotary (Wankel)";
  if (normalized.includes("w-shape") || normalized === "w") return "W";
  if (normalized.includes("single")) return "Single-cylinder";
  return "";
}

function parseVinDecodedFields(value?: string | null) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map(item => String(item)));
  } catch {
    return new Set<string>();
  }
}

function labelMeterType(value: string) {
  const labels: Record<string, string> = {
    mileage: "Mileage",
    hours: "Hours",
    count: "Count",
    custom: "Custom",
  };
  return labels[value] ?? value;
}
