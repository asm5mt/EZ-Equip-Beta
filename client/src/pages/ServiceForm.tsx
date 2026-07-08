import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { EditablePageActions } from "@/components/EditablePageActions";
import { Plus, Trash2, Paperclip, FileText, Image as ImageIcon, Eye, ChevronsUpDown, Pencil, Save as SaveIcon, Copy } from "lucide-react";
import { z } from "zod";
import type { Asset, InventoryCategory, InventoryCategoryField, MaintenanceSchedule, InventoryItem, ServiceEvent, ServiceFacility, ServiceLineItem } from "@shared/schema";
import { scheduleIntervalSummary, formatCurrency } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { formatDateInput } from "@/lib/format";
import { currencySymbol } from "@/lib/currencies";
import { modeBadgeClass, modeLabel } from "@/lib/mode-styles";
import { computeKeySpecCollisions, fieldsForCategory, getFieldValue, inventoryItemTitle, titleFieldsForCategory } from "@/lib/inventory-display";
import { InventoryCategoryIcon } from "@/lib/inventory-category-icons";
import { tintedBadgeStyle } from "@/lib/badges";
import { schedulesApplicableToAsset } from "@/lib/schedule";
import { mapsUrlFor } from "@/lib/maps";
import { composeAddress } from "@shared/address";
import { ALLOWED_ATTACHMENT_MIME_TYPES } from "@shared/schema";
import { downloadAttachment, isImageAttachment, type ViewableAttachment } from "@/lib/attachments";
import { AttachmentImageDialog } from "@/components/AttachmentImageDialog";

const NON_INVENTORY_CATEGORY = "__non_inventory__";
const UNSCHEDULED_SERVICE = "__unscheduled_service__";
const IN_HOUSE = "__in_house__";

const lineSchema = z.object({
  inventoryItemId: z.number().nullable(),
  itemName: z.string().min(1, "Required"),
  partNumber: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  spec: z.string().optional().nullable(),
  quantity: z.number().min(0).default(1),
  unit: z.string().optional().nullable(),
  unitCost: z.number().nullable().optional(),
  notes: z.string().optional().nullable(),
});

