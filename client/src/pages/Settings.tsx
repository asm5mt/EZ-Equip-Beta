import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { EditablePageActions, DialogHeaderActions, useUnsavedChangeGuard } from "@/components/EditablePageActions";
import { DiagnosticsRegistration } from "@/lib/diagnostics-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppContext } from "@/lib/app-context";
import type { FleetRoleWithPermissions } from "@/lib/app-context";
import type { AppSetting, Fleet, User, SystemSettings, OidcGroupMapping, AuditLog, LookupProvider } from "@shared/schema";
import { formatRelativeTime } from "@/lib/format";
import type { PermissionCatalogEntry } from "@shared/permissions";
import {
  Moon, Ruler, Settings as SettingsIcon, Sun, Monitor, ShieldCheck, KeyRound,
  Save, Plus, Trash2, Lock, Globe, Link2, CheckCircle2, XCircle, Network, Pencil, Building2,
  Palette, Bug, History, ChevronDown, ChevronRight, ChevronLeft, MapPin, Map as MapIcon, Car,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { THEME_PACKS, findThemePack } from "@/lib/theme-packs";

type ThemeMode = "auto" | "dark" | "light";

export default function Settings() {
  const { users, canAdmin, systemAdmin } = useAppContext();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const rawTab = new URLSearchParams(search).get("tab") ?? "general";
  // The Audit Log and Privacy tabs reveal system-wide activity/config — if a
  // non-admin somehow lands on ?tab=audit or ?tab=privacy (stale link,
  // manual URL edit), fall back to General rather than rendering a
  // trigger/content that doesn't exist.
  const activeTab = (rawTab === "audit" || rawTab === "privacy") && !systemAdmin ? "general" : rawTab;
  const settingsQ = useQuery<AppSetting[]>({ queryKey: ["/api/app-settings"] });
  const orgInfoQ = useQuery<{ orgName: string | null; orgLogoUrl: string | null }>({ queryKey: ["/api/org-info"] });
  // Shares a queryKey with AuthenticationSection's own system-settings query
  // (same admin-only endpoint), so react-query dedupes the fetch/cache.
  const diagSettingsQ = useQuery<{
    diagnosticsOverlayEnabled: boolean;
    auditLogRetentionDays: number | null;
    zipLookupEnabled: boolean;
    geocodingEnabled: boolean;
    nhtsaLookupEnabled: boolean;
    zipLookupSelectedProviderId: number | null;
    geocodingSelectedProviderId: number | null;
    nhtsaLookupSelectedProviderId: number | null;
  }>({
    queryKey: ["/api/system-settings"],
    enabled: systemAdmin,
  });

  const persisted = useMemo(() => {
    const map = new Map((settingsQ.data ?? []).map(s => [s.key, s.value]));
    return {
      themeMode: ((map.get("themeMode") as ThemeMode) || "auto") as ThemeMode,
      themePack: map.get("themePack") || "ezequip",
      unitSystem: map.get("unitSystem") || "imperial",
      distanceUnit: map.get("distanceUnit") || "mi",
      volumeUnit: map.get("volumeUnit") || "qt",
      defaultMeter: map.get("defaultMeter") || "mileage",
      orgName: orgInfoQ.data?.orgName ?? "",
      orgLogoUrl: orgInfoQ.data?.orgLogoUrl ?? "",
      diagnosticsOverlayEnabled: diagSettingsQ.data?.diagnosticsOverlayEnabled ?? false,
      auditLogRetentionDays: diagSettingsQ.data?.auditLogRetentionDays ?? null,
      zipLookupEnabled: diagSettingsQ.data?.zipLookupEnabled ?? true,
      geocodingEnabled: diagSettingsQ.data?.geocodingEnabled ?? true,
      nhtsaLookupEnabled: diagSettingsQ.data?.nhtsaLookupEnabled ?? true,
      zipLookupSelectedProviderId: diagSettingsQ.data?.zipLookupSelectedProviderId ?? null,
      geocodingSelectedProviderId: diagSettingsQ.data?.geocodingSelectedProviderId ?? null,
      nhtsaLookupSelectedProviderId: diagSettingsQ.data?.nhtsaLookupSelectedProviderId ?? null,
    };
  }, [settingsQ.data, orgInfoQ.data, diagSettingsQ.data]);

  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
  const [themePack, setThemePack] = useState<string>("ezequip");
  const [unitSystem, setUnitSystem] = useState("imperial");
  const [distanceUnit, setDistanceUnit] = useState("mi");
  const [volumeUnit, setVolumeUnit] = useState("qt");
  const [defaultMeter, setDefaultMeter] = useState("mileage");
  const [orgName, setOrgName] = useState("");
  const [orgLogoUrl, setOrgLogoUrl] = useState("");
  const [diagnosticsOverlayEnabled, setDiagnosticsOverlayEnabled] = useState(false);
  // Raw text input — blank means "keep forever" (persisted as null).
  const [auditLogRetentionDaysInput, setAuditLogRetentionDaysInput] = useState("");

  const [zipLookupEnabled, setZipLookupEnabled] = useState(true);
  const [geocodingEnabled, setGeocodingEnabled] = useState(true);
  const [nhtsaLookupEnabled, setNhtsaLookupEnabled] = useState(true);
  const [zipLookupSelectedProviderId, setZipLookupSelectedProviderId] = useState<number | null>(null);
  const [geocodingSelectedProviderId, setGeocodingSelectedProviderId] = useState<number | null>(null);
  const [nhtsaLookupSelectedProviderId, setNhtsaLookupSelectedProviderId] = useState<number | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);

  useEffect(() => {
    setThemeMode(persisted.themeMode);
    setThemePack(persisted.themePack);
    setUnitSystem(persisted.unitSystem);
    setDistanceUnit(persisted.distanceUnit);
    setVolumeUnit(persisted.volumeUnit);
    setDefaultMeter(persisted.defaultMeter);
    setOrgName(persisted.orgName);
    setOrgLogoUrl(persisted.orgLogoUrl);
    setDiagnosticsOverlayEnabled(persisted.diagnosticsOverlayEnabled);
    setAuditLogRetentionDaysInput(persisted.auditLogRetentionDays != null ? String(persisted.auditLogRetentionDays) : "");
    setZipLookupEnabled(persisted.zipLookupEnabled);
    setGeocodingEnabled(persisted.geocodingEnabled);
    setNhtsaLookupEnabled(persisted.nhtsaLookupEnabled);
    setZipLookupSelectedProviderId(persisted.zipLookupSelectedProviderId);
    setGeocodingSelectedProviderId(persisted.geocodingSelectedProviderId);
    setNhtsaLookupSelectedProviderId(persisted.nhtsaLookupSelectedProviderId);
  }, [persisted]);

  const auditLogRetentionDays = auditLogRetentionDaysInput.trim() === "" ? null : Number(auditLogRetentionDaysInput);

  const draft = {
    themeMode, themePack, unitSystem, distanceUnit, volumeUnit, defaultMeter, orgName, orgLogoUrl,
    diagnosticsOverlayEnabled, auditLogRetentionDays,
    zipLookupEnabled, geocodingEnabled, nhtsaLookupEnabled,
    zipLookupSelectedProviderId, geocodingSelectedProviderId, nhtsaLookupSelectedProviderId,
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(persisted);

  const previewTheme = (value: ThemeMode) => {
    setThemeMode(value);
    window.dispatchEvent(new CustomEvent("ez-equip-theme", { detail: value }));
  };

  const previewThemePack = (value: string) => {
    setThemePack(value);
    window.dispatchEvent(new CustomEvent("ez-equip-theme-pack", { detail: value }));
  };

  const saveSettings = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/app-settings", { themeMode, themePack, unitSystem, distanceUnit, volumeUnit, defaultMeter });
      await apiRequest("PATCH", "/api/system-settings", {
        orgName: orgName.trim(),
        orgLogoUrl: orgLogoUrl.trim(),
        ...(systemAdmin ? {
          diagnosticsOverlayEnabled, auditLogRetentionDays, zipLookupEnabled, geocodingEnabled, nhtsaLookupEnabled,
          zipLookupSelectedProviderId, geocodingSelectedProviderId, nhtsaLookupSelectedProviderId,
        } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/org-info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lookup-settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const cancelDraft = () => {
    setThemeMode(persisted.themeMode);
    setThemePack(persisted.themePack);
    setUnitSystem(persisted.unitSystem);
    setDistanceUnit(persisted.distanceUnit);
    setVolumeUnit(persisted.volumeUnit);
    setDefaultMeter(persisted.defaultMeter);
    setOrgName(persisted.orgName);
    setOrgLogoUrl(persisted.orgLogoUrl);
    setDiagnosticsOverlayEnabled(persisted.diagnosticsOverlayEnabled);
    setAuditLogRetentionDaysInput(persisted.auditLogRetentionDays != null ? String(persisted.auditLogRetentionDays) : "");
    setZipLookupEnabled(persisted.zipLookupEnabled);
    setGeocodingEnabled(persisted.geocodingEnabled);
    setNhtsaLookupEnabled(persisted.nhtsaLookupEnabled);
    setZipLookupSelectedProviderId(persisted.zipLookupSelectedProviderId);
    setGeocodingSelectedProviderId(persisted.geocodingSelectedProviderId);
    setNhtsaLookupSelectedProviderId(persisted.nhtsaLookupSelectedProviderId);
    window.dispatchEvent(new CustomEvent("ez-equip-theme", { detail: persisted.themeMode }));
    window.dispatchEvent(new CustomEvent("ez-equip-theme-pack", { detail: persisted.themePack }));
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


  return (
    <AppShell title="Settings" subtitle="Theme, units, fleets, local users, and access control">
      <div className="space-y-6 max-w-6xl">
        <EditablePageActions
          hasChanges={dirty}
          isSaving={saveSettings.isPending}
          canSave={dirty}
          onBack={() => navigate("/")}
          onCancel={cancelDraft}
          onSave={() => saveSettings.mutate()}
          description={dirty ? "You have unsaved settings changes" : undefined}
        />

        <Tabs value={activeTab} onValueChange={(v) => navigate(`/settings?tab=${v}`)} className="w-full">
          <TabsList className={`grid w-full grid-cols-2 ${systemAdmin ? "sm:grid-cols-6" : "sm:grid-cols-4"} h-auto`} data-testid="tabs-settings">
            <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="roles" data-testid="tab-roles">Roles & Permissions</TabsTrigger>
            <TabsTrigger value="auth" data-testid="tab-auth">Authentication</TabsTrigger>
            {systemAdmin && <TabsTrigger value="audit" data-testid="tab-audit">Audit Log</TabsTrigger>}
            {systemAdmin && <TabsTrigger value="privacy" data-testid="tab-privacy">Privacy</TabsTrigger>}
          </TabsList>

          <TabsContent value="general" className="mt-5 space-y-5">
            <Card className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <Building2 className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
                <div>
                  <h3 className="font-semibold">Organization</h3>
                  <p className="text-sm text-muted-foreground mt-1">Optional — identifies which organization this instance belongs to, shown in the About dialog.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Organization Name</Label>
                  <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Your Organization" data-testid="input-org-name" />
                </div>
                <div>
                  <Label>Logo URL</Label>
                  <Input value={orgLogoUrl} onChange={e => setOrgLogoUrl(e.target.value)} placeholder="https://…" data-testid="input-org-logo-url" />
                </div>
              </div>
            </Card>

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

                <div className="pt-4 border-t border-border space-y-4">
                  <div className="flex items-start gap-3">
                    <Palette className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
                    <div>
                      <h3 className="font-semibold">Theme Pack</h3>
                      <p className="text-sm text-muted-foreground mt-1">A color palette, independent of Auto/Light/Dark mode.</p>
                    </div>
                  </div>
                  <Select value={themePack} onValueChange={previewThemePack}>
                    <SelectTrigger data-testid="select-theme-pack"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {THEME_PACKS.map(pack => (
                        <SelectItem key={pack.id} value={pack.id}>{pack.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {(() => {
                    const pack = findThemePack(themePack);
                    return (
                      <div className="mt-3 flex items-start gap-3" data-testid={`preview-theme-pack-${pack.id}`}>
                        <span className="flex shrink-0 gap-1">
                          <span className="relative flex size-7 items-center justify-center rounded-md border border-border/60" style={{ backgroundColor: pack.swatch.light.background }}>
                            <span className="size-3 rounded-full border border-black/10" style={{ backgroundColor: pack.swatch.light.primary }} />
                          </span>
                          <span className="relative flex size-7 items-center justify-center rounded-md border border-border/60" style={{ backgroundColor: pack.swatch.dark.background }}>
                            <span className="size-3 rounded-full border border-white/10" style={{ backgroundColor: pack.swatch.dark.primary }} />
                          </span>
                        </span>
                        <p className="text-xs text-muted-foreground">{pack.description}</p>
                      </div>
                    );
                  })()}
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

            {systemAdmin && (
              <Card className="p-5 space-y-4" data-testid="card-diagnostics-overlay">
                <div className="flex items-start gap-3">
                  <Bug className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
                  <div>
                    <h3 className="font-semibold">Diagnostics overlay</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Lets system admins toggle a troubleshooting panel with Ctrl+Shift+D (Cmd+Shift+D on Mac), showing
                      the current route, page, and any open modal(s). Off by default.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-3">
                  <Switch
                    checked={diagnosticsOverlayEnabled}
                    onCheckedChange={setDiagnosticsOverlayEnabled}
                    data-testid="switch-diagnostics-overlay-enabled"
                  />
                  <span className="text-sm">{diagnosticsOverlayEnabled ? "Enabled" : "Disabled"}</span>
                </label>
              </Card>
            )}

            {systemAdmin && (
              <Card className="p-5 space-y-4" data-testid="card-audit-log-retention">
                <div className="flex items-start gap-3">
                  <History className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
                  <div>
                    <h3 className="font-semibold">Audit log retention</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      How long audit log entries are kept before automatic cleanup. Leave blank to keep forever.
                    </p>
                  </div>
                </div>
                <div className="max-w-xs">
                  <Label>Retention (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={auditLogRetentionDaysInput}
                    onChange={e => setAuditLogRetentionDaysInput(e.target.value)}
                    placeholder="Keep forever"
                    data-testid="input-audit-log-retention-days"
                  />
                </div>
              </Card>
            )}
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
              <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2" data-testid="list-users">
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

          {systemAdmin && (
            <TabsContent value="audit" className="mt-5">
              <AuditLogSection />
            </TabsContent>
          )}

          {systemAdmin && (
            <TabsContent value="privacy" className="mt-5 space-y-5">
              <LookupProviderCard
                icon={Car}
                title="NHTSA Vehicle Lookups"
                description="Used to decode VINs and check for safety recalls."
                testIdPrefix="nhtsa-lookup"
                category="nhtsa"
                enabled={nhtsaLookupEnabled}
                onEnabledChange={setNhtsaLookupEnabled}
                selectedProviderId={nhtsaLookupSelectedProviderId}
                onSelectedProviderIdChange={setNhtsaLookupSelectedProviderId}
              />
              <LookupProviderCard
                icon={MapPin}
                title="ZIP Lookup"
                description="Used to auto-fill city/state when entering a postal code on address fields."
                testIdPrefix="zip-lookup"
                category="zip"
                enabled={zipLookupEnabled}
                onEnabledChange={setZipLookupEnabled}
                selectedProviderId={zipLookupSelectedProviderId}
                onSelectedProviderIdChange={setZipLookupSelectedProviderId}
              />
              <LookupProviderCard
                icon={MapIcon}
                title="Geocoding"
                description="Used to convert fleet and service facility addresses into map coordinates."
                testIdPrefix="geocoding"
                category="geocoding"
                enabled={geocodingEnabled}
                onEnabledChange={setGeocodingEnabled}
                selectedProviderId={geocodingSelectedProviderId}
                onSelectedProviderIdChange={setGeocodingSelectedProviderId}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Privacy & Lookups: per-category provider selection + custom provider CRUD
// ---------------------------------------------------------------------------

type LookupCategory = "zip" | "geocoding" | "nhtsa";
type LookupProviderResponse = Omit<LookupProvider, "authValue" | "oauthClientSecret"> & {
  authValueSet: boolean;
  oauthClientSecretSet: boolean;
};

const BUILT_IN_VENDOR_LABEL: Record<LookupCategory, string> = {
  zip: "Built-in (Zippopotam.us)",
  geocoding: "Built-in (OpenStreetMap Nominatim)",
  nhtsa: "Built-in (NHTSA)",
};

const SELECT_BUILT_IN = "__builtin__";
const SELECT_ADD_NEW = "__add_new__";

// One card per Privacy & Lookups category (ZIP Lookup / Geocoding / NHTSA):
// the on/off switch, the "currently active provider" selector (Built-in or
// one of this category's saved custom providers), and inline edit/delete
// for each saved provider.
function LookupProviderCard({
  icon: Icon, title, description, testIdPrefix, category,
  enabled, onEnabledChange, selectedProviderId, onSelectedProviderIdChange,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  testIdPrefix: string;
  category: LookupCategory;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  selectedProviderId: number | null;
  onSelectedProviderIdChange: (id: number | null) => void;
}) {
  const { toast } = useToast();
  const providersQ = useQuery<LookupProviderResponse[]>({
    queryKey: ["/api/lookup-providers", { category }],
  });
  const providers = providersQ.data ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<LookupProviderResponse | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<LookupProviderResponse | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/lookup-providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lookup-providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      setDeleteProvider(null);
      toast({ title: "Provider deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const selectValue = selectedProviderId != null && providers.some(p => p.id === selectedProviderId)
    ? String(selectedProviderId)
    : SELECT_BUILT_IN;

  const handleSelectChange = (v: string) => {
    if (v === SELECT_ADD_NEW) { setAddOpen(true); return; }
    onSelectedProviderIdChange(v === SELECT_BUILT_IN ? null : Number(v));
  };

  return (
    <Card className="p-5 space-y-4" data-testid={`card-${testIdPrefix}`}>
      <div className="flex items-start gap-3">
        <Icon className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
      <label className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={onEnabledChange} data-testid={`switch-${testIdPrefix}-enabled`} />
        <span className="text-sm">{enabled ? "Enabled" : "Disabled"}</span>
      </label>

      <div className="space-y-2">
        <Label>Active provider</Label>
        <Select value={selectValue} onValueChange={handleSelectChange}>
          <SelectTrigger data-testid={`select-${testIdPrefix}-provider`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_BUILT_IN}>{BUILT_IN_VENDOR_LABEL[category]}</SelectItem>
            {providers.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            <SelectItem value={SELECT_ADD_NEW}>+ Add new provider…</SelectItem>
          </SelectContent>
        </Select>

        {providers.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {providers.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                data-testid={`row-provider-${p.id}`}
              >
                <span className="text-sm truncate">{p.name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditProvider(p)} aria-label={`Edit ${p.name}`} data-testid={`button-edit-provider-${p.id}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteProvider(p)}
                    aria-label={`Delete ${p.name}`}
                    data-testid={`button-delete-provider-${p.id}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProviderFormDialog
        open={addOpen || !!editProvider}
        onOpenChange={(next) => { if (!next) { setAddOpen(false); setEditProvider(null); } }}
        category={category}
        provider={editProvider}
      />

      <AlertDialog open={!!deleteProvider} onOpenChange={(open) => { if (!open) setDeleteProvider(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteProvider?.name ? `"${deleteProvider.name}"` : "This provider"} will be removed. If it's currently the active provider for this category, it falls back to {BUILT_IN_VENDOR_LABEL[category]}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-provider">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProvider && deleteMut.mutate(deleteProvider.id)}
              data-testid="button-confirm-delete-provider"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type ProviderPresetKey = "nominatim" | "google" | "here" | "usps_v3" | "custom";

interface ProviderPresetDefaults {
  requestUrlTemplate?: string;
  latPath?: string;
  lonPath?: string;
  cityPath?: string;
  statePath?: string;
  authMethod?: "none" | "query" | "header" | "oauth2_client_credentials";
}

// Client-side convenience only — pre-fills sensible starting values for a
// vendor's response shape when the admin picks a preset. Not stored as
// schema defaults; the admin can edit any field afterward.
function presetDefaults(category: "zip" | "geocoding", preset: ProviderPresetKey, baseUrl: string): ProviderPresetDefaults {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (category === "geocoding") {
    switch (preset) {
      case "nominatim":
        return { requestUrlTemplate: `${base}/search?format=json&limit=1&q={query}`, latPath: "[0].lat", lonPath: "[0].lon" };
      case "google":
        return { requestUrlTemplate: `${base}/geocode/json?address={query}`, latPath: "results[0].geometry.location.lat", lonPath: "results[0].geometry.location.lng" };
      case "here":
        return { latPath: "items[0].position.lat", lonPath: "items[0].position.lng" };
      default:
        return {};
    }
  }
  switch (preset) {
    case "nominatim":
      return { cityPath: "places[0].place name", statePath: "places[0].state abbreviation" };
    case "usps_v3":
      return { requestUrlTemplate: `${base}/addresses/v3/city-state?ZIPCode={zip}`, cityPath: "city", statePath: "state", authMethod: "oauth2_client_credentials" };
    default:
      return {};
  }
}

// Shared Add/Edit modal for a category's custom lookup providers. `provider`
// null means Add mode; non-null means Edit mode, prefilled from that row
// (secrets show as masked "configured" placeholders — blank means unchanged).
function ProviderFormDialog({ open, onOpenChange, category, provider }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: LookupCategory;
  provider: LookupProviderResponse | null;
}) {
  const { toast } = useToast();
  const isEdit = !!provider;

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [preset, setPreset] = useState<ProviderPresetKey>("custom");
  const [requestUrlTemplate, setRequestUrlTemplate] = useState("");
  const [coordMode, setCoordMode] = useState<"latlon" | "array">("latlon");
  const [latPath, setLatPath] = useState("");
  const [lonPath, setLonPath] = useState("");
  const [coordinatesArrayPath, setCoordinatesArrayPath] = useState("");
  const [coordinatesReversed, setCoordinatesReversed] = useState(false);
  const [cityPath, setCityPath] = useState("");
  const [statePath, setStatePath] = useState("");
  const [authMethod, setAuthMethod] = useState<"none" | "query" | "header" | "oauth2_client_credentials">("none");
  const [authParamName, setAuthParamName] = useState("");
  const [authValue, setAuthValue] = useState("");
  const [bearerPrefix, setBearerPrefix] = useState(false);
  const [oauthTokenUrl, setOauthTokenUrl] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthScope, setOauthScope] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(provider?.name ?? "");
    setBaseUrl(provider?.baseUrl ?? "");
    setPreset((provider?.responseShapePreset as ProviderPresetKey) ?? "custom");
    setRequestUrlTemplate(provider?.requestUrlTemplate ?? "");
    setCoordMode(provider?.coordinatesArrayPath ? "array" : "latlon");
    setLatPath(provider?.latPath ?? "");
    setLonPath(provider?.lonPath ?? "");
    setCoordinatesArrayPath(provider?.coordinatesArrayPath ?? "");
    setCoordinatesReversed(provider?.coordinatesReversed ?? false);
    setCityPath(provider?.cityPath ?? "");
    setStatePath(provider?.statePath ?? "");
    setAuthMethod((provider?.authMethod as any) ?? "none");
    setAuthParamName(provider?.authParamName ?? "");
    setAuthValue("");
    setBearerPrefix(provider?.bearerPrefix ?? false);
    setOauthTokenUrl(provider?.oauthTokenUrl ?? "");
    setOauthClientId(provider?.oauthClientId ?? "");
    setOauthClientSecret("");
    setOauthScope(provider?.oauthScope ?? "");
  }, [open, provider]);

  const initial = useMemo(() => ({
    name: provider?.name ?? "",
    baseUrl: provider?.baseUrl ?? "",
    preset: (provider?.responseShapePreset as ProviderPresetKey) ?? "custom",
    requestUrlTemplate: provider?.requestUrlTemplate ?? "",
    coordMode: (provider?.coordinatesArrayPath ? "array" : "latlon") as "latlon" | "array",
    latPath: provider?.latPath ?? "",
    lonPath: provider?.lonPath ?? "",
    coordinatesArrayPath: provider?.coordinatesArrayPath ?? "",
    coordinatesReversed: provider?.coordinatesReversed ?? false,
    cityPath: provider?.cityPath ?? "",
    statePath: provider?.statePath ?? "",
    authMethod: provider?.authMethod ?? "none",
    authParamName: provider?.authParamName ?? "",
    bearerPrefix: provider?.bearerPrefix ?? false,
    oauthTokenUrl: provider?.oauthTokenUrl ?? "",
    oauthClientId: provider?.oauthClientId ?? "",
    oauthScope: provider?.oauthScope ?? "",
  }), [provider]);

  const hasChanges = isEdit
    ? name !== initial.name || baseUrl !== initial.baseUrl || preset !== initial.preset
      || requestUrlTemplate !== initial.requestUrlTemplate || coordMode !== initial.coordMode
      || latPath !== initial.latPath || lonPath !== initial.lonPath
      || coordinatesArrayPath !== initial.coordinatesArrayPath || coordinatesReversed !== initial.coordinatesReversed
      || cityPath !== initial.cityPath || statePath !== initial.statePath
      || authMethod !== initial.authMethod || authParamName !== initial.authParamName
      || bearerPrefix !== initial.bearerPrefix || oauthTokenUrl !== initial.oauthTokenUrl
      || oauthClientId !== initial.oauthClientId || oauthScope !== initial.oauthScope
      || authValue.length > 0 || oauthClientSecret.length > 0
    : Boolean(name.trim() || baseUrl.trim());

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        category,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        requestUrlTemplate: category !== "nhtsa" && requestUrlTemplate.trim() ? requestUrlTemplate.trim() : null,
        responseShapePreset: category !== "nhtsa" ? preset : null,
        authMethod,
        authParamName: authMethod === "query" || authMethod === "header" ? authParamName.trim() || null : null,
        bearerPrefix: authMethod === "header" ? bearerPrefix : false,
        oauthTokenUrl: authMethod === "oauth2_client_credentials" ? oauthTokenUrl.trim() || null : null,
        oauthClientId: authMethod === "oauth2_client_credentials" ? oauthClientId.trim() || null : null,
        oauthScope: authMethod === "oauth2_client_credentials" ? oauthScope.trim() || null : null,
        latPath: category === "geocoding" && coordMode === "latlon" ? latPath.trim() || null : null,
        lonPath: category === "geocoding" && coordMode === "latlon" ? lonPath.trim() || null : null,
        coordinatesArrayPath: category === "geocoding" && coordMode === "array" ? coordinatesArrayPath.trim() || null : null,
        coordinatesReversed: category === "geocoding" && coordMode === "array" ? coordinatesReversed : false,
        cityPath: category === "zip" ? cityPath.trim() || null : null,
        statePath: category === "zip" ? statePath.trim() || null : null,
        ...(authValue ? { authValue } : {}),
        ...(oauthClientSecret ? { oauthClientSecret } : {}),
      };
      if (isEdit) await apiRequest("PATCH", `/api/lookup-providers/${provider!.id}`, payload);
      else await apiRequest("POST", "/api/lookup-providers", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lookup-providers"] });
      toast({ title: isEdit ? "Provider updated" : "Provider added" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const { confirmOrRun, dialog: unsavedDialog } = useUnsavedChangeGuard({ hasChanges, onSave: () => saveMut.mutate() });
  const handleOpenChange = (next: boolean) => {
    if (!next) confirmOrRun(() => onOpenChange(false));
    else onOpenChange(next);
  };

  const handlePresetChange = (value: ProviderPresetKey) => {
    setPreset(value);
    if (value === "custom") return;
    const defaults = presetDefaults(category as "zip" | "geocoding", value, baseUrl);
    if (defaults.requestUrlTemplate !== undefined) setRequestUrlTemplate(defaults.requestUrlTemplate);
    if (defaults.latPath !== undefined) { setLatPath(defaults.latPath); setCoordMode("latlon"); }
    if (defaults.lonPath !== undefined) setLonPath(defaults.lonPath);
    if (defaults.cityPath !== undefined) setCityPath(defaults.cityPath);
    if (defaults.statePath !== undefined) setStatePath(defaults.statePath);
    if (defaults.authMethod !== undefined) setAuthMethod(defaults.authMethod);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideCloseButton className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>{isEdit ? `Edit ${provider?.name}` : "Add Provider"}</DialogTitle>
          <DialogHeaderActions
            onCancel={() => handleOpenChange(false)}
            onSave={() => saveMut.mutate()}
            canSave={!!name.trim() && !!baseUrl.trim() && !saveMut.isPending}
            isSaving={saveMut.isPending}
            hasChanges={hasChanges}
          />
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} data-testid="input-provider-name" /></div>
            <div><Label>Base URL</Label><Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.example.com" data-testid="input-provider-base-url" /></div>
          </div>

          {category !== "nhtsa" && (
            <div>
              <Label>Response shape preset</Label>
              <Select value={preset} onValueChange={(v) => handlePresetChange(v as ProviderPresetKey)}>
                <SelectTrigger data-testid="select-provider-preset"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nominatim">Nominatim / LocationIQ-style</SelectItem>
                  <SelectItem value="google">Google-style</SelectItem>
                  <SelectItem value="here">HERE-style</SelectItem>
                  {category === "zip" && <SelectItem value="usps_v3">USPS v3-style</SelectItem>}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {category !== "nhtsa" && (
            <div>
              <Label>Request URL template</Label>
              <Input
                value={requestUrlTemplate}
                onChange={e => setRequestUrlTemplate(e.target.value)}
                placeholder="https://api.example.com/search?q={query}"
                data-testid="input-provider-url-template"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {category === "geocoding" ? "Use {query} as a placeholder for the search text." : "Use {country} and {zip} as placeholders."}
              </p>
            </div>
          )}

          {category === "geocoding" && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label>Coordinates</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant={coordMode === "latlon" ? "default" : "outline"} onClick={() => setCoordMode("latlon")} data-testid="button-coord-mode-latlon">
                  Separate lat/lon
                </Button>
                <Button type="button" size="sm" variant={coordMode === "array" ? "default" : "outline"} onClick={() => setCoordMode("array")} data-testid="button-coord-mode-array">
                  Combined array
                </Button>
              </div>
              {coordMode === "latlon" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Latitude path</Label><Input value={latPath} onChange={e => setLatPath(e.target.value)} data-testid="input-provider-lat-path" /></div>
                  <div><Label>Longitude path</Label><Input value={lonPath} onChange={e => setLonPath(e.target.value)} data-testid="input-provider-lon-path" /></div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div><Label>Coordinate array path</Label><Input value={coordinatesArrayPath} onChange={e => setCoordinatesArrayPath(e.target.value)} data-testid="input-provider-coords-path" /></div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={coordinatesReversed} onCheckedChange={(v) => setCoordinatesReversed(!!v)} data-testid="checkbox-coords-reversed" />
                    Coordinates are [lat, lon], not [lon, lat]
                  </label>
                </div>
              )}
            </div>
          )}

          {category === "zip" && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label>City path</Label><Input value={cityPath} onChange={e => setCityPath(e.target.value)} data-testid="input-provider-city-path" /></div>
              <div><Label>State path</Label><Input value={statePath} onChange={e => setStatePath(e.target.value)} data-testid="input-provider-state-path" /></div>
            </div>
          )}

          <div>
            <Label>Auth method</Label>
            <Select value={authMethod} onValueChange={(v: any) => setAuthMethod(v)}>
              <SelectTrigger data-testid="select-provider-auth-method"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="query">API key in query parameter</SelectItem>
                <SelectItem value="header">API key in header</SelectItem>
                <SelectItem value="oauth2_client_credentials">OAuth 2.0 Client Credentials</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(authMethod === "query" || authMethod === "header") && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{authMethod === "query" ? "Query parameter name" : "Header name"}</Label>
                <Input
                  value={authParamName}
                  onChange={e => setAuthParamName(e.target.value)}
                  placeholder={authMethod === "query" ? "api_key" : "X-Api-Key"}
                  data-testid="input-provider-auth-param-name"
                />
              </div>
              <div>
                <Label>{authMethod === "query" ? "API key" : "Key value"}</Label>
                <Input
                  type="password"
                  value={authValue}
                  onChange={e => setAuthValue(e.target.value)}
                  placeholder={provider?.authValueSet ? "•••• configured" : "Not set"}
                  data-testid="input-provider-auth-value"
                />
              </div>
              {authMethod === "header" && (
                <label className="flex items-center gap-2 text-sm col-span-2">
                  <Checkbox checked={bearerPrefix} onCheckedChange={(v) => setBearerPrefix(!!v)} data-testid="checkbox-provider-bearer-prefix" />
                  Prefix with "Bearer "
                </label>
              )}
            </div>
          )}

          {authMethod === "oauth2_client_credentials" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><Label>Token URL</Label><Input value={oauthTokenUrl} onChange={e => setOauthTokenUrl(e.target.value)} data-testid="input-provider-oauth-token-url" /></div>
              <div><Label>Client ID</Label><Input value={oauthClientId} onChange={e => setOauthClientId(e.target.value)} data-testid="input-provider-oauth-client-id" /></div>
              <div>
                <Label>Client secret</Label>
                <Input
                  type="password"
                  value={oauthClientSecret}
                  onChange={e => setOauthClientSecret(e.target.value)}
                  placeholder={provider?.oauthClientSecretSet ? "•••• configured" : "Not set"}
                  data-testid="input-provider-oauth-client-secret"
                />
              </div>
              <div className="col-span-2"><Label>Scope (optional)</Label><Input value={oauthScope} onChange={e => setOauthScope(e.target.value)} data-testid="input-provider-oauth-scope" /></div>
            </div>
          )}
        </div>
        {unsavedDialog}
      </DialogContent>
    </Dialog>
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
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [pendingDeleteRoleId, setPendingDeleteRoleId] = useState<number | null>(null);

  const rolesQ = useQuery<FleetRoleWithPermissions[]>({ queryKey: ["/api/fleet-roles", { fleetId }], enabled: !!fleetId });
  const permissionsQ = useQuery<PermissionCatalogEntry[]>({ queryKey: ["/api/permissions"] });
  const permissionCatalog = permissionsQ.data ?? [];
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [name, setName] = useState("");
  const [newPermissions, setNewPermissions] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const createRole = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/fleet-roles", { fleetId, name: name.toLowerCase(), permissions: newPermissions, description: description || null, builtIn: false })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] });
      setName(""); setNewPermissions([]); setDescription("");
      setAddRoleOpen(false);
      toast({ title: "Fleet role added" });
    },
  });

  const addRoleHasChanges = Boolean(name.trim() || description.trim() || newPermissions.length > 0);
  const resetAddRoleDraft = () => {
    setName(""); setNewPermissions([]); setDescription("");
  };
  const { confirmOrRun: confirmAddRoleClose, dialog: addRoleUnsavedDialog } = useUnsavedChangeGuard({
    hasChanges: addRoleHasChanges,
    onSave: () => createRole.mutate(),
  });
  const handleAddRoleOpenChange = (next: boolean) => {
    if (!next) confirmAddRoleClose(() => { resetAddRoleDraft(); setAddRoleOpen(false); });
    else setAddRoleOpen(next);
  };

  const updateRole = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<FleetRoleWithPermissions> }) => (await apiRequest("PATCH", `/api/fleet-roles/${id}`, patch)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] }),
    onError: (e: any) => toast({ title: "Update failed", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const deleteRole = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/fleet-roles/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] });
      setEditingRoleId(null);
      setPendingDeleteRoleId(null);
      toast({ title: "Fleet role deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const roles = rolesQ.data ?? [];
  const editingRole = roles.find(r => r.id === editingRoleId) ?? null;
  const pendingDeleteRole = roles.find(r => r.id === pendingDeleteRoleId) ?? null;

  // Buffered edit-modal draft: name/description/permissions only apply on
  // "Save Changes". Re-initialized only when the *target role* changes, not
  // on every background refetch, so in-progress edits survive.
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (editingRoleId == null) return;
    const role = roles.find(r => r.id === editingRoleId);
    if (!role) return;
    setDraftName(role.name);
    setDraftDescription(role.description ?? "");
    setDraftPermissions(role.permissions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRoleId]);

  const roleDirty = !!editingRole && (
    draftName !== editingRole.name
    || draftDescription !== (editingRole.description ?? "")
    || JSON.stringify([...draftPermissions].sort()) !== JSON.stringify([...editingRole.permissions].sort())
  );

  const saveRole = useMutation({
    mutationFn: async () => {
      if (!editingRole) return;
      await apiRequest("PATCH", `/api/fleet-roles/${editingRole.id}`, {
        name: draftName.toLowerCase(),
        description: draftDescription || null,
        permissions: draftPermissions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-roles"] });
      toast({ title: "Role updated" });
      setEditingRoleId(null);
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const { confirmOrRun: confirmRoleClose, dialog: roleUnsavedDialog } = useUnsavedChangeGuard({
    hasChanges: roleDirty,
    onSave: () => saveRole.mutate(),
  });
  const handleEditRoleOpenChange = (next: boolean) => {
    if (!next) confirmRoleClose(() => {
      if (editingRole) {
        setDraftName(editingRole.name);
        setDraftDescription(editingRole.description ?? "");
        setDraftPermissions(editingRole.permissions);
      }
      setEditingRoleId(null);
    });
  };

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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold">Roles</h3>
            <div className="flex items-center gap-2">
              {addRoleOpen && (
                <DiagnosticsRegistration name="Add Role" context={{ fleetId: selectedFleet.id, hasChanges: addRoleHasChanges }} />
              )}
              <Dialog open={addRoleOpen} onOpenChange={handleAddRoleOpenChange}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={!canAdmin} data-testid="button-add-fleet-role"><Plus className="size-4 mr-1.5" /> Add Role</Button>
                </DialogTrigger>
                <DialogContent hideCloseButton className="max-w-lg">
                  <DialogHeader className="flex-row items-center justify-between space-y-0">
                    <DialogTitle>Add Role</DialogTitle>
                    <DialogHeaderActions
                      onCancel={() => handleAddRoleOpenChange(false)}
                      onSave={() => createRole.mutate()}
                      canSave={!!canAdmin && !!name && !createRole.isPending}
                      isSaving={createRole.isPending}
                      hasChanges={addRoleHasChanges}
                    />
                  </DialogHeader>
                  <div className="grid gap-3">
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
                  </div>
                  {addRoleUnsavedDialog}
                </DialogContent>
              </Dialog>
              <span className="text-xs text-muted-foreground">{roles.length} total</span>
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto pr-1 space-y-2" data-testid="list-fleet-roles">
            {roles.map(role => (
              <div
                key={role.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md border border-border hover-elevate"
                onDoubleClick={() => setEditingRoleId(role.id)}
                data-testid={`row-fleet-role-${role.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate max-w-full">{role.name}</span>
                    {role.builtIn && <Badge variant="outline" className="text-[10px] tracking-wide shrink-0">Built-in</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{role.description || "No description"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="text-[10px] tracking-wide shrink-0">{role.permissions.length} permissions</Badge>
                  <Button variant="ghost" size="icon" onClick={() => setEditingRoleId(role.id)} data-testid={`button-edit-fleet-role-${role.id}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    disabled={!canAdmin || role.builtIn || deleteRole.isPending}
                    onClick={() => setPendingDeleteRoleId(role.id)}
                    data-testid={`button-delete-fleet-role-${role.id}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {roles.length === 0 && <p className="text-sm text-muted-foreground">No roles yet for this fleet.</p>}
          </div>
        </Card>
      )}

      <Dialog open={editingRole != null} onOpenChange={handleEditRoleOpenChange}>
        <DialogContent hideCloseButton className="max-w-2xl">
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle>Edit Role</DialogTitle>
            <DialogHeaderActions
              onCancel={() => handleEditRoleOpenChange(false)}
              onSave={() => saveRole.mutate()}
              canSave={!!canAdmin && roleDirty}
              isSaving={saveRole.isPending}
              hasChanges={roleDirty}
            />
          </DialogHeader>
          {editingRole && (
            <div className="space-y-4">

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={draftName}
                      disabled={!canAdmin || editingRole.builtIn}
                      onChange={e => setDraftName(e.target.value.toLowerCase())}
                      data-testid={`input-fleet-role-name-${editingRole.id}`}
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      value={draftDescription}
                      disabled={!canAdmin}
                      onChange={e => setDraftDescription(e.target.value)}
                      data-testid={`input-fleet-role-description-${editingRole.id}`}
                    />
                  </div>
                </div>
                {editingRole.builtIn && <Badge variant="outline" className="text-[10px] tracking-wide">Built-in</Badge>}
                <PermissionCheckboxes
                  permissions={permissionCatalog}
                  selected={draftPermissions}
                  disabled={!canAdmin}
                  idPrefix={`role-${editingRole.id}`}
                  onToggle={(key, checked) => {
                    setDraftPermissions(prev => checked ? [...prev, key] : prev.filter(p => p !== key));
                  }}
                />
                <div className="flex justify-end pt-2 border-t border-border">
                  <Button
                    variant="destructive"
                    disabled={!canAdmin || editingRole.builtIn || deleteRole.isPending}
                    onClick={() => setPendingDeleteRoleId(editingRole.id)}
                    data-testid={`button-delete-fleet-role-modal-${editingRole.id}`}
                  >
                    <Trash2 className="size-4 mr-1.5" /> Delete Role
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {roleUnsavedDialog}

      <AlertDialog open={pendingDeleteRole != null} onOpenChange={open => !open && setPendingDeleteRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDeleteRole?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the role from this fleet. Any users currently assigned to it will lose the access it granted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteRoleId(null)} data-testid="button-cancel-delete-fleet-role">Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteRole.isPending}
              onClick={() => pendingDeleteRoleId != null && deleteRole.mutate(pendingDeleteRoleId)}
              data-testid="button-confirm-delete-fleet-role"
            >
              {deleteRole.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

type DraftGroupMapping = OidcGroupMapping & { isNew?: boolean };

function GroupMappingsCard() {
  const { fleets } = useAppContext();
  const { toast } = useToast();
  const mappingsQ = useQuery<OidcGroupMapping[]>({ queryKey: ["/api/oidc-group-mappings"] });
  const mappings = mappingsQ.data ?? [];

  const [draftMappings, setDraftMappings] = useState<DraftGroupMapping[]>(mappings);
  useEffect(() => {
    setDraftMappings(mappings);
  }, [mappings]);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/oidc-group-mappings/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oidc-group-mappings"] });
      toast({ title: "Group mapping removed" });
    },
  });

  const updateDraftMapping = (id: number, patch: Partial<OidcGroupMapping>) => {
    setDraftMappings(dms => dms.map(m => m.id === id ? { ...m, ...patch } : m));
  };

  const addDraftMapping = () => {
    setDraftMappings(dms => [...dms, { id: -Date.now(), groupName: "", fleetId: fleets[0]?.id ?? 0, roleId: 0, isNew: true }]);
  };

  const removeDraftMapping = (mapping: DraftGroupMapping) => {
    if (mapping.isNew) {
      setDraftMappings(dms => dms.filter(m => m.id !== mapping.id));
    } else {
      deleteMut.mutate(mapping.id);
    }
  };

  const hasChanges = draftMappings.some(dm => {
    if (dm.isNew) return true;
    const original = mappings.find(m => m.id === dm.id);
    return !original
      || dm.groupName !== original.groupName
      || dm.fleetId !== original.fleetId
      || dm.roleId !== original.roleId;
  });
  const canSaveMappings = hasChanges && draftMappings.every(dm => dm.groupName.trim().length > 0 && !!dm.fleetId && !!dm.roleId);

  const saveMappings = useMutation({
    mutationFn: async () => {
      const work: Promise<unknown>[] = [];
      for (const dm of draftMappings) {
        if (dm.isNew) {
          work.push(apiRequest("POST", "/api/oidc-group-mappings", { groupName: dm.groupName.trim(), fleetId: dm.fleetId, roleId: dm.roleId }));
          continue;
        }
        const original = mappings.find(m => m.id === dm.id);
        if (!original) continue;
        const patch: Partial<OidcGroupMapping> = {};
        if (dm.groupName !== original.groupName) patch.groupName = dm.groupName;
        if (dm.fleetId !== original.fleetId) patch.fleetId = dm.fleetId;
        if (dm.roleId !== original.roleId) patch.roleId = dm.roleId;
        if (Object.keys(patch).length) work.push(apiRequest("PATCH", `/api/oidc-group-mappings/${dm.id}`, patch));
      }
      await Promise.all(work);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oidc-group-mappings"] });
      toast({ title: "Group mappings saved" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const cancelDraft = () => setDraftMappings(mappings);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Network className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
        <div>
          <h3 className="font-semibold">Group mappings</h3>
          <p className="text-sm text-muted-foreground mt-1">Map an identity provider group to a fleet and role. Assigned automatically on OIDC login.</p>
        </div>
      </div>

      <EditablePageActions
        showBack={false}
        hasChanges={hasChanges}
        isSaving={saveMappings.isPending}
        canSave={canSaveMappings}
        onCancel={cancelDraft}
        onSave={() => saveMappings.mutate()}
      />

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
          {draftMappings.map(mapping => (
            <GroupMappingRow
              key={mapping.id}
              mapping={mapping}
              fleets={fleets}
              onUpdate={patch => updateDraftMapping(mapping.id, patch)}
              onDelete={() => removeDraftMapping(mapping)}
              isDeleting={deleteMut.isPending}
            />
          ))}
        </TableBody>
      </Table>
      {draftMappings.length === 0 && (
        <p className="text-sm text-muted-foreground py-2" data-testid="text-no-group-mappings">
          No group mappings yet — add one to auto-assign fleet access from your identity provider.
        </p>
      )}

      <Button size="sm" variant="outline" onClick={addDraftMapping} data-testid="button-add-mapping">
        <Plus className="size-4 mr-1.5" /> Add Mapping
      </Button>
    </Card>
  );
}

function GroupMappingRow({ mapping, fleets, onUpdate, onDelete, isDeleting }: {
  mapping: DraftGroupMapping;
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
          value={mapping.groupName}
          placeholder="fleet-admins"
          onChange={e => onUpdate({ groupName: e.target.value })}
          data-testid={`input-mapping-group-${mapping.id}`}
        />
      </TableCell>
      <TableCell>
        <Select value={mapping.fleetId ? String(mapping.fleetId) : undefined} onValueChange={v => onUpdate({ fleetId: Number(v), roleId: 0 })}>
          <SelectTrigger data-testid={`select-mapping-fleet-${mapping.id}`}><SelectValue placeholder="Choose fleet" /></SelectTrigger>
          <SelectContent>{fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select value={mapping.roleId ? String(mapping.roleId) : undefined} onValueChange={v => onUpdate({ roleId: Number(v) })}>
          <SelectTrigger data-testid={`select-mapping-role-${mapping.id}`}><SelectValue placeholder="Choose role" /></SelectTrigger>
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

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function UserRow({ user }: { user: User }) {
  const { fleets, memberships, canAdmin, systemAdmin } = useAppContext();
  const { toast } = useToast();
  const rolesQ = useQuery<FleetRoleWithPermissions[]>({ queryKey: ["/api/fleet-roles"] });
  const [editOpen, setEditOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [convertDialog, setConvertDialog] = useState<"oidc" | "local" | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const setPassword = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/users/${user.id}/password`, { password: newPassword }),
    onSuccess: () => {
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const deleteUser = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/users/${user.id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-memberships"] });
      setDeleteConfirmOpen(false);
      setEditOpen(false);
      toast({ title: "User deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e?.message ?? e), variant: "destructive" }),
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

  const userMemberships = memberships.filter(m => m.userId === user.id);
  const roleNames = userMemberships
    .map(m => (rolesQ.data ?? []).find(r => r.id === m.roleId)?.name)
    .filter((n): n is string => !!n);
  const effectiveSystemAdmin = user.systemAdmin || userMemberships.some(m => {
    const role = (rolesQ.data ?? []).find(r => r.id === m.roleId);
    return role?.permissions.includes("system.admin");
  });

  const passwordsMatch = newPassword === confirmPassword;
  const passwordLongEnough = newPassword.length >= 8;
  const canSubmitPassword = passwordLongEnough && passwordsMatch && confirmPassword.length > 0;

  // Buffered edit-modal draft: fleet-access assignments and the exempt
  // checkbox only apply on "Save Changes". Re-initialized only when the
  // modal transitions to open, not on every background refetch, so
  // in-progress edits survive.
  const [draftMemberships, setDraftMemberships] = useState<Record<number, number | null>>({});
  const [draftExempt, setDraftExempt] = useState(user.exemptFromGlobalAuthMode);

  useEffect(() => {
    if (!editOpen) return;
    const draft: Record<number, number | null> = {};
    for (const fleet of fleets) {
      const m = memberships.find(m => m.fleetId === fleet.id && m.userId === user.id);
      draft[fleet.id] = m ? m.roleId : null;
    }
    setDraftMemberships(draft);
    setDraftExempt(user.exemptFromGlobalAuthMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen]);

  const persistedMemberships = useMemo(() => {
    const map: Record<number, number | null> = {};
    for (const fleet of fleets) {
      const m = memberships.find(m => m.fleetId === fleet.id && m.userId === user.id);
      map[fleet.id] = m ? m.roleId : null;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleets, memberships, user.id]);

  const userDirty = JSON.stringify(draftMemberships) !== JSON.stringify(persistedMemberships)
    || draftExempt !== user.exemptFromGlobalAuthMode;

  const resetUserDraft = () => {
    setDraftMemberships(persistedMemberships);
    setDraftExempt(user.exemptFromGlobalAuthMode);
  };

  const saveUser = useMutation({
    mutationFn: async () => {
      const work: Promise<unknown>[] = [];
      for (const fleet of fleets) {
        const draftRoleId = draftMemberships[fleet.id] ?? null;
        const originalRoleId = persistedMemberships[fleet.id] ?? null;
        if (draftRoleId === originalRoleId) continue;
        if (draftRoleId == null) {
          work.push(apiRequest("DELETE", `/api/fleet-memberships?fleetId=${fleet.id}&userId=${user.id}`));
        } else {
          work.push(apiRequest("POST", "/api/fleet-memberships", { fleetId: fleet.id, userId: user.id, roleId: draftRoleId }));
        }
      }
      if (draftExempt !== user.exemptFromGlobalAuthMode) {
        work.push(apiRequest("PATCH", `/api/users/${user.id}/auth-settings`, { exemptFromGlobalAuthMode: draftExempt }));
      }
      await Promise.all(work);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fleet-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User updated" });
      setEditOpen(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const { confirmOrRun: confirmUserClose, dialog: userUnsavedDialog } = useUnsavedChangeGuard({
    hasChanges: userDirty,
    onSave: () => saveUser.mutate(),
  });
  const handleEditUserOpenChange = (next: boolean) => {
    if (!next) confirmUserClose(() => { resetUserDraft(); setEditOpen(false); });
  };

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-md border border-border hover-elevate group"
        onDoubleClick={() => setEditOpen(true)}
        data-testid={`row-user-${user.id}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar>
            <AvatarFallback className="text-xs font-semibold">{userInitials(user.displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium truncate max-w-full">{user.displayName}</span>
              <span className="text-xs text-muted-foreground truncate max-w-full">@{user.username}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <Badge variant="outline" className="text-[10px] tracking-wide" data-testid={`badge-auth-provider-${user.id}`}>
                {user.authProvider === "oidc" ? "SSO" : "Local"}
              </Badge>
              {effectiveSystemAdmin && (
                <Badge variant="outline" className="text-[10px] tracking-wide status-warn" data-testid={`badge-system-admin-${user.id}`}>
                  System Admin
                </Badge>
              )}
              {roleNames.length === 0 && <Badge variant="outline" className="text-[10px] tracking-wide">no access</Badge>}
              {roleNames.slice(0, 2).map((r, i) => (
                <Badge key={i} variant="outline" className="text-[10px] tracking-wide">{r}</Badge>
              ))}
              {roleNames.length > 2 && (
                <Badge variant="outline" className="text-[10px] tracking-wide">+{roleNames.length - 2} more</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} data-testid={`button-edit-user-${user.id}`}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            disabled={!canAdmin}
            onClick={() => setDeleteConfirmOpen(true)}
            data-testid={`button-delete-user-${user.id}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {editOpen && (
        <DiagnosticsRegistration name="Edit User" context={{ userId: user.id, hasChanges: userDirty }} />
      )}
      <Dialog open={editOpen} onOpenChange={handleEditUserOpenChange}>
        <DialogContent hideCloseButton className="max-w-2xl">
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle>{user.displayName}</DialogTitle>
            <DialogHeaderActions
              onCancel={() => handleEditUserOpenChange(false)}
              onSave={() => saveUser.mutate()}
              canSave={userDirty}
              isSaving={saveUser.isPending}
              hasChanges={userDirty}
            />
          </DialogHeader>
          <div className="space-y-5">

            <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Fleet Access</div>
                <div className="grid gap-2">
                  {fleets.map(fleet => {
                    const fleetRoles = (rolesQ.data ?? []).filter(r => r.fleetId === fleet.id);
                    const draftRoleId = draftMemberships[fleet.id] ?? null;
                    return (
                      <div key={fleet.id} className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3 items-center rounded-md border border-border p-3">
                        <div>
                          <div className="font-medium">{fleet.name}</div>
                          <div className="text-xs text-muted-foreground">Current role: {fleetRoles.find(r => r.id === draftRoleId)?.name ?? "no access"}</div>
                        </div>
                        <Select
                          value={draftRoleId ? String(draftRoleId) : "none"}
                          onValueChange={(value) => setDraftMemberships(prev => ({ ...prev, [fleet.id]: value === "none" ? null : Number(value) }))}
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
              </div>

              {systemAdmin && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Authentication</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] tracking-wide">{user.authProvider === "oidc" ? "SSO" : "Local"}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConvertDialog(user.authProvider === "oidc" ? "local" : "oidc")}
                      data-testid={`button-convert-auth-${user.id}`}
                    >
                      <Link2 className="size-4 mr-1.5" /> {user.authProvider === "oidc" ? "Convert to Local" : "Convert to OIDC"}
                    </Button>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={draftExempt}
                      onCheckedChange={checked => setDraftExempt(checked === true)}
                      data-testid={`checkbox-exempt-auth-mode-${user.id}`}
                    />
                    Exempt from global auth mode
                  </label>
                </div>
              )}

              {systemAdmin && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Reset Password</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>New Password</Label>
                      <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} data-testid={`input-new-password-${user.id}`} />
                    </div>
                    <div>
                      <Label>Confirm Password</Label>
                      <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} data-testid={`input-confirm-password-${user.id}`} />
                    </div>
                  </div>
                  {newPassword.length > 0 && !passwordLongEnough && (
                    <p className="text-sm text-[hsl(var(--status-overdue))]" data-testid={`text-password-too-short-${user.id}`}>
                      Password must be at least 8 characters.
                    </p>
                  )}
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="text-sm text-[hsl(var(--status-overdue))]" data-testid={`text-password-mismatch-${user.id}`}>
                      Passwords do not match.
                    </p>
                  )}
                  <div className="flex justify-end">
                    <Button disabled={!canSubmitPassword || setPassword.isPending} onClick={() => setPassword.mutate()} data-testid={`button-save-password-${user.id}`}>
                      <KeyRound className="size-4 mr-1.5" /> {setPassword.isPending ? "Saving…" : "Save Password"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-border">
                <Button variant="destructive" disabled={!canAdmin} onClick={() => setDeleteConfirmOpen(true)} data-testid={`button-delete-user-modal-${user.id}`}>
                  <Trash2 className="size-4 mr-1.5" /> Delete User
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {userUnsavedDialog}

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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes their account and all fleet access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} data-testid={`button-cancel-delete-user-${user.id}`}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteUser.isPending}
              onClick={() => deleteUser.mutate()}
              data-testid={`button-confirm-delete-user-${user.id}`}
            >
              {deleteUser.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

const AUDIT_ENTITY_TYPES = [
  "fleet", "site", "user", "fleet_membership", "fleet_equipment_type", "fleet_fuel_type",
  "service_facility", "service_facility_address", "service_facility_type", "fleet_role",
  "inventory_category", "inventory_category_field", "asset", "meter_reading",
  "maintenance_schedule", "service_event", "service_line_item", "inventory_item",
  "inventory_movement", "attachment", "app_setting", "system_settings", "oidc_group_mapping",
] as const;

const AUDIT_LOG_PAGE_SIZE = 50;

function prettifyEntityType(type: string): string {
  return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function auditActionBadge(action: string) {
  if (action === "create") return <Badge variant="outline" className="text-[10px] tracking-wide status-ok">Create</Badge>;
  if (action === "update") return <Badge variant="outline" className="text-[10px] tracking-wide status-warn">Update</Badge>;
  return <Badge variant="destructive" className="text-[10px] tracking-wide">Delete</Badge>;
}

type AuditLogResponse = { rows: AuditLog[]; total: number };

function AuditLogSection() {
  const { fleets, users } = useAppContext();
  const [filterFleetId, setFilterFleetId] = useState("all");
  const [filterEntityType, setFilterEntityType] = useState("all");
  const [filterActorUserId, setFilterActorUserId] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const resetPage = () => setOffset(0);

  const queryParams = {
    fleetId: filterFleetId !== "all" ? filterFleetId : undefined,
    entityType: filterEntityType !== "all" ? filterEntityType : undefined,
    actorUserId: filterActorUserId !== "all" ? filterActorUserId : undefined,
    action: filterAction !== "all" ? filterAction : undefined,
    from: filterFrom || undefined,
    to: filterTo || undefined,
    limit: AUDIT_LOG_PAGE_SIZE,
    offset,
  };

  const auditQ = useQuery<AuditLogResponse>({ queryKey: ["/api/audit-log", queryParams] });
  const rows = auditQ.data?.rows ?? [];
  const total = auditQ.data?.total ?? 0;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + rows.length, total);

  const fleetsById = new Map(fleets.map(f => [f.id, f]));

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <History className="size-5 mt-0.5 text-[hsl(var(--primary))]" />
          <div>
            <h3 className="font-semibold">Audit Log</h3>
            <p className="text-sm text-muted-foreground mt-1">System-wide record of every create, update, and delete.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <Label>From</Label>
            <Input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); resetPage(); }} data-testid="input-audit-log-from" />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); resetPage(); }} data-testid="input-audit-log-to" />
          </div>
          <div>
            <Label>Fleet</Label>
            <Select value={filterFleetId} onValueChange={v => { setFilterFleetId(v); resetPage(); }}>
              <SelectTrigger data-testid="select-audit-log-fleet"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fleets</SelectItem>
                {fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Entity Type</Label>
            <Select value={filterEntityType} onValueChange={v => { setFilterEntityType(v); resetPage(); }}>
              <SelectTrigger data-testid="select-audit-log-entity-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {AUDIT_ENTITY_TYPES.map(t => <SelectItem key={t} value={t}>{prettifyEntityType(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Action</Label>
            <Select value={filterAction} onValueChange={v => { setFilterAction(v); resetPage(); }}>
              <SelectTrigger data-testid="select-audit-log-action"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Actor</Label>
            <Select value={filterActorUserId} onValueChange={v => { setFilterActorUserId(v); resetPage(); }}>
              <SelectTrigger data-testid="select-audit-log-actor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actors</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.displayName || u.username}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Entity Label</TableHead>
              <TableHead>Fleet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="list-audit-log">
            {rows.flatMap(row => {
              const isExpanded = expandedId === row.id;
              const createdAt = new Date(row.createdAt);
              const mainRow = (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover-elevate"
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  data-testid={`row-audit-log-${row.id}`}
                >
                  <TableCell>{isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                  <TableCell title={createdAt.toLocaleString()}>{formatRelativeTime(createdAt)}</TableCell>
                  <TableCell>{row.actorLabel}</TableCell>
                  <TableCell>{auditActionBadge(row.action)}</TableCell>
                  <TableCell>{prettifyEntityType(row.entityType)}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{row.entityLabel}</TableCell>
                  <TableCell>{row.fleetId != null ? (fleetsById.get(row.fleetId)?.name ?? `Fleet #${row.fleetId}`) : "—"}</TableCell>
                </TableRow>
              );
              if (!isExpanded) return [mainRow];
              return [mainRow, (
                <TableRow key={`${row.id}-detail`} data-testid={`row-audit-log-detail-${row.id}`}>
                  <TableCell colSpan={7} className="bg-muted/30">
                    <AuditLogDetail row={row} />
                  </TableCell>
                </TableRow>
              )];
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6" data-testid="text-no-audit-log-entries">
                  {auditQ.isLoading ? "Loading…" : "No audit log entries match these filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span data-testid="text-audit-log-range">
          {total === 0 ? "0 of 0" : `${rangeStart}–${rangeEnd} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - AUDIT_LOG_PAGE_SIZE))} data-testid="button-audit-log-prev">
            <ChevronLeft className="size-4 mr-1" /> Prev
          </Button>
          <Button variant="outline" size="sm" disabled={rangeEnd >= total} onClick={() => setOffset(o => o + AUDIT_LOG_PAGE_SIZE)} data-testid="button-audit-log-next">
            Next <ChevronRight className="size-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatAuditChangeValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function AuditLogDetail({ row }: { row: AuditLog }) {
  const changes = row.changes as Record<string, any> | null;
  const isRedacted = (v: unknown): v is { changed: true } =>
    !!v && typeof v === "object" && "changed" in (v as object) && !("from" in (v as object));

  return (
    <div className="space-y-2 py-1">
      <div className="text-xs text-muted-foreground">IP address: {row.ipAddress ?? "—"}</div>
      {row.action === "update" && changes && Object.keys(changes).length > 0 ? (
        <div className="space-y-1">
          {Object.entries(changes).map(([field, diff]) => (
            <div key={field} className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="font-semibold text-foreground">{field}</span>
              {isRedacted(diff) ? (
                <span className="text-muted-foreground">(redacted)</span>
              ) : (
                <>
                  <span className="text-destructive line-through">{formatAuditChangeValue((diff as any)?.from)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="status-ok px-1 rounded">{formatAuditChangeValue((diff as any)?.to)}</span>
                </>
              )}
            </div>
          ))}
        </div>
      ) : changes ? (
        <pre className="text-xs bg-background border border-border rounded-md p-3 overflow-x-auto">
          {JSON.stringify(changes, null, 2)}
        </pre>
      ) : (
        <div className="text-xs text-muted-foreground">No changes recorded.</div>
      )}
    </div>
  );
}
