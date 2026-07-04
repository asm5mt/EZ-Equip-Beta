import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { EditablePageActions } from "@/components/EditablePageActions";
import {
  TriggerPanels,
  AssetAssignments,
  NotesPanel,
  FormHeaderRow,
  InfoTip,
  CategoryPicker,
  READING_TYPE_OPTIONS,
} from "@/components/ScheduleFormFields";
import type {
  Asset,
  MaintenanceSchedule,
  MaintenanceScheduleAssignment,
} from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { scheduleIntervalSummary } from "@/lib/format";
import { Sparkles, ArrowUpRight } from "lucide-react";

// ============================================================================
// Schedule form — fleet or asset scope depending on route.
//   /maintenance/schedules/new            -> fleet, new
//   /maintenance/schedules/:id/edit       -> fleet, edit
//   /assets/:assetId/schedules/new        -> asset, new
//   /assets/:assetId/schedules/:id/edit   -> asset, edit
// ============================================================================

type Scope = "fleet" | "asset";

interface FormState {
  name: string;
  category: string | null;
  readingType: string;
  meterInterval: number | null;
  dayInterval: number | null;
  meterDueSoon: number | null;
  dayDueSoon: number | null;
  notes: string;
  active: boolean;
}

function emptyState(): FormState {
  return {
    name: "",
    category: "Engine",
    readingType: "mileage",
    meterInterval: 5000,
    dayInterval: 90,
    meterDueSoon: 250,
    dayDueSoon: 7,
    notes: "",
    active: true,
  };
}

const PRESET_NAMES = [
  "Oil Change", "Air Filter", "Cabin Filter", "Transmission Service",
  "Transfer Case Service", "Front Differential", "Rear Differential",
  "Coolant Service", "Wipers", "Battery Test", "Annual Inspection",
  "Battery Terminal Service", "Brake Service", "Tire Rotation",
];

