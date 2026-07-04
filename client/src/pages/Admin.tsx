import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppContext } from "@/lib/app-context";
import type { Role } from "@/lib/app-context";
import type { AppSetting, Fleet, User, FleetRole } from "@shared/schema";
import { BADGE_COLORS } from "@/lib/badges";
import { ArrowLeft, Moon, Ruler, Settings as SettingsIcon, Sun, Monitor, Tags, ShieldCheck, UserCog, Save, X, Plus, Trash2 } from "lucide-react";

type ThemeMode = "auto" | "dark" | "light";

const VIN_FEATURE_DEFAULT_NAMES = new Set(["vehicle", "truck", "tractor", "trailer", "atv", "utv", "snowmobile"]);

function defaultVinFeaturesForName(value: string) {
  return VIN_FEATURE_DEFAULT_NAMES.has(value.trim().toLowerCase());
}

export default function Admin() {
  const { fleet, fleets, users, memberships, role, canAdmin } = useAppContext();
  const { toast } = useToast();
  const settingsQ = useQuery<AppSetting[]>({ queryKey: ["/api/app-settings"] });

  const persisted = useMemo(() => {
    const map = new Map((settingsQ.data ?? []).map(s => [s.key, s.value]));
    return {
      themeMode: ((map.get("themeMode") as ThemeMode) || "auto") as ThemeMode,
      unitSystem: map.get("unitSystem") || "imperial",
      distanceUnit: map.get("distanceUnit") || "mi",
      volumeUnit: map.get("volumeUnit") || "qt",
      defaultMeter: map.get("defaultMeter") || "mileage",
    };
  }, [settingsQ.data]);

  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
  const [unitSystem, setUnitSystem] = useState("imperial");
  const [distanceUnit, setDistanceUnit] = useState("mi");
  const [volumeUnit, setVolumeUnit] = useState("qt");
  const [defaultMeter, setDefaultMeter] = useState("mileage");

  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newFleetName, setNewFleetName] = useState("");
  const [newFleetSlug, setNewFleetSlug] = useState("");
  const [fleetWizardOpen, setFleetWizardOpen] = useState(false);
  const [wizardTypeName, setWizardTypeName] = useState("vehicle");
  const [wizardTypeColor, setWizardTypeColor] = useState("blue");
  const [wizardTypeMeter, setWizardTypeMeter] = useState("mileage");

  useEffect(() => {
    setThemeMode(persisted.themeMode);
    setUnitSystem(persisted.unitSystem);
    setDistanceUnit(persisted.distanceUnit);
    setVolumeUnit(persisted.volumeUnit);
    setDefaultMeter(persisted.defaultMeter);
  }, [persisted]);

  const draft = { themeMode, unitSystem, distanceUnit, volumeUnit, defaultMeter };
  const dirty = JSON.stringify(draft) !== JSON.stringify(persisted);

  const previewTheme = (value: ThemeMode) => {
    setThemeMode(value);
    window.dispatchEvent(new CustomEvent("ez-equip-theme", { detail: value }));
  };

  const saveSettings = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/app-settings", draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const cancelDraft = () => {
    setThemeMode(persisted.themeMode);
    setUnitSystem(persisted.unitSystem);
    setDistanceUnit(persisted.distanceUnit);
    setVolumeUnit(persisted.volumeUnit);
    setDefaultMeter(persisted.defaultMeter);
    window.dispatchEvent(new CustomEvent("ez-equip-theme", { detail: persisted.themeMode }));
  };

  const createUserMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/users", {
        username: newUsername,
        displayName: newDisplayName || newUsername,
        email: newEmail || null,
        passwordHash: null,
        systemAdmin: false,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setNewUsername(""); setNewDisplayName(""); setNewEmail("");
      setAddUserOpen(false);
      toast({ title: "User created" });
    },
  });

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

  return (
    <AppShell title="Settings" subtitle="Theme, units, fleets, local users, and access control">
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-start">
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="button-back-dashboard">
              <ArrowLeft className="size-4 mr-1.5" /> Back
            </Button>
          </Link>
        </div>

        <SectionRule label="User Interface" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <SettingsIcon className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
              <div>
                <h3 className="font-semibold">Appearance</h3>
                <p className="text-sm text-muted-foreground mt-1">Preview a theme, then save it so the choice survives navigation and refreshes.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant={themeMode === "auto" ? "default" : "outline"} onClick={() => previewTheme("auto")} data-testid="button-theme-auto">
                <Monitor className="size-4 mr-1.5" /> Auto
              </Button>
              <Button type="button" variant={themeMode === "light" ? "default" : "outline"} onClick={() => previewTheme("light")} data-testid="button-theme-light">
                <Sun className="size-4 mr-1.5" /> Light
              </Button>
              <Button type="button" variant={themeMode === "dark" ? "default" : "outline"} onClick={() => previewTheme("dark")} data-testid="button-theme-dark">
                <Moon className="size-4 mr-1.5" /> Dark
              </Button>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <Ruler className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
              <div>
                <h3 className="font-semibold">Units & Meters</h3>
                <p className="text-sm text-muted-foreground mt-1">Set display preferences for distance, volume, and default meter style.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField label="Unit System" value={unitSystem} onChange={setUnitSystem} options={[["imperial", "Imperial"], ["metric", "Metric"], ["mixed", "Mixed / Asset-specific"]]} testid="select-unit-system" />
              <SelectField label="Distance" value={distanceUnit} onChange={setDistanceUnit} options={[["mi", "Miles"], ["km", "Kilometers"]]} testid="select-distance-unit" />
              <SelectField label="Volume" value={volumeUnit} onChange={setVolumeUnit} options={[["qt", "Quarts"], ["gal", "Gallons"], ["l", "Liters"], ["ml", "Milliliters"]]} testid="select-volume-unit" />
              <SelectField label="Default Meter" value={defaultMeter} onChange={setDefaultMeter} options={[["mileage", "Mileage"], ["hours", "Hours"], ["count", "Count"], ["custom", "Custom"]]} testid="select-default-meter" />
            </div>
          </Card>
        </div>

        {!canAdmin && (
          <Card className="p-4 status-warn">
            You are signed in as <strong>{role}</strong>. This role is read-only for administration and editing workflows.
          </Card>
        )}

        <SectionRule label="Fleet Administration" />
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold">Fleets</h3>
            <span className="text-xs text-muted-foreground">{fleets.length} total</span>
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
                  <FleetRolesDialog fleet={f} />
                </div>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-border">
            <Dialog open={fleetWizardOpen} onOpenChange={setFleetWizardOpen}>
              <DialogTrigger asChild>
                <Button disabled={!canAdmin} data-testid="button-open-fleet-wizard"><Plus className="size-4 mr-1.5" /> Add Fleet</Button>
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
          </div>
        </Card>

        <SectionRule label="User Management" />
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold">Users</h3>
            <div className="flex items-center gap-2">
              <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={!canAdmin} data-testid="button-add-user"><Plus className="size-4 mr-1.5" /> Add User</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
                  <div className="grid gap-3">
                    <div><Label>Username</Label><Input value={newUsername} onChange={e => setNewUsername(e.target.value)} data-testid="input-new-username" /></div>
                    <div><Label>Display Name</Label><Input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} data-testid="input-new-display-name" /></div>
                    <div><Label>Email</Label><Input value={newEmail} onChange={e => setNewEmail(e.target.value)} data-testid="input-new-email" /></div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="cancel" onClick={() => setAddUserOpen(false)} data-testid="button-cancel-add-user">Cancel</Button>
                      <Button onClick={() => createUserMut.mutate()} disabled={!canAdmin || !newUsername || createUserMut.isPending} data-testid="button-create-user">
                        {createUserMut.isPending ? "Creating…" : "Create User"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <span className="text-xs text-muted-foreground">{users.length} total</span>
            </div>
          </div>
          <div className="grid gap-2">
            {users.map(u => <UserRow key={u.id} user={u} />)}
          </div>
        </Card>

        {dirty && (
          <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border p-4 shadow-lg status-warn" data-testid="panel-unsaved-settings">
            <div className="font-semibold">You have unsaved changes</div>
            <p className="text-sm text-muted-foreground mt-1">Save these settings or cancel to return to the last saved configuration.</p>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="cancel" size="sm" onClick={cancelDraft} data-testid="button-cancel-settings"><X className="size-4 mr-1.5" /> Cancel</Button>
              <Button variant="success" size="sm" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} data-testid="button-save-settings"><Save className="size-4 mr-1.5" /> Save</Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <Separator className="flex-1" />
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

function FleetRolesDialog({ fleet }: { fleet: Fleet }) {
  const { canAdmin } = useAppContext();
  const { toast } = useToast();
  const rolesQ = useQuery<FleetRole[]>({ queryKey: ["/api/fleet-roles", { fleetId: fleet.id }] });
  const [name, setName] = useState("");
  const [permission, setPermission] = useState("viewer");
  const [description, setDescription] = useState("");
  const createRole = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/fleet-roles", { fleetId: fleet.id, name: name.toLowerCase(), permission, description: description || null, builtIn: false })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] });
      setName(""); setPermission("viewer"); setDescription("");
      toast({ title: "Fleet role added" });
    },
  });
  const updateRole = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<FleetRole> }) => (await apiRequest("PATCH", `/api/fleet-roles/${id}`, patch)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] }),
  });
  const deleteRole = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/fleet-roles/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] });
      toast({ title: "Fleet role deleted" });
    },
  });
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-fleet-roles-${fleet.id}`}><ShieldCheck className="size-4 mr-1.5" /> Roles</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{fleet.name} Roles</DialogTitle></DialogHeader>
        <div className="grid gap-2">
          {(rolesQ.data ?? []).map(role => (
            <div key={role.id} className="grid grid-cols-1 sm:grid-cols-[130px_130px_1fr_44px] gap-2 rounded-md border border-border p-3 items-center">
              <Input value={role.name} disabled={!canAdmin || role.builtIn} onChange={e => updateRole.mutate({ id: role.id, patch: { name: e.target.value.toLowerCase() } })} data-testid={`input-fleet-role-name-${role.id}`} />
              <Select value={role.permission} onValueChange={value => updateRole.mutate({ id: role.id, patch: { permission: value } })} disabled={!canAdmin}>
                <SelectTrigger data-testid={`select-fleet-role-permission-${role.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">viewer</SelectItem>
                  <SelectItem value="editor">editor</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
              <Input value={role.description ?? ""} disabled={!canAdmin} onChange={e => updateRole.mutate({ id: role.id, patch: { description: e.target.value } })} data-testid={`input-fleet-role-description-${role.id}`} />
              <Button variant="ghost" size="sm" disabled={!canAdmin || role.builtIn || deleteRole.isPending} onClick={() => deleteRole.mutate(role.id)} data-testid={`button-delete-fleet-role-${role.id}`}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[130px_130px_1fr_auto] gap-2 rounded-md bg-muted p-3 items-end">
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="mechanic" data-testid="input-new-fleet-role" /></div>
          <SelectField label="Permission" value={permission} onChange={setPermission} options={[["viewer", "viewer"], ["editor", "editor"], ["admin", "admin"]]} testid="select-new-fleet-role-permission" />
          <div><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} data-testid="input-new-fleet-role-description" /></div>
          <Button disabled={!canAdmin || !name || createRole.isPending} onClick={() => createRole.mutate()} data-testid="button-create-fleet-role"><Plus className="size-4 mr-1.5" /> Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ user }: { user: User }) {
  const { fleets, memberships, canAdmin } = useAppContext();
  const { toast } = useToast();
  const rolesQ = useQuery<FleetRole[]>({ queryKey: ["/api/fleet-roles"] });
  const assign = useMutation({
    mutationFn: async ({ fleetId, role }: { fleetId: number; role: Role }) => {
      const res = await apiRequest("POST", "/api/fleet-memberships", { fleetId, userId: user.id, role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-memberships"] });
      toast({ title: "Access updated" });
    },
  });
  const removeAccess = useMutation({
    mutationFn: async ({ fleetId, userId }: { fleetId: number; userId: number }) => (await apiRequest("DELETE", `/api/fleet-memberships?fleetId=${fleetId}&userId=${userId}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-memberships"] });
      toast({ title: "Access removed" });
    },
  });
  const deleteUser = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/users/${user.id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-memberships"] });
      toast({ title: "User deleted" });
    },
  });

  return (
    <div className="p-3 rounded-md border border-border flex items-center justify-between gap-3 flex-wrap" data-testid={`row-user-${user.id}`}>
      <div>
        <div className="font-medium">{user.displayName} <span className="text-xs text-muted-foreground">@{user.username}</span></div>
        <div className="text-xs text-muted-foreground">{user.email ?? "no email"}</div>
      </div>
      <div className="flex items-center gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" data-testid={`button-manage-user-${user.id}`}><UserCog className="size-4 mr-1.5" /> Manage Access</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{user.displayName} Fleet Access</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              {fleets.map(fleet => {
                const m = memberships.find(m => m.fleetId === fleet.id && m.userId === user.id);
                const fleetRoles = (rolesQ.data ?? []).filter(r => r.fleetId === fleet.id);
                return (
                  <div key={fleet.id} className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3 items-center rounded-md border border-border p-3">
                    <div>
                      <div className="font-medium">{fleet.name}</div>
                      <div className="text-xs text-muted-foreground">Current role: {m?.role ?? "no access"}</div>
                    </div>
                    <Select
                      value={(m?.role as string) ?? "none"}
                      onValueChange={(role) => role === "none" ? removeAccess.mutate({ fleetId: fleet.id, userId: user.id }) : assign.mutate({ fleetId: fleet.id, role })}
                      disabled={!canAdmin}
                    >
                      <SelectTrigger data-testid={`select-user-${user.id}-fleet-${fleet.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">no access</SelectItem>
                        {fleetRoles.map(role => <SelectItem key={role.id} value={role.name}>{role.name} ({role.permission})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
        <Button variant="destructive" size="sm" disabled={!canAdmin || deleteUser.isPending} onClick={() => deleteUser.mutate()} data-testid={`button-delete-user-${user.id}`}>
          <Trash2 className="size-4 mr-1.5" /> Delete
        </Button>
      </div>
    </div>
  );
}