const formSchema = z.object({
  assetId: z.number(),
  scheduleId: z.number().nullable(),
  eventType: z.enum(["scheduled", "repair", "unscheduled"]),
  title: z.string().min(1),
  performedAt: z.string().min(1),
  meterAtService: z.number().nullable(),
  vendor: z.string().optional().nullable(),
  technician: z.string().optional().nullable(),
  serviceFacilityId: z.number().nullable(),
  facilityAddress: z.string().optional().nullable(),
  facilityPhone: z.string().optional().nullable(),
  cost: z.number().nullable(),
  notes: z.string().optional().nullable(),
  lineItems: z.array(lineSchema).default([]),
});
type FormValues = z.infer<typeof formSchema>;
type PendingAttachment = {
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export default function ServiceForm() {
  const [, params] = useRoute("/assets/:assetId/services/new");
  const [, editParams] = useRoute("/events/:id/edit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { fleet, canEdit } = useAppContext();
  const editEventId = editParams ? Number(editParams.id) : 0;
  const fleetCurrency = fleet?.currency ?? "USD";
  const costLabel = `Total Cost (${fleetCurrency} ${currencySymbol(fleetCurrency)})`;
  const eventQ = useQuery<ServiceEvent>({ queryKey: ["/api/service-events", editEventId], enabled: !!editEventId });
  const assetId = params ? Number(params.assetId) : (eventQ.data?.assetId ?? 0);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [viewingImage, setViewingImage] = useState<ViewableAttachment | null>(null);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [facilityPickerOpen, setFacilityPickerOpen] = useState(false);
  const [facilitySearch, setFacilitySearch] = useState("");

  const assetQ = useQuery<Asset>({ queryKey: ["/api/assets", assetId], enabled: !!assetId });
  const schedulesQ = useQuery<MaintenanceSchedule[]>({
    queryKey: ["/api/schedules", { fleetId: assetQ.data?.fleetId }], enabled: !!assetQ.data?.fleetId,
  });
  const serviceFacilitiesQ = useQuery<ServiceFacility[]>({
    queryKey: ["/api/service-facilities"],
  });
  const inventoryQ = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory-items", { fleetId: fleet?.id }], enabled: !!fleet,
  });
  const inventoryCategoriesQ = useQuery<InventoryCategory[]>({
    queryKey: ["/api/inventory-categories", { fleetId: fleet?.id }], enabled: !!fleet,
  });
  const inventoryFieldsQ = useQuery<InventoryCategoryField[]>({
    queryKey: ["/api/inventory-category-fields", { fleetId: fleet?.id }], enabled: !!fleet,
  });
  const existingLinesQ = useQuery<ServiceLineItem[]>({
    queryKey: ["/api/service-line-items", { serviceEventId: editEventId }],
    enabled: !!editEventId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assetId, scheduleId: null, eventType: "unscheduled", title: "Oil Change",
      performedAt: formatDateInput(new Date()),
      meterAtService: null, vendor: "In-House", technician: "",
      serviceFacilityId: null, facilityAddress: null, facilityPhone: null,
      cost: null, notes: "", lineItems: [],
    },
  });

  useEffect(() => {
    if (assetQ.data) form.setValue("meterAtService", assetQ.data.currentMeter);
  }, [assetQ.data]);
  useEffect(() => {
    const event = eventQ.data;
    if (!event) return;
    form.reset({
      assetId: event.assetId,
      scheduleId: event.scheduleId ?? null,
      eventType: event.eventType as any,
      title: event.title,
      performedAt: formatDateInput(event.performedAt),
      meterAtService: event.meterAtService ?? null,
      vendor: event.vendor ?? "",
      technician: event.technician ?? "",
      serviceFacilityId: event.serviceFacilityId ?? null,
      facilityAddress: event.facilityAddress ?? null,
      facilityPhone: event.facilityPhone ?? null,
      cost: event.cost ?? null,
      notes: event.notes ?? "",
      lineItems: [],
    });
  }, [eventQ.data]);
  const linesInitializedRef = useRef(false);
  useEffect(() => {
    if (linesInitializedRef.current) return;
    if (!existingLinesQ.data?.length || !editEventId) return;
    if (inventoryQ.isLoading) return; // wait so we can resolve each line's category from its inventory item
    linesInitializedRef.current = true;
    const items = inventoryQ.data ?? [];
    setLines(existingLinesQ.data.map(line => {
      const inv = line.inventoryItemId ? items.find(i => i.id === line.inventoryItemId) : null;
      return {
        inventoryItemId: line.inventoryItemId ?? null,
        itemName: line.itemName,
        partNumber: line.partNumber ?? "",
        brand: line.brand ?? "",
        spec: line.spec ?? "",
        quantity: line.quantity,
        unit: line.unit ?? "",
        unitCost: line.unitCost ?? null,
        notes: line.notes ?? "",
        category: inv?.category ?? null,
        itemChosen: true,
        locked: true,
      } as any;
    }));
  }, [existingLinesQ.data, editEventId, inventoryQ.data, inventoryQ.isLoading]);

  const lineItems = form.watch("lineItems");
  const setLines = (next: typeof lineItems) => form.setValue("lineItems", next, { shouldDirty: true });

  const addLine = (preset?: Partial<z.infer<typeof lineSchema>>) =>
    setLines([...lineItems, {
      inventoryItemId: null, itemName: "", partNumber: "", brand: "", spec: "",
      quantity: 1, unit: "", unitCost: null, notes: "",
      category: null, itemChosen: false, locked: false,
      ...preset,
    } as any]);
  const removeLine = (idx: number) => setLines(lineItems.filter((_, i) => i !== idx));

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const eventPayload = {
        assetId: v.assetId,
        scheduleId: v.scheduleId,
        eventType: v.eventType,
        title: v.title,
        performedAt: new Date(v.performedAt).toISOString(),
        meterAtService: v.meterAtService,
        vendor: v.vendor || null,
        technician: v.technician || null,
        serviceFacilityId: v.serviceFacilityId,
        facilityAddress: v.facilityAddress || null,
        facilityPhone: v.facilityPhone || null,
        cost: v.cost,
        notes: v.notes || null,
      };
      if (editEventId) {
        const res = await apiRequest("PATCH", `/api/service-events/${editEventId}`, eventPayload);
        const event = await res.json();
        await apiRequest("PUT", `/api/service-events/${editEventId}/line-items`, v.lineItems.map(line => ({
          inventoryItemId: line.inventoryItemId,
          itemName: line.itemName,
          partNumber: line.partNumber || null,
          brand: line.brand || null,
          spec: line.spec || null,
          quantity: line.quantity,
          unit: line.unit || null,
          unitCost: line.unitCost,
          notes: line.notes || null,
        })));
        return event;
      }
      const eventRes = await apiRequest("POST", "/api/service-events", eventPayload);
      const event = await eventRes.json();
      for (const line of v.lineItems) {
        await apiRequest("POST", "/api/service-line-items", {
          serviceEventId: event.id,
          inventoryItemId: line.inventoryItemId,
          itemName: line.itemName,
          partNumber: line.partNumber || null,
          brand: line.brand || null,
          spec: line.spec || null,
          quantity: line.quantity,
          unit: line.unit || null,
          unitCost: line.unitCost,
          notes: line.notes || null,
        });
      }
      for (const attachment of attachments) {
        await apiRequest("POST", "/api/attachments", {
          entityType: "service-event",
          entityId: event.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          dataUrl: attachment.dataUrl,
          notes: null,
          createdAt: new Date().toISOString(),
        });
      }
      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-line-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meter-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-movements"] });
      toast({ title: "Service event recorded" });
      navigate(`/assets/${assetId}`);
    },
    onError: (e) => toast({ title: "Save failed", description: String(e), variant: "destructive" }),
  });

  const submit = (v: FormValues) => save.mutate(v);
  const goBack = () => navigate(`/assets/${assetId}`);

  const scheduleId = form.watch("scheduleId");
  const applicableSchedules = assetQ.data ? schedulesApplicableToAsset(schedulesQ.data ?? [], assetQ.data) : [];
  const searchFilteredSchedules = applicableSchedules.filter(s => {
    const term = scheduleSearch.trim().toLowerCase();
    if (!term) return true;
    return s.name.toLowerCase().includes(term) || (s.category ?? "").toLowerCase().includes(term);
  });
  const selectedSchedule = scheduleId ? applicableSchedules.find(s => s.id === scheduleId) ?? null : null;

  const handleScheduleSelect = (val: string) => {
    if (val === UNSCHEDULED_SERVICE) {
      form.setValue("scheduleId", null, { shouldDirty: true });
      if (form.getValues("eventType") === "scheduled") form.setValue("eventType", "unscheduled", { shouldDirty: true });
      setSchedulePickerOpen(false);
      setScheduleSearch("");
      return;
    }
    const schedule = applicableSchedules.find(s => s.id === Number(val));
    if (schedule) {
      form.setValue("scheduleId", schedule.id, { shouldDirty: true });
      form.setValue("eventType", "scheduled", { shouldDirty: true });
      form.setValue("title", schedule.name, { shouldDirty: true });
    }
    setSchedulePickerOpen(false);
    setScheduleSearch("");
  };

  const serviceFacilityId = form.watch("serviceFacilityId");
  const vendor = form.watch("vendor");
  const technician = form.watch("technician");
  const facilityAddress = form.watch("facilityAddress");
  const facilityPhone = form.watch("facilityPhone");
  const searchFilteredFacilities = (serviceFacilitiesQ.data ?? []).filter(f => {
    const term = facilitySearch.trim().toLowerCase();
    if (!term) return true;
    return f.name.toLowerCase().includes(term) || composeAddress(f).toLowerCase().includes(term);
  });

  const handleFacilitySelect = (val: string) => {
    if (val === IN_HOUSE) {
      form.setValue("serviceFacilityId", null, { shouldDirty: true });
      form.setValue("vendor", "In-House", { shouldDirty: true });
      form.setValue("technician", "", { shouldDirty: true });
      form.setValue("facilityAddress", null, { shouldDirty: true });
      form.setValue("facilityPhone", null, { shouldDirty: true });
      setFacilityPickerOpen(false);
      setFacilitySearch("");
      return;
    }
    const facility = (serviceFacilitiesQ.data ?? []).find(f => f.id === Number(val));
    if (facility) {
      form.setValue("serviceFacilityId", facility.id, { shouldDirty: true });
      form.setValue("vendor", facility.name, { shouldDirty: true });
      form.setValue("technician", facility.technician ?? "", { shouldDirty: true });
      form.setValue("facilityAddress", composeAddress(facility) || null, { shouldDirty: true });
      form.setValue("facilityPhone", facility.phone ?? null, { shouldDirty: true });
    }
    setFacilityPickerOpen(false);
    setFacilitySearch("");
  };

  const copyAddress = async (address: string) => {
    await navigator.clipboard?.writeText(address);
    toast({ title: "Address copied" });
  };
  const addAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    const allFiles = Array.from(files);
    const allowed = allFiles.filter(f => (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(f.type));
    if (allowed.length < allFiles.length) {
      toast({
        title: "Some files were skipped",
        description: "Only images (JPEG/PNG/GIF/WebP) and PDF files can be attached.",
        variant: "destructive",
      });
    }
    if (!allowed.length) return;
    const next = await Promise.all(allowed.map(file => new Promise<PendingAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl: String(reader.result),
      });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    setAttachments(current => [...current, ...next]);
  };

  const workOrderFunction = editEventId ? "EDIT WORK ORDER" : "NEW WORK ORDER";
  const workOrderIdentity = editEventId ? `Work Order #${editEventId}` : "New Work Order";
  const formMode = editEventId ? "edit" : "new";

  return (
    <AppShell title={assetQ.data?.friendlyName ?? "Asset"} subtitle={workOrderFunction}>
      <div className="space-y-5">
        <EditablePageActions
          hasChanges={form.formState.isDirty || attachments.length > 0}
          isSaving={save.isPending}
          canSave={canEdit}
          onBack={goBack}
          onCancel={goBack}
          onSave={form.handleSubmit(submit)}
          description={formMode === "edit" ? "You're editing this work order" : undefined}
        >
          <div className="rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground" data-testid="text-work-order-identity">
            {workOrderIdentity}
          </div>
          <div className={`rounded-md border px-3 py-2 text-xs font-semibold tracking-wide ${modeBadgeClass(formMode)}`} data-testid="text-work-order-mode">
            {modeLabel(formMode)}
          </div>
        </EditablePageActions>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)}>
            <Card className="p-5 space-y-5">

              {!canEdit && (
                <div className="rounded-md border border-[hsl(var(--status-warn)/0.35)] bg-[hsl(var(--status-warn)/0.08)] p-3 text-sm">
                  Viewer access is read-only. Switch to an editor or admin user to save service entries.
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-end">
                <div className="xl:col-span-4">
                  <Label>Service Schedule</Label>
                  <Popover open={schedulePickerOpen} onOpenChange={open => { setSchedulePickerOpen(open); if (!open) setScheduleSearch(""); }}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" aria-expanded={schedulePickerOpen} className="w-full justify-between font-normal" data-testid="select-schedule">
                        <span className="truncate">{selectedSchedule ? selectedSchedule.name : "Unscheduled Service"}</span>
                        <ChevronsUpDown className="size-4 opacity-50 shrink-0 ml-2" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[380px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="Search schedules…" value={scheduleSearch} onValueChange={setScheduleSearch} data-testid="input-schedule-search" />
                        <CommandList>
                          <CommandGroup>
                            <CommandItem value={UNSCHEDULED_SERVICE} onSelect={() => handleScheduleSelect(UNSCHEDULED_SERVICE)} data-testid="option-schedule-unscheduled">
                              Unscheduled Service
                            </CommandItem>
                          </CommandGroup>
                          <CommandGroup heading="Assigned Schedules">
                            {searchFilteredSchedules.length === 0 && (
                              <div className="py-4 text-center text-sm text-muted-foreground">
                                {scheduleSearch.trim() ? `No schedules match "${scheduleSearch.trim()}".` : "No schedules configured for this asset."}
                              </div>
                            )}
                            {searchFilteredSchedules.map(s => (
                              <CommandItem key={s.id} value={String(s.id)} onSelect={() => handleScheduleSelect(String(s.id))} data-testid={`option-schedule-${s.id}`}>
                                {s.name} — {scheduleIntervalSummary(s, assetQ.data?.meterLabel)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <FormField name="title" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-4"><FormLabel>Service Title</FormLabel><FormControl><Input data-testid="input-title" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                {!scheduleId && (
                  <div className="xl:col-span-4">
                    <Label>Type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant={form.watch("eventType") === "repair" ? "default" : "outline"} onClick={() => form.setValue("eventType", "repair", { shouldDirty: true })} data-testid="button-event-type-repair">Repair</Button>
                      <Button type="button" variant={form.watch("eventType") === "unscheduled" ? "default" : "outline"} onClick={() => form.setValue("eventType", "unscheduled", { shouldDirty: true })} data-testid="button-event-type-unscheduled">Unscheduled</Button>
                    </div>
                  </div>
                )}
                <FormField name="performedAt" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-2"><FormLabel>Performed At</FormLabel><FormControl><Input type="date" data-testid="input-performed-at" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="meterAtService" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-2"><FormLabel>Meter</FormLabel>
                    <FormControl><Input type="number" step="any" data-testid="input-meter-at-service" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />

                <div className="xl:col-span-4">
                  <Label>Work Performed By</Label>
                  <Popover open={facilityPickerOpen} onOpenChange={open => { setFacilityPickerOpen(open); if (!open) setFacilitySearch(""); }}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" aria-expanded={facilityPickerOpen} className="w-full justify-between font-normal" data-testid="select-work-facility">
                        <span className="truncate">{serviceFacilityId ? (vendor || "Service Facility") : "In-House"}</span>
                        <ChevronsUpDown className="size-4 opacity-50 shrink-0 ml-2" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[380px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="Search facilities…" value={facilitySearch} onValueChange={setFacilitySearch} data-testid="input-work-facility-search" />
                        <CommandList>
                          <CommandGroup>
                            <CommandItem value={IN_HOUSE} onSelect={() => handleFacilitySelect(IN_HOUSE)} data-testid="option-work-facility-in-house">
                              In-House
                            </CommandItem>
                          </CommandGroup>
                          <CommandGroup heading="Service Facilities">
                            {searchFilteredFacilities.length === 0 && (
                              <div className="py-4 text-center text-sm text-muted-foreground">
                                {facilitySearch.trim() ? `No facilities match "${facilitySearch.trim()}".` : "No service facilities configured yet."}
                              </div>
                            )}
                            {searchFilteredFacilities.map(facility => (
                              <CommandItem key={facility.id} value={String(facility.id)} onSelect={() => handleFacilitySelect(String(facility.id))} data-testid={`option-work-facility-${facility.id}`}>
                                {facility.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <FormField name="cost" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-2"><FormLabel>{costLabel}</FormLabel>
                    <FormControl><Input type="number" step="any" data-testid="input-cost" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
                {serviceFacilityId ? (
                  <div className="xl:col-span-6 rounded-md border border-border p-3 space-y-1" data-testid="block-facility-address">
                    <div className="text-sm font-semibold">{vendor}</div>
                    {facilityAddress && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span>{facilityAddress}</span>
                        <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => copyAddress(facilityAddress)} data-testid="button-copy-facility-address" aria-label="Copy address">
                          <Copy className="size-3.5" />
                        </Button>
                        <a href={mapsUrlFor(facilityAddress)} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline shrink-0" data-testid="link-facility-map">
                          View on map
                        </a>
                      </div>
                    )}
                    {facilityPhone && (
                      <a href={`tel:${facilityPhone}`} className="block text-sm text-primary hover:underline" data-testid="link-facility-phone">{facilityPhone}</a>
                    )}
                    {technician && <div className="text-sm text-muted-foreground">Tech: {technician}</div>}
                  </div>
                ) : (
                  <>
                    <FormField name="vendor" control={form.control} render={({ field }) => (
                      <FormItem className="xl:col-span-3"><FormLabel>Vendor / Shop</FormLabel><FormControl><Input data-testid="input-vendor" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="technician" control={form.control} render={({ field }) => (
                      <FormItem className="xl:col-span-3"><FormLabel>Technician / Contact</FormLabel><FormControl><Input data-testid="input-technician" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </>
                )}
                <FormField name="notes" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-12"><FormLabel>Notes</FormLabel><FormControl><Textarea rows={2} data-testid="textarea-service-notes" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </Card>

            <Card className="p-5 mt-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-semibold">Line Items</h3>
                  <p className="text-sm text-muted-foreground mt-1">Choose an inventory category first, then select a stocked item in that category or capture a one-off line.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addLine()} data-testid="button-add-line">
                  <Plus className="size-4 mr-1.5" /> Add Line
                </Button>
              </div>
              {lineItems.length === 0 && <p className="text-sm text-muted-foreground">No line items added.</p>}
              <div className="space-y-3">
                {lineItems.map((line, idx) => (
                  <LineItemRow
                    key={idx}
                    line={line}
                    inventory={inventoryQ.data ?? []}
                    categories={inventoryCategoriesQ.data ?? []}
                    categoryFields={inventoryFieldsQ.data ?? []}
                    onChange={updated => {
                      const next = [...lineItems];
                      next[idx] = updated;
                      setLines(next);
                    }}
                    onRemove={() => removeLine(idx)}
                    idx={idx}
                    currency={fleetCurrency}
                  />
                ))}
              </div>
            </Card>

            <Card className="p-5 mt-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-semibold">Attachments</h3>
                  <p className="text-sm text-muted-foreground mt-1">Attach images, PDFs, receipts, or documents to this work order.</p>
                </div>
                <Button type="button" variant="outline" size="sm" asChild data-testid="button-add-service-attachment">
                  <label>
                    <Paperclip className="size-4 mr-1.5" /> Add Files
                    <input
                      className="sr-only"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                      onChange={e => void addAttachments(e.target.files)}
                      data-testid="input-service-attachments"
                    />
                  </label>
                </Button>
              </div>
              {attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attachments staged yet. Files added here are saved with the work order.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {attachments.map((attachment, idx) => (
                    <AttachmentPreview
                      key={`${attachment.fileName}-${idx}`}
                      attachment={attachment}
                      onView={() => setViewingImage(attachment)}
                      onRemove={() => setAttachments(current => current.filter((_, i) => i !== idx))}
                      idx={idx}
                    />
                  ))}
                </div>
              )}
            </Card>
          </form>
        </Form>
      </div>
      <AttachmentImageDialog attachment={viewingImage} onOpenChange={open => !open && setViewingImage(null)} />
    </AppShell>
  );
}

function AttachmentPreview({ attachment, onView, onRemove, idx }: {
  attachment: PendingAttachment; onView: () => void; onRemove: () => void; idx: number;
}) {
  const isImage = isImageAttachment(attachment);
  const isPdf = attachment.mimeType === "application/pdf";
  return (
    <div className="rounded-md border border-border p-3 flex items-center gap-3" data-testid={`card-service-attachment-${idx}`}>
      <div className="size-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {isImage ? (
          <img src={attachment.dataUrl} alt={attachment.fileName} className="h-full w-full object-cover" />
        ) : isPdf ? (
          <FileText className="size-5 text-muted-foreground" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{attachment.fileName}</div>
        <div className="text-xs text-muted-foreground">{attachment.mimeType || "file"} · {(attachment.size / 1024).toFixed(1)} KB</div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => isImage ? onView() : downloadAttachment(attachment)} data-testid={`button-view-attachment-${idx}`}>
        <Eye className="size-4" />
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove} data-testid={`button-remove-attachment-${idx}`}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function LineItemRow({ line, inventory, categories: inventoryCategories, categoryFields, onChange, onRemove, idx, currency }: {
  line: any; inventory: InventoryItem[]; categories: InventoryCategory[]; categoryFields: InventoryCategoryField[]; onChange: (l: any) => void; onRemove: () => void; idx: number; currency: string;
}) {
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const locked = !!line.locked;
  const itemChosen = !!line.itemChosen;
  const isOneOff = itemChosen && line.inventoryItemId == null;
  const isInventoryItem = itemChosen && line.inventoryItemId != null;
  const inv = line.inventoryItemId ? inventory.find(i => i.id === line.inventoryItemId) : null;
  const categories = Array.from(new Set(inventory.map(i => i.category || "other"))).sort();
  const selectedCategory: string | null = line.category ?? null;
  const isNonInventoryCategory = selectedCategory === NON_INVENTORY_CATEGORY;
  const categoryMeta = selectedCategory && !isNonInventoryCategory
    ? inventoryCategories.find(c => c.name.trim().toLowerCase() === selectedCategory.trim().toLowerCase())
    : undefined;
  const categorySearchFilteredList = categories.filter(category =>
    !categorySearch.trim() || category.toLowerCase().includes(categorySearch.trim().toLowerCase())
  );
  const filteredInventory = (selectedCategory && !isNonInventoryCategory) ? inventory.filter(i => (i.category || "other") === selectedCategory) : [];
  const selectedCategoryFields = (selectedCategory && !isNonInventoryCategory) ? fieldsForCategory(categoryFields, inventoryCategories, selectedCategory) : [];
  const collidingIds = computeKeySpecCollisions(filteredInventory, categoryFields, inventoryCategories);
  const titleFields = titleFieldsForCategory(selectedCategoryFields);
  const pickerColumns = [
    ...titleFields.map(field => ({ key: `field-${field.id}`, label: field.name, get: (item: InventoryItem) => getFieldValue(item, field) ?? "—" })),
    { key: "unit", label: "Unit", get: (item: InventoryItem) => item.unit },
  ];
  const searchFilteredInventory = filteredInventory.filter(item => {
    const term = itemSearch.trim().toLowerCase();
    if (!term) return true;
    const haystack = [
      inventoryItemTitle(item, selectedCategoryFields),
      item.partNumber,
      item.sku,
      item.unit,
      ...titleFields.map(field => getFieldValue(item, field)),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(term);
  });
  const selectedCategoryLabel = !selectedCategory
    ? "Choose a category"
    : (isNonInventoryCategory ? "Non-Inventory" : selectedCategory);
  const selectedItemLabel = !itemChosen ? "Choose an item" : (inv ? inventoryItemTitle(inv, selectedCategoryFields) : "");
  const lineTotal = isInventoryItem && inv?.costTracking && inv.unitCost != null ? (line.quantity ?? 0) * inv.unitCost : null;
  const oneOffTotal = isOneOff && line.unitCost != null ? (line.quantity ?? 0) * line.unitCost : null;
  const isValid = itemChosen && (line.quantity ?? 0) > 0 && (isOneOff ? String(line.itemName ?? "").trim().length > 0 : true);
  const summaryTitle = isInventoryItem && inv ? inventoryItemTitle(inv, selectedCategoryFields) : (line.itemName || "One-off item");

  const handleCategoryChange = (category: string) => {
    if (category === NON_INVENTORY_CATEGORY) {
      onChange({
        ...line, category, itemChosen: true, inventoryItemId: null,
        itemName: "", partNumber: "", brand: "", spec: "", unit: "", unitCost: null,
      });
      setCategoryPickerOpen(false);
      setCategorySearch("");
      return;
    }
    onChange({
      ...line, category, itemChosen: false, inventoryItemId: null,
      itemName: "", partNumber: "", brand: "", spec: "", unit: "", unitCost: null,
    });
    setCategoryPickerOpen(false);
    setCategorySearch("");
  };
  const handleSelect = (val: string) => {
    const found = inventory.find(i => i.id === Number(val));
    if (found) {
      onChange({
        ...line,
        itemChosen: true,
        category: found.category || "other",
        inventoryItemId: found.id,
        itemName: found.name,
        partNumber: found.partNumber ?? line.partNumber,
        unit: found.unit ?? line.unit,
        unitCost: found.costTracking ? (found.unitCost ?? line.unitCost) : line.unitCost,
      });
    }
    setItemPickerOpen(false);
    setItemSearch("");
  };

  const categoryBadge = selectedCategory && (
    categoryMeta ? (
      <Badge variant="outline" className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide shrink-0" style={tintedBadgeStyle(categoryMeta.color)}>
        <InventoryCategoryIcon icon={categoryMeta.icon} className="size-3" />
        {categoryMeta.name}
      </Badge>
    ) : (
      <Badge variant="outline" className="text-[10px] tracking-wide shrink-0">{selectedCategoryLabel}</Badge>
    )
  );

  if (locked) {
    return (
      <div className="p-3 rounded-md border border-border flex items-center justify-between gap-3 flex-wrap" data-testid={`line-item-${idx}`}>
        <div className="min-w-0 flex items-center gap-3 flex-wrap">
          {categoryBadge}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" data-testid={`text-line-summary-${idx}`}>{summaryTitle}</div>
            <div className="text-xs text-muted-foreground truncate">
              {isOneOff && line.partNumber ? `P/N ${line.partNumber} · ` : ""}
              Qty {line.quantity ?? 1} {isInventoryItem ? (inv?.unit ?? "") : (line.unit ?? "")}
              {lineTotal != null && ` · ${formatCurrency(lineTotal, currency)}`}
              {oneOffTotal != null && ` · ${formatCurrency(oneOffTotal, currency)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...line, locked: false })} data-testid={`button-edit-line-${idx}`}>
            <Pencil className="size-4 mr-1.5" /> Edit
          </Button>
          <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={onRemove} data-testid={`button-remove-line-${idx}`} aria-label="Delete line">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-md border border-border" data-testid={`line-item-${idx}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-w-0">
          <div className="lg:col-span-4">
            <label className="text-xs text-muted-foreground">Category</label>
            <Popover open={categoryPickerOpen} onOpenChange={open => { setCategoryPickerOpen(open); if (!open) setCategorySearch(""); }}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={categoryPickerOpen}
                  className="w-full justify-between font-normal"
                  data-testid={`select-line-category-${idx}`}
                >
                  <span className="truncate">{selectedCategoryLabel}</span>
                  <ChevronsUpDown className="size-4 opacity-50 shrink-0 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search categories…"
                    value={categorySearch}
                    onValueChange={setCategorySearch}
                    data-testid={`input-line-category-search-${idx}`}
                  />
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        value={NON_INVENTORY_CATEGORY}
                        onSelect={() => handleCategoryChange(NON_INVENTORY_CATEGORY)}
                        data-testid={`option-line-category-${idx}-non-inventory`}
                      >
                        Non-Inventory
                      </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading="Fleet Categories">
                      {categorySearchFilteredList.length === 0 && (
                        <div className="py-4 text-center text-sm text-muted-foreground">
                          No categories match "{categorySearch.trim()}".
                        </div>
                      )}
                      {categorySearchFilteredList.map(category => {
                        const meta = inventoryCategories.find(c => c.name.trim().toLowerCase() === category.trim().toLowerCase());
                        return (
                          <CommandItem
                            key={category}
                            value={category}
                            onSelect={() => handleCategoryChange(category)}
                            className="flex items-center gap-2"
                            data-testid={`option-line-category-${idx}-${category}`}
                          >
                            {meta && <InventoryCategoryIcon icon={meta.icon} className="size-3.5 shrink-0" />}
                            <span className="truncate">{category}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {selectedCategory && !isNonInventoryCategory && (
            <div className="lg:col-span-4">
              <label className="text-xs text-muted-foreground">Item</label>
              <Popover open={itemPickerOpen} onOpenChange={open => { setItemPickerOpen(open); if (!open) setItemSearch(""); }}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={itemPickerOpen}
                    className="w-full justify-between font-normal"
                    data-testid={`select-line-source-${idx}`}
                  >
                    <span className="truncate">{selectedItemLabel}</span>
                    <ChevronsUpDown className="size-4 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-2rem)] max-w-[420px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search items…"
                      value={itemSearch}
                      onValueChange={setItemSearch}
                      data-testid={`input-line-search-${idx}`}
                    />
                    <CommandList>
                      <div
                        className="hidden sm:grid gap-2 px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground"
                        style={{ gridTemplateColumns: `repeat(${pickerColumns.length}, minmax(0,1fr))` }}
                      >
                        {pickerColumns.map(col => <div key={col.key} className="truncate">{col.label}</div>)}
                      </div>
                      <CommandGroup>
                        {searchFilteredInventory.length === 0 && (
                          <div className="py-4 text-center text-sm text-muted-foreground">
                            {itemSearch.trim() ? `No items match "${itemSearch.trim()}".` : "No items in this category."}
                          </div>
                        )}
                        {searchFilteredInventory.map(item => (
                          <CommandItem
                            key={item.id}
                            value={String(item.id)}
                            onSelect={() => handleSelect(String(item.id))}
                            className="flex items-center gap-2"
                            data-testid={`option-line-source-${idx}-${item.id}`}
                          >
                            <div className="hidden flex-1 min-w-0 sm:grid gap-2" style={{ gridTemplateColumns: `repeat(${pickerColumns.length}, minmax(0,1fr))` }}>
                              {pickerColumns.map(col => (
                                <span key={col.key} className="truncate">{col.get(item)}</span>
                              ))}
                            </div>
                            <div className="min-w-0 flex-1 sm:hidden">
                              <div className="truncate text-sm font-medium">{inventoryItemTitle(item, selectedCategoryFields)}</div>
                              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                {pickerColumns.map(col => (
                                  <span key={col.key} className="max-w-full truncate">
                                    <span className="text-muted-foreground/70">{col.label}:</span> {col.get(item)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {collidingIds.has(item.id) && item.partNumber && (
                              <span className="text-[10px] text-muted-foreground shrink-0">P/N {item.partNumber}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
          {isOneOff && (
            <>
              <div className="lg:col-span-4">
                <label className="text-xs text-muted-foreground">Item Name</label>
                <Input value={line.itemName ?? ""} onChange={e => onChange({ ...line, itemName: e.target.value })} data-testid={`input-line-name-${idx}`} />
              </div>
              <div className="lg:col-span-3">
                <label className="text-xs text-muted-foreground">Part #</label>
                <Input value={line.partNumber ?? ""} onChange={e => onChange({ ...line, partNumber: e.target.value })} data-testid={`input-line-part-${idx}`} />
              </div>
              <div className="lg:col-span-3">
                <label className="text-xs text-muted-foreground">Brand / Spec</label>
                <Input value={line.brand ?? ""} onChange={e => onChange({ ...line, brand: e.target.value })} data-testid={`input-line-brand-${idx}`} />
              </div>
              <div className="lg:col-span-2">
                <label className="text-xs text-muted-foreground">Quantity</label>
                <Input type="number" step="any" value={line.quantity ?? 1} onChange={e => onChange({ ...line, quantity: Number(e.target.value) })} data-testid={`input-line-qty-${idx}`} />
              </div>
              <div className="lg:col-span-2">
                <label className="text-xs text-muted-foreground">Unit</label>
                <Input value={line.unit ?? ""} onChange={e => onChange({ ...line, unit: e.target.value })} data-testid={`input-line-unit-${idx}`} placeholder="qt, each…" />
              </div>
              <div className="lg:col-span-2">
                <label className="text-xs text-muted-foreground">Unit Cost ({currency} {currencySymbol(currency)})</label>
                <Input type="number" step="any" value={line.unitCost ?? ""} onChange={e => onChange({ ...line, unitCost: e.target.value === "" ? null : Number(e.target.value) })} data-testid={`input-line-cost-${idx}`} />
              </div>
              <div className="lg:col-span-8">
                <label className="text-xs text-muted-foreground">Notes</label>
                <Input value={line.notes ?? ""} onChange={e => onChange({ ...line, notes: e.target.value })} data-testid={`input-line-notes-${idx}`} />
              </div>
            </>
          )}
          {isInventoryItem && (
            <div className="lg:col-span-4">
              <label className="text-xs text-muted-foreground">Quantity</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  className="w-28"
                  value={line.quantity ?? 1}
                  onChange={e => onChange({ ...line, quantity: Number(e.target.value) })}
                  data-testid={`input-line-qty-${idx}`}
                />
                <span className="text-sm text-muted-foreground" data-testid={`text-line-unit-${idx}`}>{inv?.unit}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button type="button" variant="outline" size="sm" disabled={!isValid} onClick={() => onChange({ ...line, locked: true })} data-testid={`button-save-line-${idx}`}>
            <SaveIcon className="size-4 mr-1.5" /> Save
          </Button>
          <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={onRemove} data-testid={`button-remove-line-${idx}`} aria-label="Delete line">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {isInventoryItem && inv && (
        <div className="text-xs text-muted-foreground mt-3">
          Stock: {inv.onHand} {inv.unit}{inv.reorderReminder && inv.reorderPoint != null ? ` · reorder below ${inv.reorderPoint}` : ""}
          {inv.costTracking && inv.unitCost != null && ` · ${formatCurrency(inv.unitCost, currency)}/${inv.unit}${lineTotal != null ? ` · Line total ${formatCurrency(lineTotal, currency)}` : ""}`}
        </div>
      )}
    </div>
  );
}