export default function ScheduleForm({ mode, scope }: { mode: "new" | "edit"; scope: Scope }) {
  const [, paramsFleetEdit] = useRoute("/maintenance/schedules/:id/edit");
  const [, paramsAssetEdit] = useRoute("/assets/:assetId/schedules/:id/edit");
  const [, paramsAssetNew] = useRoute("/assets/:assetId/schedules/new");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canEdit, fleet } = useAppContext();

  const assetId = scope === "asset"
    ? Number((paramsAssetEdit as any)?.assetId ?? (paramsAssetNew as any)?.assetId)
    : null;
  const scheduleId = mode === "edit"
    ? Number((paramsFleetEdit as any)?.id ?? (paramsAssetEdit as any)?.id)
    : null;

  // ---------- Data loads ----------
  const assetsQ = useQuery<Asset[]>({
    queryKey: ["/api/assets", { fleetId: fleet?.id }],
    enabled: !!fleet?.id,
  });
  const assetQ = useQuery<Asset>({
    queryKey: ["/api/assets", assetId],
    enabled: !!assetId,
  });
  const schedQ = useQuery<MaintenanceSchedule>({
    queryKey: ["/api/schedules", scheduleId],
    enabled: !!scheduleId,
  });
  const assignmentsQ = useQuery<MaintenanceScheduleAssignment[]>({
    queryKey: ["/api/schedules", scheduleId, "assignments"],
    enabled: !!scheduleId && scope === "fleet",
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/schedules/${scheduleId}/assignments`);
      return res.json();
    },
  });
  const fleetSchedulesQ = useQuery<MaintenanceSchedule[]>({
    queryKey: ["/api/schedules", { fleetId: fleet?.id }],
    enabled: !!fleet?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/schedules?fleetId=${fleet!.id}`);
      return res.json();
    },
  });

  // ---------- Form state ----------
  const [state, setState] = useState<FormState>(emptyState());
  const [assignmentIds, setAssignmentIds] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [usePresetOpen, setUsePresetOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  // Hydrate state from server when editing.
  useEffect(() => {
    if (mode !== "edit" || !schedQ.data) return;
    const s = schedQ.data;
    setState({
      name: s.name,
      category: s.category ?? null,
      readingType: s.readingType ?? "mileage",
      meterInterval: s.meterInterval ?? null,
      dayInterval: s.dayInterval ?? null,
      meterDueSoon: s.meterDueSoon ?? null,
      dayDueSoon: s.dayDueSoon ?? null,
      notes: s.notes ?? "",
      active: s.active,
    });
    setDirty(false);
  }, [schedQ.data, mode]);

  useEffect(() => {
    if (scope === "asset" && mode === "new" && assetQ.data) {
      setState(prev => ({ ...prev, readingType: assetQ.data!.meterType ?? "mileage" }));
    }
  }, [assetQ.data, mode, scope]);

  // Load assignments for fleet edit.
  useEffect(() => {
    if (scope === "fleet" && mode === "edit" && assignmentsQ.data) {
      setAssignmentIds(new Set(assignmentsQ.data.map(a => a.assetId)));
    }
  }, [assignmentsQ.data, scope, mode]);

  const setStateField = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setState(prev => ({ ...prev, [k]: v }));
    setDirty(true);
  };

  // ---------- Mutations ----------
  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        scope,
        fleetId: fleet?.id ?? null,
        assetId: scope === "asset" ? assetId : null,
        name: state.name,
        category: state.category || null,
        readingType: state.readingType,
        meterInterval: state.meterInterval,
        dayInterval: state.dayInterval,
        meterDueSoon: state.meterDueSoon,
        dayDueSoon: state.dayDueSoon,
        notes: state.notes || null,
        active: state.active,
      };
      let saved: MaintenanceSchedule;
      if (mode === "edit") {
        const r = await apiRequest("PATCH", `/api/schedules/${scheduleId}`, payload);
        saved = await r.json();
      } else {
        const r = await apiRequest("POST", "/api/schedules", payload);
        saved = await r.json();
      }
      if (scope === "fleet") {
        await apiRequest("PUT", `/api/schedules/${saved.id}/assignments`, {
          assetIds: Array.from(assignmentIds),
        });
      }
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-assignments"] });
      toast({ title: mode === "edit" ? "Schedule updated" : "Schedule added" });
      if (scope === "asset" && assetId) {
        navigate(`/assets/${assetId}`);
      } else if (scope === "fleet" && mode === "new") {
        // After creating a fleet schedule, stay on the edit page so the user can manage assignments.
        navigate(`/maintenance/schedules/${saved.id}/edit`);
      } else {
        navigate("/maintenance");
      }
    },
    onError: (e) => toast({ title: "Save failed", description: String(e), variant: "destructive" }),
  });

  const promote = useMutation({
    mutationFn: async (additionalAssetIds: number[]) => {
      const r = await apiRequest("POST", `/api/schedules/${scheduleId}/promote`, { assetIds: additionalAssetIds });
      return r.json() as Promise<MaintenanceSchedule>;
    },
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-assignments"] });
      toast({ title: "Promoted to Fleet Schedule" });
      navigate(`/maintenance/schedules/${s.id}/edit`);
    },
    onError: (e) => toast({ title: "Promote failed", description: String(e), variant: "destructive" }),
  });

  const submit = () => save.mutate();
  const goBack = () => {
    if (scope === "asset" && assetId) navigate(`/assets/${assetId}`);
    else navigate("/maintenance");
  };

  // ---------- Use Fleet Schedule as Starting Point ----------
  const applyPreset = (s: MaintenanceSchedule) => {
    setState({
      name: s.name,
      category: s.category ?? null,
      readingType: s.readingType ?? "mileage",
      meterInterval: s.meterInterval ?? null,
      dayInterval: s.dayInterval ?? null,
      meterDueSoon: s.meterDueSoon ?? null,
      dayDueSoon: s.dayDueSoon ?? null,
      notes: s.notes ?? "",
      active: true,
    });
    setDirty(true);
    setUsePresetOpen(false);
  };

  // ---------- UI ----------
  const subtitle = mode === "edit"
    ? scope === "fleet" ? "EDIT FLEET SCHEDULE" : "EDIT ASSET SCHEDULE"
    : scope === "fleet" ? "NEW FLEET SCHEDULE" : "NEW ASSET SCHEDULE";
  const title = scope === "asset" ? assetQ.data?.friendlyName ?? "Asset" : "Maintenance";

  const fleetSchedules = useMemo(
    () => (fleetSchedulesQ.data ?? []).filter(s => s.scope === "fleet"),
    [fleetSchedulesQ.data],
  );

  return (
    <AppShell title={title} subtitle={subtitle}>
      <div className="space-y-5">
        <EditablePageActions
          hasChanges={dirty}
          isSaving={save.isPending}
          canSave={canEdit && state.name.trim().length > 0}
          onBack={goBack}
          onCancel={goBack}
          onSave={submit}
        />

        {!canEdit && (
          <div className="rounded-md border border-[hsl(var(--status-warn)/0.35)] bg-[hsl(var(--status-warn)/0.08)] p-3 text-sm">
            Viewer access is read-only. Switch to an editor or admin user to save schedule changes.
          </div>
        )}

        {scope === "asset" && mode === "new" && (
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setUsePresetOpen(true)}
              data-testid="button-use-fleet-starting-point"
            >
              <Sparkles className="size-4 mr-1.5" /> Use Fleet Schedule as Starting Point
            </Button>
          </div>
        )}

        <Card className="p-5 space-y-5" data-testid="card-schedule-form">
          {/* Top header row */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Schedule Name<InfoTip text="Short, recognizable name. Used everywhere this schedule appears." /></Label>
              <Input
                list="preset-schedule-names"
                placeholder="e.g. Oil Change"
                value={state.name}
                disabled={!canEdit}
                onChange={(e) => setStateField("name", e.target.value)}
                data-testid="input-schedule-name"
              />
              <datalist id="preset-schedule-names">
                {PRESET_NAMES.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <FormHeaderRow>
              <div>
                <Label className="text-xs">Category<InfoTip text="Used by the global Maintenance page's By Category view." /></Label>
                <CategoryPicker
                  value={state.category}
                  onChange={(v) => setStateField("category", v)}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label className="text-xs">Reading Type / Meter Basis<InfoTip text="Which meter the schedule tracks. Controls unit labels on inputs and reports." /></Label>
                <Select value={state.readingType} onValueChange={(v) => setStateField("readingType", v)}>
                  <SelectTrigger data-testid="select-reading-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {READING_TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </FormHeaderRow>
          </div>

          <TriggerPanels
            readingType={state.readingType}
            meterLabel={scope === "asset" ? assetQ.data?.meterLabel : null}
            meterInterval={state.meterInterval}
            setMeterInterval={(v) => setStateField("meterInterval", v)}
            meterDueSoon={state.meterDueSoon}
            setMeterDueSoon={(v) => setStateField("meterDueSoon", v)}
            dayInterval={state.dayInterval}
            setDayInterval={(v) => setStateField("dayInterval", v)}
            dayDueSoon={state.dayDueSoon}
            setDayDueSoon={(v) => setStateField("dayDueSoon", v)}
            disabled={!canEdit}
          />

          <NotesPanel
            value={state.notes}
            onChange={(v) => setStateField("notes", v)}
            disabled={!canEdit}
          />
        </Card>

        {scope === "fleet" && (
          <AssetAssignments
            assets={assetsQ.data ?? []}
            selectedIds={assignmentIds}
            onToggle={(id) => {
              setAssignmentIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              });
              setDirty(true);
            }}
            onSelectAll={(ids) => { const next = new Set<number>(); assignmentIds.forEach(v => next.add(v)); ids.forEach(v => next.add(v)); setAssignmentIds(next); setDirty(true); }}
            onClearAll={() => { setAssignmentIds(new Set()); setDirty(true); }}
            disabled={!canEdit}
          />
        )}

        {scope === "asset" && mode === "edit" && (
          <Card className="p-4 flex items-center justify-between gap-3 flex-wrap" data-testid="panel-promote">
            <div>
              <div className="font-semibold">Promote to Fleet Schedule</div>
              <div className="text-xs text-muted-foreground">
                Convert this Asset Schedule into a Fleet Schedule and assign it to more assets.
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPromoteOpen(true)}
              disabled={!canEdit}
              data-testid="button-promote-to-fleet"
            >
              <ArrowUpRight className="size-4 mr-1.5" /> Promote to Fleet Schedule
            </Button>
          </Card>
        )}
      </div>

      {/* Use Fleet Schedule as Starting Point picker */}
      <Dialog open={usePresetOpen} onOpenChange={setUsePresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use Fleet Schedule as Starting Point</DialogTitle>
            <DialogDescription>
              Pick a Fleet Schedule to pre-fill this form. The new schedule will be saved as an Asset Schedule for this asset.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto divide-y divide-border/60 rounded-md border border-border/60">
            {fleetSchedules.length === 0 && (
              <p className="text-sm text-muted-foreground p-3">No Fleet Schedules yet.</p>
            )}
            {fleetSchedules.map(s => (
              <button
                key={s.id}
                type="button"
                className="w-full text-left p-3 hover:bg-muted/40"
                onClick={() => applyPreset(s)}
                data-testid={`button-preset-${s.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.category ?? "Uncategorized"} · {scheduleIntervalSummary(s, null)}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">Fleet Schedule</Badge>
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsePresetOpen(false)} data-testid="button-preset-cancel">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote confirmation */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote to Fleet Schedule</DialogTitle>
            <DialogDescription>
              This will convert the Asset Schedule into a shared Fleet Schedule. Existing completion history for {assetQ.data?.friendlyName ?? "this asset"} is preserved.
              You'll be taken to the Fleet Schedule edit page to assign it to additional assets.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteOpen(false)} data-testid="button-promote-cancel">Cancel</Button>
            <Button onClick={() => promote.mutate([])} disabled={promote.isPending} data-testid="button-promote-confirm">
              {promote.isPending ? "Promoting…" : "Promote & Manage Assignments"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
