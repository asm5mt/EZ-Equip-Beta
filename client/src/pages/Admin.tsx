import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
import type { FleetRoleWithPermissions } from "@/lib/app-context";
import type { AppSetting, Fleet, User, SystemSettings, OidcGroupMapping } from "@shared/schema";
import type { PermissionCatalogEntry } from "@shared/permissions";
import { BADGE_COLORS } from "@/lib/badges";
import {
  ArrowLeft, Moon, Ruler, Settings as SettingsIcon, Sun, Monitor, Tags, ShieldCheck, UserCog, KeyRound,
  Save, X, Plus, Trash2, Lock, Globe, Link2, CheckCircle2, XCircle, Network,
} from "lucide-react";

type ThemeMode = "auto" | "dark" | "light";

const VIN_FEATURE_DEFAULT_NAMES = new Set(["vehicle", "truck", "tractor", "trailer", "atv", "utv", "snowmobile"]);

function defaultVinFeaturesForName(value: string) {
  return VIN_FEATURE_DEFAULT_NAMES.has(value.trim().toLowerCase());
}

export default function Admin() {
  const { fleet, fleets, users, canAdmin } = useAppContext();
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

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto" data-testid="tabs-settings">
            <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
            <TabsTrigger value="fleets" data-testid="tab-fleets">Fleets</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="roles" data-testid="tab-roles">Roles & Permissions</TabsTrigger>
            <TabsTrigger value="auth" data-testid="tab-auth">Authentication</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-5 space-y-5">
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
          </TabsContent>

          <TabsContent value="fleets" className="mt-5 space-y-5">
            {!canAdmin && (
              <Card className="p-4 status-warn">
                This role is read-only for fleet administration.
              </Card>
            )}
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
                    </div>
                  </div>
                ))}
                {fleets.length === 0 && <p className="text-sm text-muted-foreground">No fleets yet.</p>}
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
          </TabsContent>

          <TabsContent value="users" className="mt-5 space-y-5">
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
          </TabsContent>

          <TabsContent value="roles" className="mt-5">
            <RolesPermissionsSection />
          </TabsContent>

          <TabsContent value="auth" className="mt-5">
            <AuthenticationSection />
          </TabsContent>
        </Tabs>

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

