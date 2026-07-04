import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EditablePageActions } from "@/components/EditablePageActions";
import { z } from "zod";
import type { Asset, MeterReading } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateInput } from "@/lib/format";
import { useAppContext } from "@/lib/app-context";

const formSchema = z.object({
  assetId: z.number(),
  readingType: z.enum(["mileage", "hours", "count", "custom"]),
  value: z.number().nonnegative(),
  readingDate: z.string().min(1),
  notes: z.string().optional().nullable(),
});
type FormValues = z.infer<typeof formSchema>;

export default function MeterForm() {
  const [, newParams] = useRoute("/assets/:assetId/meter/new");
  const [, editParams] = useRoute("/assets/:assetId/meter/:id/edit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canEdit } = useAppContext();
  const params = editParams ?? newParams;
  const assetId = params ? Number((params as { assetId: string }).assetId) : 0;
  const editReadingId = editParams ? Number(editParams.id) : 0;
  const isEdit = editReadingId > 0;

  const assetQ = useQuery<Asset>({ queryKey: ["/api/assets", assetId], enabled: !!assetId });
  const readingQ = useQuery<MeterReading>({
    queryKey: ["/api/meter-readings", editReadingId],
    enabled: isEdit,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assetId, readingType: "mileage", value: 0,
      readingDate: formatDateInput(new Date()), notes: "",
    },
  });

  useEffect(() => {
    if (isEdit) return;
    if (assetQ.data) {
      form.setValue("readingType", (assetQ.data.meterType as any) ?? "mileage");
      form.setValue("value", assetQ.data.currentMeter);
    }
  }, [assetQ.data, isEdit]);

  useEffect(() => {
    if (!isEdit) return;
    if (readingQ.data) {
      const r = readingQ.data;
      form.reset({
        assetId,
        readingType: r.readingType as FormValues["readingType"],
        value: r.value,
        readingDate: formatDateInput(new Date(r.readingDate)),
        notes: r.notes ?? "",
      });
    }
  }, [readingQ.data, isEdit, assetId]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = {
        ...v,
        readingDate: new Date(v.readingDate).toISOString(),
        notes: v.notes || null,
      };
      const r = isEdit
        ? await apiRequest("PATCH", `/api/meter-readings/${editReadingId}`, payload)
        : await apiRequest("POST", "/api/meter-readings", payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meter-readings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets", assetId] });
      toast({ title: isEdit ? "Meter reading updated" : "Meter reading saved" });
      navigate(`/assets/${assetId}`);
    },
    onError: (e) => toast({ title: "Save failed", description: String(e), variant: "destructive" }),
  });

  const submit = (v: FormValues) => save.mutate(v);
  const goBack = () => navigate(`/assets/${assetId}`);

  return (
    <AppShell title={assetQ.data?.friendlyName ?? "Asset"} subtitle={isEdit ? "EDIT METER READING" : "NEW METER READING"}>
      <div className="space-y-5">
        <EditablePageActions
          hasChanges={form.formState.isDirty}
          isSaving={save.isPending}
          canSave={canEdit}
          onBack={goBack}
          onCancel={goBack}
          onSave={form.handleSubmit(submit)}
        />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)}>
            <Card className="p-5 space-y-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <h3 className="font-semibold">Meter Reading</h3>
              </div>
              {!canEdit && (
                <div className="rounded-md border border-[hsl(var(--status-warn)/0.35)] bg-[hsl(var(--status-warn)/0.08)] p-3 text-sm">
                  Viewer access is read-only. Switch to an editor or admin user to save meter readings.
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <FormField name="readingType" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Reading Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-reading-type"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="mileage">Mileage</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="count">Count</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField name="value" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Value</FormLabel>
                    <FormControl><Input type="number" step="any" data-testid="input-value" value={field.value ?? ""} onChange={e => field.onChange(Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="readingDate" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Reading Date</FormLabel><FormControl><Input type="date" data-testid="input-reading-date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="notes" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Notes</FormLabel><FormControl><Input data-testid="input-notes" {...field} value={field.value ?? ""} placeholder="Optional note" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </Card>
          </form>
        </Form>
      </div>
    </AppShell>
  );
}
