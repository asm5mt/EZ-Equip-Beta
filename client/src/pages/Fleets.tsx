import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppContext } from "@/lib/app-context";
import { BADGE_COLORS } from "@/lib/badges";
import { ArrowLeft, Plus, Tags, Trash2 } from "lucide-react";

const VIN_FEATURE_DEFAULT_NAMES = new Set(["vehicle", "truck", "tractor", "trailer", "atv", "utv", "snowmobile"]);

function defaultVinFeaturesForName(value: string) {
  return VIN_FEATURE_DEFAULT_NAMES.has(value.trim().toLowerCase());
}

export default function Fleets() {
  const { fleet, fleets, canAdmin } = useAppContext();
  const { toast } = useToast();

  const [newFleetName, setNewFleetName] = useState("");
  const [newFleetSlug, setNewFleetSlug] = useState("");
  const [fleetWizardOpen, setFleetWizardOpen] = useState(false);
  const [wizardTypeName, setWizardTypeName] = useState("vehicle");
  const [wizardTypeColor, setWizardTypeColor] = useState("blue");
  const [wizardTypeMeter, setWizardTypeMeter] = useState("mileage");
  const [pendingDeleteFleetId, setPendingDeleteFleetId] = useState<number | null>(null);
  const [deleteFleetAcknowledged, setDeleteFleetAcknowledged] = useState(false);

  const createFleetMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/fleets", {
        name: newFleetName,
        slug: newFleetSlug || newFleetName.toLowerCase().replace(/\s+/g, "-"),
        currency: fleet?.currency ?? "USD",
        notes: null,
      });
      const created = await res.json();
      await apiRequest("POST", "/api/fleet-equipment-types", {
        fleetId: created.id,
        name: wizardTypeName,
        color: wizardTypeColor,
        defaultMeter: wizardTypeMeter,
        enableVinFeatures: defaultVinFeaturesForName(wizardTypeName),
        active: true,
      });
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-equipment-types"] });
      setNewFleetName(""); setNewFleetSlug("");
      setWizardTypeName("vehicle"); setWizardTypeColor("blue"); setWizardTypeMeter("mileage");
      setFleetWizardOpen(false);
      toast({ title: "Fleet created" });
    },
  });

  const deleteFleetMut = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/fleets/${pendingDeleteFleetId}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleets"] });
      setPendingDeleteFleetId(null);
      setDeleteFleetAcknowledged(false);
      toast({ title: "Fleet deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const pendingDeleteFleet = fleets.find(f => f.id === pendingDeleteFleetId) ?? null;

  return (
    <AppShell title="Fleets" subtitle="Every fleet in this instance">
      <div className="space-y-5">
        <div className="flex items-center justify-start">
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="button-back-dashboard">
              <ArrowLeft className="size-4 mr-1.5" /> Back
            </Button>
          </Link>
        </div>

        {!canAdmin && (
          <Card className="p-4 status-warn">
            This role is read-only for fleet administration.
          </Card>
        )}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold">Fleets</h3>
            <div className="flex items-center gap-2">
              <Dialog open={fleetWizardOpen} onOpenChange={setFleetWizardOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={!canAdmin} data-testid="button-open-fleet-wizard"><Plus className="size-4 mr-1.5" /> Add Fleet</Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader><DialogTitle>Fleet Setup Wizard</DialogTitle></DialogHeader>
                  <div className="space-y-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Fleet identity</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                        <div><Label>Name</Label><Input value={newFleetName} onChange={e => setNewFleetName(e.target.value)} data-testid="input-new-fleet-name" /></div>
                        <div><Label>Slug</Label><Input value={newFleetSlug} onChange={e => setNewFleetSlug(e.target.value)} placeholder="auto" data-testid="input-new-fleet-slug" /></div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Required first asset type</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                        <div><Label>Type Name</Label><Input value={wizardTypeName} onChange={e => setWizardTypeName(e.target.value)} data-testid="input-wizard-type-name" /></div>
                        <SelectField label="Color" value={wizardTypeColor} onChange={setWizardTypeColor} options={BADGE_COLORS.map(c => [c, c])} testid="select-wizard-type-color" />
                        <SelectField label="Default Meter" value={wizardTypeMeter} onChange={setWizardTypeMeter} options={[["mileage", "mileage"], ["hours", "hours"], ["count", "count"], ["custom", "custom"]]} testid="select-wizard-type-meter" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">More fleet setup steps will be added here as we build out the wizard.</p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="cancel" onClick={() => setFleetWizardOpen(false)} data-testid="button-cancel-fleet-wizard">Cancel</Button>
                      <Button onClick={() => createFleetMut.mutate()} disabled={!canAdmin || !newFleetName || !wizardTypeName || createFleetMut.isPending} data-testid="button-create-fleet">
                        {createFleetMut.isPending ? "Creating…" : "Create Fleet"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <span className="text-xs text-muted-foreground">{fleets.length} total</span>
            </div>
          </div>
          <div className="grid gap-2">
            {fleets.map(f => (
              <div key={f.id} className="p-3 rounded-md border border-border flex items-center justify-between gap-3 flex-wrap" data-testid={`row-fleet-${f.id}`}>
                <div>
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">/{f.slug}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {fleet?.id === f.id && <Badge variant="outline" className="text-[10px] tracking-wide">Current</Badge>}
                  <Link href={`/settings/fleets/${f.id}`}>
                    <Button variant="outline" size="sm" data-testid={`button-fleet-settings-${f.id}`}>
                      <Tags className="size-4 mr-1.5" /> Settings
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    disabled={!canAdmin}
                    onClick={() => setPendingDeleteFleetId(f.id)}
                    data-testid={`button-delete-fleet-${f.id}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {fleets.length === 0 && <p className="text-sm text-muted-foreground">No fleets yet.</p>}
          </div>
        </Card>

        <AlertDialog
          open={pendingDeleteFleetId != null}
          onOpenChange={open => { if (!open) { setPendingDeleteFleetId(null); setDeleteFleetAcknowledged(false); } }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {pendingDeleteFleet?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{pendingDeleteFleet?.name}" and everything in it — all assets, service
                history, meter readings, inventory, and schedules. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={deleteFleetAcknowledged}
                onCheckedChange={c => setDeleteFleetAcknowledged(c === true)}
                className="mt-0.5"
                data-testid="checkbox-confirm-delete-fleet"
              />
              I understand this will permanently delete all assets and data in this fleet
            </label>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => { setPendingDeleteFleetId(null); setDeleteFleetAcknowledged(false); }}
                data-testid="button-cancel-delete-fleet"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!deleteFleetAcknowledged || deleteFleetMut.isPending}
                onClick={() => deleteFleetMut.mutate()}
                data-testid="button-confirm-delete-fleet"
              >
                {deleteFleetMut.isPending ? "Deleting…" : "Delete Fleet"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
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