function PermissionCheckboxes({ permissions, selected, onToggle, disabled, idPrefix }: {
  permissions: PermissionCatalogEntry[];
  selected: string[];
  onToggle: (key: string, checked: boolean) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const byCategory = new Map<string, PermissionCatalogEntry[]>();
  for (const p of permissions) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p);
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from(byCategory.entries()).map(([category, entries]) => (
        <div key={category} className="space-y-1.5">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{category}</div>
          {entries.map(p => (
            <label key={p.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(p.key)}
                onCheckedChange={checked => onToggle(p.key, checked === true)}
                disabled={disabled}
                data-testid={`checkbox-${idPrefix}-${p.key}`}
              />
              {p.label}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roles & Permissions (promoted from the old per-fleet FleetRolesDialog)
// ---------------------------------------------------------------------------

function RolesPermissionsSection() {
  const { fleets, fleet: currentFleet, canAdmin } = useAppContext();
  const { toast } = useToast();
  const [selectedFleetId, setSelectedFleetId] = useState<number | null>(null);
  const fleetId = selectedFleetId ?? currentFleet?.id ?? fleets[0]?.id ?? null;
  const selectedFleet = fleets.find(f => f.id === fleetId) ?? null;

  const rolesQ = useQuery<FleetRoleWithPermissions[]>({ queryKey: ["/api/fleet-roles", { fleetId }], enabled: !!fleetId });
  const permissionsQ = useQuery<PermissionCatalogEntry[]>({ queryKey: ["/api/permissions"] });
  const permissionCatalog = permissionsQ.data ?? [];
  const [name, setName] = useState("");
  const [newPermissions, setNewPermissions] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const createRole = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/fleet-roles", { fleetId, name: name.toLowerCase(), permissions: newPermissions, description: description || null, builtIn: false })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] });
      setName(""); setNewPermissions([]); setDescription("");
      toast({ title: "Fleet role added" });
    },
  });
  const updateRole = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<FleetRoleWithPermissions> }) => (await apiRequest("PATCH", `/api/fleet-roles/${id}`, patch)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] }),
    onError: (e: any) => toast({ title: "Update failed", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const deleteRole = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/fleet-roles/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] });
      toast({ title: "Fleet role deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
          <div>
            <h3 className="font-semibold">Roles & Permissions</h3>
            <p className="text-sm text-muted-foreground mt-1">Choose a fleet to manage its roles and the permissions each role grants.</p>
          </div>
        </div>
        <div className="max-w-xs">
          <Label>Fleet</Label>
          <Select value={fleetId ? String(fleetId) : undefined} onValueChange={v => setSelectedFleetId(Number(v))}>
            <SelectTrigger data-testid="select-roles-fleet"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {selectedFleet && (
        <Card className="p-5 space-y-4">
          <div className="grid gap-3">
            {(rolesQ.data ?? []).map(role => (
              <div key={role.id} className="rounded-md border border-border p-4 space-y-3" data-testid={`row-fleet-role-${role.id}`}>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_44px] gap-2 items-center">
                  <Input value={role.name} disabled={!canAdmin || role.builtIn} onChange={e => updateRole.mutate({ id: role.id, patch: { name: e.target.value.toLowerCase() } })} data-testid={`input-fleet-role-name-${role.id}`} />
                  <Input value={role.description ?? ""} disabled={!canAdmin} onChange={e => updateRole.mutate({ id: role.id, patch: { description: e.target.value } })} data-testid={`input-fleet-role-description-${role.id}`} />
                  <Button variant="ghost" size="sm" disabled={!canAdmin || role.builtIn || deleteRole.isPending} onClick={() => deleteRole.mutate(role.id)} data-testid={`button-delete-fleet-role-${role.id}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {role.builtIn && <Badge variant="outline" className="text-[10px] tracking-wide">Built-in</Badge>}
                <PermissionCheckboxes
                  permissions={permissionCatalog}
                  selected={role.permissions}
                  disabled={!canAdmin}
                  idPrefix={`role-${role.id}`}
                  onToggle={(key, checked) => {
                    const next = checked ? [...role.permissions, key] : role.permissions.filter(p => p !== key);
                    updateRole.mutate({ id: role.id, patch: { permissions: next } });
                  }}
                />
              </div>
            ))}
            {(rolesQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No roles yet for this fleet.</p>}
          </div>

          <div className="rounded-md bg-muted p-4 space-y-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Add a custom role</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="mechanic" data-testid="input-new-fleet-role" /></div>
              <div><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} data-testid="input-new-fleet-role-description" /></div>
            </div>
            <PermissionCheckboxes
              permissions={permissionCatalog}
              selected={newPermissions}
              idPrefix="new-role"
              onToggle={(key, checked) => setNewPermissions(prev => checked ? [...prev, key] : prev.filter(p => p !== key))}
            />
            <div className="flex justify-end">
              <Button disabled={!canAdmin || !name || createRole.isPending} onClick={() => createRole.mutate()} data-testid="button-create-fleet-role"><Plus className="size-4 mr-1.5" /> Add</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Authentication (auth mode, OIDC provider config, group -> role mappings)
// ---------------------------------------------------------------------------

type SystemSettingsResponse = Omit<SystemSettings, "oidcClientSecret"> & { oidcClientSecretSet: boolean };

function AuthenticationSection() {
  const { systemAdmin } = useAppContext();
  const { toast } = useToast();
  const settingsQ = useQuery<SystemSettingsResponse>({ queryKey: ["/api/system-settings"], enabled: systemAdmin });

  const [authMode, setAuthMode] = useState<"local" | "oidc" | "both">("local");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; issuer?: string } | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setAuthMode((settingsQ.data.authMode as "local" | "oidc" | "both") ?? "local");
    setIssuerUrl(settingsQ.data.oidcIssuerUrl ?? "");
    setClientId(settingsQ.data.oidcClientId ?? "");
    setRedirectUri(settingsQ.data.oidcRedirectUri ?? `${window.location.origin}/api/auth/oidc/callback`);
    setClientSecret("");
  }, [settingsQ.data]);

  const persisted = useMemo(() => ({
    authMode: settingsQ.data?.authMode ?? "local",
    oidcIssuerUrl: settingsQ.data?.oidcIssuerUrl ?? "",
    oidcClientId: settingsQ.data?.oidcClientId ?? "",
    oidcRedirectUri: settingsQ.data?.oidcRedirectUri ?? "",
  }), [settingsQ.data]);
  const dirty = authMode !== persisted.authMode || issuerUrl !== persisted.oidcIssuerUrl
    || clientId !== persisted.oidcClientId || redirectUri !== persisted.oidcRedirectUri || clientSecret.length > 0;

  const saveMut = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/system-settings", {
      authMode, oidcIssuerUrl: issuerUrl, oidcClientId: clientId, oidcRedirectUri: redirectUri,
      ...(clientSecret ? { oidcClientSecret: clientSecret } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      setClientSecret("");
      toast({ title: "Authentication settings saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const testMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/system-settings/test-oidc-connection", {
      issuerUrl, clientId, ...(clientSecret ? { clientSecret } : {}),
    })).json(),
    onSuccess: (data) => setTestResult(data),
  });

  if (!systemAdmin) {
    return <Card className="p-4 status-warn">Authentication settings are restricted to system administrators.</Card>;
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Lock className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
          <div>
            <h3 className="font-semibold">Sign-in method</h3>
            <p className="text-sm text-muted-foreground mt-1">"Both" shows a local sign-in form and an SSO link together on the login screen.</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 max-w-md">
          <Button type="button" variant={authMode === "local" ? "default" : "outline"} onClick={() => setAuthMode("local")} data-testid="button-auth-mode-local">Local only</Button>
          <Button type="button" variant={authMode === "oidc" ? "default" : "outline"} onClick={() => setAuthMode("oidc")} data-testid="button-auth-mode-oidc">OIDC only</Button>
          <Button type="button" variant={authMode === "both" ? "default" : "outline"} onClick={() => setAuthMode("both")} data-testid="button-auth-mode-both">Both</Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Globe className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
          <div>
            <h3 className="font-semibold">OIDC provider</h3>
            <p className="text-sm text-muted-foreground mt-1">Connect an OpenID Connect identity provider (Okta, Azure AD, Keycloak, Authentik, etc.).</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Issuer URL</Label>
            <Input value={issuerUrl} onChange={e => setIssuerUrl(e.target.value)} placeholder="https://idp.example.com" data-testid="input-oidc-issuer" />
          </div>
          <div>
            <Label>Client ID</Label>
            <Input value={clientId} onChange={e => setClientId(e.target.value)} data-testid="input-oidc-client-id" />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input
              type="password"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder={settingsQ.data?.oidcClientSecretSet ? "•••• configured" : "Not set"}
              data-testid="input-oidc-client-secret"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Redirect URI</Label>
            <Input value={redirectUri} onChange={e => setRedirectUri(e.target.value)} data-testid="input-oidc-redirect-uri" />
            <p className="text-xs text-muted-foreground mt-1">Register this exact URL with your identity provider.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={() => testMut.mutate()} disabled={!issuerUrl || !clientId || testMut.isPending} data-testid="button-test-oidc-connection">
            <Link2 className="size-4 mr-1.5" /> {testMut.isPending ? "Testing…" : "Test connection"}
          </Button>
          {testResult && (testResult.ok
            ? <Badge className="gap-1" data-testid="badge-oidc-test-success"><CheckCircle2 className="size-3.5" /> Connected: {testResult.issuer}</Badge>
            : <Badge variant="destructive" className="gap-1" data-testid="badge-oidc-test-failure"><XCircle className="size-3.5" /> {testResult.error}</Badge>
          )}
          <div className="flex-1" />
          <Button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending} data-testid="button-save-oidc-settings">
            <Save className="size-4 mr-1.5" /> {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>

      <GroupMappingsCard />
    </div>
  );
}

function GroupMappingsCard() {
  const { fleets } = useAppContext();
  const { toast } = useToast();
  const mappingsQ = useQuery<OidcGroupMapping[]>({ queryKey: ["/api/oidc-group-mappings"] });
  const mappings = mappingsQ.data ?? [];

  const [newGroupName, setNewGroupName] = useState("");
  const [newFleetId, setNewFleetId] = useState<number | null>(null);
  const [newRoleId, setNewRoleId] = useState<number | null>(null);
  const newFleetRolesQ = useQuery<FleetRoleWithPermissions[]>({ queryKey: ["/api/fleet-roles", { fleetId: newFleetId }], enabled: !!newFleetId });

  const createMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/oidc-group-mappings", { groupName: newGroupName, fleetId: newFleetId, roleId: newRoleId })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oidc-group-mappings"] });
      setNewGroupName(""); setNewFleetId(null); setNewRoleId(null);
      toast({ title: "Group mapping added" });
    },
    onError: (e: any) => toast({ title: "Failed to add mapping", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<OidcGroupMapping> }) => (await apiRequest("PATCH", `/api/oidc-group-mappings/${id}`, patch)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/oidc-group-mappings"] }),
    onError: (e: any) => toast({ title: "Update failed", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/oidc-group-mappings/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oidc-group-mappings"] });
      toast({ title: "Group mapping removed" });
    },
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Network className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
        <div>
          <h3 className="font-semibold">Group mappings</h3>
          <p className="text-sm text-muted-foreground mt-1">Map an identity provider group to a fleet and role. Assigned automatically on OIDC login.</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>IdP Group</TableHead>
            <TableHead>Fleet</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map(mapping => (
            <GroupMappingRow
              key={mapping.id}
              mapping={mapping}
              fleets={fleets}
              onUpdate={patch => updateMut.mutate({ id: mapping.id, patch })}
              onDelete={() => deleteMut.mutate(mapping.id)}
              isDeleting={deleteMut.isPending}
            />
          ))}
        </TableBody>
      </Table>
      {mappings.length === 0 && (
        <p className="text-sm text-muted-foreground py-2" data-testid="text-no-group-mappings">
          No group mappings yet — add one to auto-assign fleet access from your identity provider.
        </p>
      )}

      <div className="rounded-md bg-muted p-4 space-y-3">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Add a mapping</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <Label>IdP Group</Label>
            <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="fleet-admins" data-testid="input-new-mapping-group" />
          </div>
          <div>
            <Label>Fleet</Label>
            <Select value={newFleetId ? String(newFleetId) : undefined} onValueChange={v => { setNewFleetId(Number(v)); setNewRoleId(null); }}>
              <SelectTrigger data-testid="select-new-mapping-fleet"><SelectValue placeholder="Choose fleet" /></SelectTrigger>
              <SelectContent>{fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Role</Label>
            <Select value={newRoleId ? String(newRoleId) : undefined} onValueChange={v => setNewRoleId(Number(v))} disabled={!newFleetId}>
              <SelectTrigger data-testid="select-new-mapping-role"><SelectValue placeholder="Choose role" /></SelectTrigger>
              <SelectContent>{(newFleetRolesQ.data ?? []).map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={!newGroupName || !newFleetId || !newRoleId || createMut.isPending} onClick={() => createMut.mutate()} data-testid="button-create-mapping">
            <Plus className="size-4 mr-1.5" /> Add
          </Button>
        </div>
      </div>
    </Card>
  );
}

function GroupMappingRow({ mapping, fleets, onUpdate, onDelete, isDeleting }: {
  mapping: OidcGroupMapping;
  fleets: Fleet[];
  onUpdate: (patch: Partial<OidcGroupMapping>) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const rolesQ = useQuery<FleetRoleWithPermissions[]>({ queryKey: ["/api/fleet-roles", { fleetId: mapping.fleetId }] });
  const roles = rolesQ.data ?? [];
  return (
    <TableRow data-testid={`row-group-mapping-${mapping.id}`}>
      <TableCell>
        <Input
          defaultValue={mapping.groupName}
          onBlur={e => e.target.value !== mapping.groupName && onUpdate({ groupName: e.target.value })}
          data-testid={`input-mapping-group-${mapping.id}`}
        />
      </TableCell>
      <TableCell>
        <Select value={String(mapping.fleetId)} onValueChange={v => onUpdate({ fleetId: Number(v) })}>
          <SelectTrigger data-testid={`select-mapping-fleet-${mapping.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>{fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select value={String(mapping.roleId)} onValueChange={v => onUpdate({ roleId: Number(v) })}>
          <SelectTrigger data-testid={`select-mapping-role-${mapping.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>{roles.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" disabled={isDeleting} onClick={onDelete} data-testid={`button-delete-mapping-${mapping.id}`}>
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UserRow({ user }: { user: User }) {
  const { fleets, memberships, canAdmin, systemAdmin } = useAppContext();
  const { toast } = useToast();
  const rolesQ = useQuery<FleetRoleWithPermissions[]>({ queryKey: ["/api/fleet-roles"] });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [convertDialog, setConvertDialog] = useState<"oidc" | "local" | null>(null);

  const setPassword = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/users/${user.id}/password`, { password: newPassword }),
    onSuccess: () => {
      setNewPassword("");
      setPasswordOpen(false);
      toast({ title: "Password updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const assign = useMutation({
    mutationFn: async ({ fleetId, roleId }: { fleetId: number; roleId: number }) => {
      const res = await apiRequest("POST", "/api/fleet-memberships", { fleetId, userId: user.id, roleId });
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
  const convertProvider = useMutation({
    mutationFn: async (target: "oidc" | "local") => (await apiRequest("POST", `/api/users/${user.id}/convert-to-${target}`)).json(),
    onSuccess: (_data, target) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setConvertDialog(null);
      toast({ title: target === "oidc" ? "Converted to OIDC" : "Converted to local" });
    },
    onError: (e: any) => toast({ title: "Conversion failed", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const setExempt = useMutation({
    mutationFn: async (exemptFromGlobalAuthMode: boolean) => (await apiRequest("PATCH", `/api/users/${user.id}/auth-settings`, { exemptFromGlobalAuthMode })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  return (
    <div className="p-3 rounded-md border border-border flex items-center justify-between gap-3 flex-wrap" data-testid={`row-user-${user.id}`}>
      <div>
        <div className="font-medium flex items-center gap-2">
          {user.displayName} <span className="text-xs text-muted-foreground">@{user.username}</span>
          <Badge variant="outline" className="text-[10px] tracking-wide" data-testid={`badge-auth-provider-${user.id}`}>
            {user.authProvider === "oidc" ? "SSO" : "Local"}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">{user.email ?? "no email"}</div>
        {systemAdmin && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
            <Checkbox
              checked={user.exemptFromGlobalAuthMode}
              onCheckedChange={checked => setExempt.mutate(checked === true)}
              data-testid={`checkbox-exempt-auth-mode-${user.id}`}
            />
            Exempt from global auth mode
          </label>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
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
                      <div className="text-xs text-muted-foreground">Current role: {fleetRoles.find(r => r.id === m?.roleId)?.name ?? "no access"}</div>
                    </div>
                    <Select
                      value={m ? String(m.roleId) : "none"}
                      onValueChange={(value) => value === "none" ? removeAccess.mutate({ fleetId: fleet.id, userId: user.id }) : assign.mutate({ fleetId: fleet.id, roleId: Number(value) })}
                      disabled={!canAdmin}
                    >
                      <SelectTrigger data-testid={`select-user-${user.id}-fleet-${fleet.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">no access</SelectItem>
                        {fleetRoles.map(role => <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
        {systemAdmin && (
          <>
            <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid={`button-set-password-${user.id}`}><KeyRound className="size-4 mr-1.5" /> Set Password</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Set Password for {user.displayName}</DialogTitle></DialogHeader>
                <div className="grid gap-3">
                  <div>
                    <Label>New Password</Label>
                    <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} data-testid={`input-new-password-${user.id}`} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="cancel" onClick={() => setPasswordOpen(false)} data-testid={`button-cancel-password-${user.id}`}>Cancel</Button>
                    <Button disabled={newPassword.length < 8 || setPassword.isPending} onClick={() => setPassword.mutate()} data-testid={`button-save-password-${user.id}`}>
                      {setPassword.isPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConvertDialog(user.authProvider === "oidc" ? "local" : "oidc")}
              data-testid={`button-convert-auth-${user.id}`}
            >
              <Link2 className="size-4 mr-1.5" /> {user.authProvider === "oidc" ? "Convert to Local" : "Convert to OIDC"}
            </Button>
            <AlertDialog open={convertDialog !== null} onOpenChange={(open) => !open && setConvertDialog(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Convert {user.displayName} to {convertDialog === "oidc" ? "OIDC" : "local"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {convertDialog === "oidc"
                      ? "This clears their local password. They'll only be able to sign in via your identity provider from now on. Misconfigured OIDC settings can lock this user out — verify the connection first."
                      : "This clears their SSO link and local password. They won't be able to sign in until an admin sets a new local password."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <Button variant="outline" onClick={() => setConvertDialog(null)} data-testid={`button-cancel-convert-${user.id}`}>Cancel</Button>
                  <Button
                    variant="destructive"
                    disabled={convertProvider.isPending}
                    onClick={() => convertDialog && convertProvider.mutate(convertDialog)}
                    data-testid={`button-confirm-convert-${user.id}`}
                  >
                    {convertProvider.isPending ? "Converting…" : "Convert"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
        <Button variant="destructive" size="sm" disabled={!canAdmin || deleteUser.isPending} onClick={() => deleteUser.mutate()} data-testid={`button-delete-user-${user.id}`}>
          <Trash2 className="size-4 mr-1.5" /> Delete
        </Button>
      </div>
    </div>
  );
}
