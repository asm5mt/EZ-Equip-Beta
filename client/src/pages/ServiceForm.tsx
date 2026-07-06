import { useEffect, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { EditablePageActions } from "@/components/EditablePageActions";
import { Plus, Trash2, Paperclip, FileText, Image as ImageIcon, Eye, Building2, ChevronsUpDown } from "lucide-react";
import { z } from "zod";
import type { Asset, InventoryCategory, InventoryCategoryField, MaintenanceSchedule, InventoryItem, ServiceEvent, ServiceLineItem } from "@shared/schema";
import { scheduleIntervalSummary } from "@/lib/format";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { formatDateInput } from "@/lib/format";
import { currencySymbol } from "@/lib/currencies";
import { modeBadgeClass, modeLabel } from "@/lib/mode-styles";
import { computeKeySpecCollisions, fieldsForCategory, getFieldValue, inventoryItemTitle, titleFieldsForCategory } from "@/lib/inventory-display";

const NON_INVENTORY = "__one_off__";

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
  const [workSource, setWorkSource] = useState<"in-house" | "outside">("in-house");
  const [providerOpen, setProviderOpen] = useState(false);
  const [provider, setProvider] = useState({ name: "", contact: "", phone: "", address: "" });

  const assetQ = useQuery<Asset>({ queryKey: ["/api/assets", assetId], enabled: !!assetId });
  const schedulesQ = useQuery<MaintenanceSchedule[]>({
    queryKey: ["/api/schedules", { assetId }], enabled: !!assetId,
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
      assetId, scheduleId: null, eventType: "scheduled", title: "Oil Change",
      performedAt: formatDateInput(new Date()),
      meterAtService: null, vendor: "", technician: "", cost: null, notes: "", lineItems: [],
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
      cost: event.cost ?? null,
      notes: event.notes ?? "",
      lineItems: [],
    });
    if (event.vendor && event.vendor !== "In-House") setWorkSource("outside");
  }, [eventQ.data]);
  useEffect(() => {
    if (!existingLinesQ.data?.length || !editEventId) return;
    setLines(existingLinesQ.data.map(line => ({
      inventoryItemId: line.inventoryItemId ?? null,
      itemName: line.itemName,
      partNumber: line.partNumber ?? "",
      brand: line.brand ?? "",
      spec: line.spec ?? "",
      quantity: line.quantity,
      unit: line.unit ?? "",
      unitCost: line.unitCost ?? null,
      notes: line.notes ?? "",
    } as any)));
  }, [existingLinesQ.data, editEventId]);

  const lineItems = form.watch("lineItems");
  const setLines = (next: typeof lineItems) => form.setValue("lineItems", next, { shouldDirty: true });

  const addLine = (preset?: Partial<z.infer<typeof lineSchema>>) =>
    setLines([...lineItems, {
      inventoryItemId: null, itemName: "", partNumber: "", brand: "", spec: "",
      quantity: 1, unit: "", unitCost: null, notes: "", ...preset,
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
  const applyProvider = () => {
    form.setValue("vendor", provider.name, { shouldDirty: true });
    form.setValue("technician", provider.contact, { shouldDirty: true });
    const existing = form.getValues("notes") || "";
    const providerNotes = [
      provider.phone ? `Provider phone: ${provider.phone}` : "",
      provider.address ? `Provider address: ${provider.address}` : "",
    ].filter(Boolean).join("\n");
    if (providerNotes) form.setValue("notes", existing ? `${existing}\n${providerNotes}` : providerNotes, { shouldDirty: true });
    setProviderOpen(false);
  };
  const addAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = await Promise.all(Array.from(files).map(file => new Promise<PendingAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
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
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)}>
            <Card className="p-5 space-y-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground" data-testid="text-work-order-identity">
                    {workOrderIdentity}
                  </div>
                  <div className={`rounded-md border px-3 py-2 text-xs font-semibold tracking-wide ${modeBadgeClass(formMode)}`} data-testid="text-work-order-mode">
                    {modeLabel(formMode)}
                  </div>
                </div>
              </div>

              {!canEdit && (
                <div className="rounded-md border border-[hsl(var(--status-warn)/0.35)] bg-[hsl(var(--status-warn)/0.08)] p-3 text-sm">
                  Viewer access is read-only. Switch to an editor or admin user to save service entries.
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-end">
                <FormField name="title" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-3"><FormLabel>Service Title</FormLabel><FormControl><Input data-testid="input-title" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="eventType" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-2"><FormLabel>Event Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-event-type"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="repair">Repair</SelectItem>
                        <SelectItem value="unscheduled">Unscheduled</SelectItem>
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField name="scheduleId" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-3"><FormLabel>Linked Schedule</FormLabel>
                    <Select onValueChange={v => field.onChange(v === "none" ? null : Number(v))} value={field.value ? String(field.value) : "none"}>
                      <FormControl><SelectTrigger data-testid="select-schedule"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(schedulesQ.data ?? []).map(s => (
                          <SelectItem key={s.id} value={String(s.id)} data-testid={`option-schedule-${s.id}`}>
                            {s.name} — {scheduleIntervalSummary(s, assetQ.data?.meterLabel)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField name="performedAt" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-2"><FormLabel>Performed At</FormLabel><FormControl><Input type="date" data-testid="input-performed-at" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="meterAtService" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-2"><FormLabel>Meter</FormLabel>
                    <FormControl><Input type="number" step="any" data-testid="input-meter-at-service" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />

                <div className="xl:col-span-3">
                  <Label>Work Performed By</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant={workSource === "in-house" ? "default" : "outline"} onClick={() => { setWorkSource("in-house"); form.setValue("vendor", "In-House", { shouldDirty: true }); }} data-testid="button-work-in-house">In-House</Button>
                    <Dialog open={providerOpen} onOpenChange={setProviderOpen}>
                      <DialogTrigger asChild>
                        <Button type="button" variant={workSource === "outside" ? "default" : "outline"} onClick={() => setWorkSource("outside")} data-testid="button-work-outside">Outside</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Outside Service Provider</DialogTitle></DialogHeader>
                        <div className="grid gap-3">
                          <div><Label>Business / Person</Label><Input value={provider.name} onChange={e => setProvider(p => ({ ...p, name: e.target.value }))} data-testid="input-provider-name" /></div>
                          <div><Label>Contact</Label><Input value={provider.contact} onChange={e => setProvider(p => ({ ...p, contact: e.target.value }))} data-testid="input-provider-contact" /></div>
                          <div><Label>Phone</Label><Input value={provider.phone} onChange={e => setProvider(p => ({ ...p, phone: e.target.value }))} data-testid="input-provider-phone" /></div>
                          <div><Label>Address</Label><Textarea value={provider.address} onChange={e => setProvider(p => ({ ...p, address: e.target.value }))} data-testid="textarea-provider-address" /></div>
                          <Button type="button" onClick={applyProvider} data-testid="button-apply-provider"><Building2 className="size-4 mr-1.5" /> Use Provider</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <FormField name="cost" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-2"><FormLabel>{costLabel}</FormLabel>
                    <FormControl><Input type="number" step="any" data-testid="input-cost" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="vendor" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-3"><FormLabel>Vendor / Shop</FormLabel><FormControl><Input data-testid="input-vendor" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="technician" control={form.control} render={({ field }) => (
                  <FormItem className="xl:col-span-4"><FormLabel>Technician / Contact</FormLabel><FormControl><Input data-testid="input-technician" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
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
                      accept="image/*,.pdf,.doc,.docx,.txt,.csv"
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
    </AppShell>
  );
}

function AttachmentPreview({ attachment, onRemove, idx }: {
  attachment: PendingAttachment; onRemove: () => void; idx: number;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
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
      <Button type="button" variant="ghost" size="sm" onClick={() => window.open(attachment.dataUrl, "_blank")} data-testid={`button-view-attachment-${idx}`}>
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inv = line.inventoryItemId ? inventory.find(i => i.id === line.inventoryItemId) : null;
  const categories = Array.from(new Set(inventory.map(i => i.category || "other"))).sort();
  const selectedCategory = line.category ?? inv?.category ?? categories[0] ?? "other";
  const filteredInventory = inventory.filter(i => (i.category || "other") === selectedCategory);
  const selectedCategoryFields = fieldsForCategory(categoryFields, inventoryCategories, selectedCategory);
  const collidingIds = computeKeySpecCollisions(filteredInventory, categoryFields, inventoryCategories);
  const titleFields = titleFieldsForCategory(selectedCategoryFields);
  const searchFilteredInventory = filteredInventory.filter(item => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const haystack = [
      inventoryItemTitle(item, selectedCategoryFields),
      item.partNumber,
      item.sku,
      ...titleFields.map(field => getFieldValue(item, field)),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(term);
  });
  const selectedItemLabel = line.inventoryItemId && inv ? inventoryItemTitle(inv, selectedCategoryFields) : "One-off (non-inventory)";
  const handleSelect = (val: string) => {
    if (val === NON_INVENTORY) {
      onChange({ ...line, inventoryItemId: null });
      return;
    }
    const found = inventory.find(i => i.id === Number(val));
    if (found) {
      onChange({
        ...line,
        category: found.category || "other",
        inventoryItemId: found.id,
        itemName: found.name,
        partNumber: found.partNumber ?? line.partNumber,
        unit: found.unit ?? line.unit,
        unitCost: found.costTracking ? (found.unitCost ?? line.unitCost) : line.unitCost,
      });
    }
  };
  return (
    <div className="p-3 rounded-md border border-border" data-testid={`line-item-${idx}`}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-3">
          <label className="text-xs text-muted-foreground">Category</label>
          <Select value={selectedCategory} onValueChange={category => onChange({ ...line, category, inventoryItemId: null, itemName: "", partNumber: "", unitCost: null })}>
            <SelectTrigger data-testid={`select-line-category-${idx}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="lg:col-span-3">
          <label className="text-xs text-muted-foreground">Item</label>
          <Popover open={pickerOpen} onOpenChange={open => { setPickerOpen(open); if (!open) setSearch(""); }}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={pickerOpen}
                className="w-full justify-between font-normal"
                data-testid={`select-line-source-${idx}`}
              >
                <span className="truncate">{selectedItemLabel}</span>
                <ChevronsUpDown className="size-4 opacity-50 shrink-0 ml-2" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search items…"
                  value={search}
                  onValueChange={setSearch}
                  data-testid={`input-line-search-${idx}`}
                />
                <CommandList>
                  <CommandGroup>
                    <CommandItem
                      value={NON_INVENTORY}
                      onSelect={() => { handleSelect(NON_INVENTORY); setPickerOpen(false); }}
                      data-testid={`option-line-source-${idx}-one-off`}
                    >
                      One-off (non-inventory)
                    </CommandItem>
                  </CommandGroup>
                  {titleFields.length > 0 && (
                    <div
                      className="grid gap-2 px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground"
                      style={{ gridTemplateColumns: `repeat(${titleFields.length}, minmax(0,1fr))` }}
                    >
                      {titleFields.map(field => <div key={field.id} className="truncate">{field.name}</div>)}
                    </div>
                  )}
                  <CommandGroup>
                    {searchFilteredInventory.length === 0 && (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        {search.trim() ? `No items match "${search.trim()}".` : "No items in this category."}
                      </div>
                    )}
                    {searchFilteredInventory.map(item => (
                      <CommandItem
                        key={item.id}
                        value={String(item.id)}
                        onSelect={() => { handleSelect(String(item.id)); setPickerOpen(false); }}
                        className="flex items-center gap-2"
                        data-testid={`option-line-source-${idx}-${item.id}`}
                      >
                        {titleFields.length > 0 ? (
                          <div className="grid gap-2 flex-1 min-w-0" style={{ gridTemplateColumns: `repeat(${titleFields.length}, minmax(0,1fr))` }}>
                            {titleFields.map(field => (
                              <span key={field.id} className="truncate">{getFieldValue(item, field) ?? "—"}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="truncate flex-1">{inventoryItemTitle(item, selectedCategoryFields)}</span>
                        )}
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
        <div className="lg:col-span-4">
          <label className="text-xs text-muted-foreground">Item Name</label>
          <Input value={line.itemName ?? ""} onChange={e => onChange({ ...line, itemName: e.target.value })} data-testid={`input-line-name-${idx}`} />
        </div>
        <div className="lg:col-span-2">
          <label className="text-xs text-muted-foreground">Part #</label>
          <Input value={line.partNumber ?? ""} onChange={e => onChange({ ...line, partNumber: e.target.value })} data-testid={`input-line-part-${idx}`} />
        </div>
        <div className="lg:col-span-2">
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
        <div className="lg:col-span-4">
          <label className="text-xs text-muted-foreground">Notes</label>
          <Input value={line.notes ?? ""} onChange={e => onChange({ ...line, notes: e.target.value })} data-testid={`input-line-notes-${idx}`} />
        </div>
        <div className="lg:col-span-2 flex items-end">
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} data-testid={`button-remove-line-${idx}`}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {inv && (
        <div className="mt-2 text-xs text-muted-foreground">
          Stock: {inv.onHand} {inv.unit}{inv.reorderReminder && inv.reorderPoint != null ? ` · reorder below ${inv.reorderPoint}` : ""}
        </div>
      )}
    </div>
  );
}
