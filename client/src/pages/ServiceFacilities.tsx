import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Copy, Filter, LocateFixed, MapPin, Pencil, Phone, Plus, Save, Settings2, Trash2, X,
} from "lucide-react";
import { EditablePageActions } from "@/components/EditablePageActions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { badgeColorValue, tintedBadgeStyle } from "@/lib/badges";
import { FACILITY_TYPE_ICON_OPTIONS, FacilityTypeIcon, facilityTypeByName, normalizeFacilityTypeIcon } from "@/lib/facility-types";
import { distanceMiles, formatDistanceMiles, mapsUrlFor } from "@/lib/maps";
import { STATE_PROVINCE_OPTIONS } from "@/lib/regions";
import { ViewToggle, FilterGroup, CheckboxRow, FilterChip } from "@/pages/Assets";
import type { ViewMode } from "@/pages/Assets";
import { composeAddress } from "@shared/address";
import type { ServiceFacility, ServiceFacilityType } from "@shared/schema";

type SortKey = "name-asc" | "name-desc" | "type-asc" | "distance-asc";

const NO_TYPE = "__no_type__";

export default function ServiceFacilities() {
  const { systemAdmin: canAdmin } = useAppContext();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoAvailable, setGeoAvailable] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editFacility, setEditFacility] = useState<ServiceFacility | null>(null);
  const [deleteFacility, setDeleteFacility] = useState<ServiceFacility | null>(null);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);

  const facilitiesQ = useQuery<ServiceFacility[]>({ queryKey: ["/api/service-facilities"] });
  const typesQ = useQuery<ServiceFacilityType[]>({ queryKey: ["/api/service-facility-types"] });
  const facilities = facilitiesQ.data ?? [];
  const types = typesQ.data ?? [];

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    navigator.permissions.query({ name: "geolocation" as PermissionName }).then(result => {
      status = result;
      if (result.state === "granted") requestLocation();
      const handleChange = () => {
        if (result.state === "granted") requestLocation();
        else { setGeoAvailable(false); setCoords(null); }
      };
      result.addEventListener("change", handleChange);
    }).catch(() => {});
    return () => status?.removeEventListener?.("change", () => {});
  }, []);

  useEffect(() => {
    if (!geoAvailable && sortKey === "distance-asc") setSortKey("name-asc");
  }, [geoAvailable, sortKey]);

  const requestLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoAvailable(true);
      },
      () => { setGeoAvailable(false); setCoords(null); },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const distanceFor = (facility: ServiceFacility): number | null => {
    if (!coords || facility.latitude == null || facility.longitude == null) return null;
    return distanceMiles(coords.lat, coords.lng, facility.latitude, facility.longitude);
  };

  const filteredFacilities = useMemo(() => {
    return [...facilities]
      .filter(facility => !typeFilters.length || typeFilters.includes(facility.type ?? ""))
      .sort((a, b) => {
        const name = a.name.localeCompare(b.name);
        switch (sortKey) {
          case "name-desc": return -name;
          case "type-asc": return (a.type ?? "").localeCompare(b.type ?? "") || name;
          case "distance-asc": {
            const da = distanceFor(a);
            const db = distanceFor(b);
            if (da == null && db == null) return name;
            if (da == null) return 1;
            if (db == null) return -1;
            return da - db || name;
          }
          default: return name;
        }
      });
  }, [facilities, typeFilters, sortKey, coords]);

  const hasFilters = typeFilters.length > 0;
  const clearAllFilters = () => setTypeFilters([]);

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard?.writeText(address);
      toast({ title: "Address copied" });
    } catch {
      toast({ title: "Could not copy address", variant: "destructive" });
    }
  };

  const saveFacility = useMutation({
    mutationFn: async (input: Partial<ServiceFacility> & { id?: number }) => {
      const { id, ...body } = input;
      return id
        ? apiRequest("PATCH", `/api/service-facilities/${id}`, body)
        : apiRequest("POST", "/api/service-facilities", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-facilities"] });
      setAddOpen(false);
      setEditFacility(null);
      toast({ title: "Service facility saved" });
    },
    onError: (e) => toast({ title: "Save failed", description: String(e), variant: "destructive" }),
  });

  const removeFacility = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/service-facilities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-facilities"] });
      setDeleteFacility(null);
      toast({ title: "Service facility deleted" });
    },
    onError: (e) => toast({ title: "Delete failed", description: String(e), variant: "destructive" }),
  });

  return (
    <AppShell title="Service Facilities" subtitle="Shops, dealerships, and service bays available across every fleet">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setManageTypesOpen(true)} data-testid="button-manage-facility-types">
              <Settings2 className="size-4 mr-1.5" /> Manage Types
            </Button>
            {canAdmin ? (
              <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-service-facility">
                <Plus className="size-4 mr-1.5" /> Add Facility
              </Button>
            ) : (
              <Button size="sm" disabled data-testid="button-add-service-facility">
                <Plus className="size-4 mr-1.5" /> Add Facility
              </Button>
            )}
          </div>
        </div>

        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sort by:</span>
                <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                  <SelectTrigger className="h-9 w-[210px]" data-testid="select-facility-sort"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name-asc">Name (A → Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z → A)</SelectItem>
                    <SelectItem value="type-asc">Type (A → Z)</SelectItem>
                    {geoAvailable && <SelectItem value="distance-asc">Distance (Nearest first)</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {!geoAvailable && (
                <Button variant="outline" size="sm" className="h-9" onClick={requestLocation} data-testid="button-enable-distance-sort">
                  <LocateFixed className="mr-1.5 size-4" /> Enable Distance Sorting
                </Button>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9" data-testid="button-open-facility-filters">
                    <Filter className="mr-1.5 size-4" /> Filter
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[280px] space-y-4" data-testid="popover-facility-filters">
                  <FilterGroup title="Facility Type">
                    {types.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No configured facility types.</p>
                    ) : types.map(type => (
                      <CheckboxRow
                        key={type.id}
                        label={type.name}
                        checked={typeFilters.includes(type.name)}
                        onCheckedChange={(checked) => setTypeFilters(values => checked ? [...values, type.name] : values.filter(value => value !== type.name))}
                        testId={`checkbox-filter-facility-type-${type.id}`}
                      />
                    ))}
                  </FilterGroup>
                </PopoverContent>
              </Popover>
            </div>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
          {hasFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {typeFilters.map(type => <FilterChip key={`type-${type}`} label={type} onRemove={() => setTypeFilters(values => values.filter(value => value !== type))} />)}
              <button type="button" className="text-xs font-medium text-[hsl(var(--primary))] hover:underline" onClick={clearAllFilters} data-testid="button-clear-facility-filters">
                Clear all
              </button>
            </div>
          )}
        </Card>

        <Card className="p-5">
          {facilitiesQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!facilitiesQ.isLoading && filteredFacilities.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-empty-service-facilities">
              No service facilities yet — add your first shop or dealership.
            </p>
          )}
          {viewMode === "list" ? (
            <div className="grid gap-3">
              {filteredFacilities.map(facility => (
                <FacilityListRow
                  key={facility.id}
                  facility={facility}
                  configuredType={facilityTypeByName(types, facility.type)}
                  distance={distanceFor(facility)}
                  onCopy={copyAddress}
                  onEdit={() => setEditFacility(facility)}
                  onDelete={() => setDeleteFacility(facility)}
                  canAdmin={canAdmin}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredFacilities.map(facility => (
                <FacilityGridCard
                  key={facility.id}
                  facility={facility}
                  configuredType={facilityTypeByName(types, facility.type)}
                  distance={distanceFor(facility)}
                  onCopy={copyAddress}
                  onEdit={() => setEditFacility(facility)}
                  onDelete={() => setDeleteFacility(facility)}
                  canAdmin={canAdmin}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <FacilityFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        types={types}
        onSave={(input) => saveFacility.mutate(input)}
        saving={saveFacility.isPending}
      />
      <FacilityFormDialog
        open={!!editFacility}
        onOpenChange={(open) => { if (!open) setEditFacility(null); }}
        facility={editFacility}
        types={types}
        onSave={(input) => saveFacility.mutate(input)}
        saving={saveFacility.isPending}
      />

      <AlertDialog open={!!deleteFacility} onOpenChange={(open) => { if (!open) setDeleteFacility(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service facility?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFacility?.name ? `"${deleteFacility.name}"` : "This facility"} will be removed. Past work orders that used it keep their saved snapshot and are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-facility">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteFacility && removeFacility.mutate(deleteFacility.id)}
              data-testid="button-confirm-delete-facility"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManageFacilityTypesDialog open={manageTypesOpen} onOpenChange={setManageTypesOpen} types={types} canAdmin={canAdmin} />
    </AppShell>
  );
}

function FacilityTypeBadge({ type }: { type?: ServiceFacilityType }) {
  if (!type) return null;
  return (
    <Badge variant="outline" className="inline-flex items-center gap-1.5 text-[10px] tracking-wide" style={tintedBadgeStyle(type.color)}>
      <FacilityTypeIcon icon={type.icon} className="size-3" />
      {type.name}
    </Badge>
  );
}

function AddressLine({ facility, onCopy, revealOnHover }: { facility: ServiceFacility; onCopy: (address: string) => void; revealOnHover: boolean }) {
  const address = composeAddress(facility);
  if (!address) return null;
  return (
    <div className={`group/addr flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground ${revealOnHover ? "" : ""}`}>
      <span className="min-w-0 truncate">{address}</span>
      <button
        type="button"
        className={`inline-flex size-5 shrink-0 items-center justify-center rounded transition-opacity hover:bg-muted focus:opacity-100 ${revealOnHover ? "opacity-0 group-hover/addr:opacity-100" : ""}`}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCopy(address); }}
        aria-label="Copy address"
        data-testid={`button-copy-facility-address-${facility.id}`}
      >
        <Copy className="size-3" />
      </button>
      <a
        href={mapsUrlFor(address)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
        onClick={(event) => event.stopPropagation()}
        data-testid={`link-facility-map-${facility.id}`}
      >
        <MapPin className="size-3" /> Map
      </a>
    </div>
  );
}

function FacilityGridCard({ facility, configuredType, distance, onCopy, onEdit, onDelete, canAdmin }: {
  facility: ServiceFacility;
  configuredType?: ServiceFacilityType;
  distance: number | null;
  onCopy: (address: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  canAdmin: boolean;
}) {
  return (
    <div className="group/card min-w-0 flex min-h-[180px] flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-[hsl(var(--primary)/0.45)] hover:bg-muted/25" data-testid={`grid-card-facility-${facility.id}`}>
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight truncate" data-testid={`text-facility-name-${facility.id}`}>{facility.name}</div>
            <div className="mt-1"><FacilityTypeBadge type={configuredType} /></div>
          </div>
          <FacilityRowActions facilityName={facility.name} onEdit={onEdit} onDelete={onDelete} canAdmin={canAdmin} />
        </div>
        <AddressLine facility={facility} onCopy={onCopy} revealOnHover />
        {distance != null && <div className="text-[11px] text-muted-foreground">{formatDistanceMiles(distance)} away</div>}
      </div>
      <div className="mt-3 flex items-center gap-3">
        {facility.phone && (
          <a href={`tel:${facility.phone}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" onClick={(e) => e.stopPropagation()} data-testid={`link-facility-phone-${facility.id}`}>
            <Phone className="size-3.5" /> {facility.phone}
          </a>
        )}
      </div>
    </div>
  );
}

function FacilityListRow({ facility, configuredType, distance, onCopy, onEdit, onDelete, canAdmin }: {
  facility: ServiceFacility;
  configuredType?: ServiceFacilityType;
  distance: number | null;
  onCopy: (address: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  canAdmin: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 transition-colors hover:border-[hsl(var(--primary)/0.45)] hover:bg-muted/25" data-testid={`row-facility-${facility.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold leading-tight" data-testid={`text-facility-name-${facility.id}`}>{facility.name}</span>
            <FacilityTypeBadge type={configuredType} />
            {facility.phone && (
              <a href={`tel:${facility.phone}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" onClick={(e) => e.stopPropagation()} data-testid={`link-facility-phone-${facility.id}`}>
                <Phone className="size-3.5" /> {facility.phone}
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AddressLine facility={facility} onCopy={onCopy} revealOnHover={false} />
            {distance != null && <div className="text-[11px] text-muted-foreground">{formatDistanceMiles(distance)} away</div>}
          </div>
        </div>
        <FacilityRowActions facilityName={facility.name} onEdit={onEdit} onDelete={onDelete} canAdmin={canAdmin} />
      </div>
    </div>
  );
}

function FacilityRowActions({ facilityName, onEdit, onDelete, canAdmin }: { facilityName: string; onEdit: () => void; onDelete: () => void; canAdmin: boolean }) {
  if (!canAdmin) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${facilityName}`} data-testid="button-edit-facility">
        <Pencil className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={onDelete} aria-label={`Delete ${facilityName}`} data-testid="button-delete-facility">
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function FacilityFormDialog({ open, onOpenChange, facility, types, onSave, saving }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facility?: ServiceFacility | null;
  types: ServiceFacilityType[];
  onSave: (input: Partial<ServiceFacility> & { id?: number }) => void;
  saving: boolean;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState(NO_TYPE);
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [technician, setTechnician] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(facility?.name ?? "");
    setType(facility?.type ?? NO_TYPE);
    setAddressLine(facility?.addressLine ?? "");
    setCity(facility?.city ?? "");
    setState(facility?.state ?? "");
    setZip(facility?.zip ?? "");
    setPhone(facility?.phone ?? "");
    setTechnician(facility?.technician ?? "");
    setNotes(facility?.notes ?? "");
  }, [open, facility]);

  const handleZipBlur = async () => {
    const trimmed = zip.trim();
    if (!/^\d{5}$/.test(trimmed)) return;
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${trimmed}`);
      if (!res.ok) return;
      const place = (await res.json())?.places?.[0];
      if (!place) return;
      if (place["place name"]) setCity(place["place name"]);
      if (place["state abbreviation"]) setState(place["state abbreviation"]);
    } catch {
      toast({ title: "Couldn't look up that ZIP code", description: "You can still enter City/State manually.", variant: "destructive" });
    }
  };

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      id: facility?.id,
      name: name.trim(),
      type: type === NO_TYPE ? null : type,
      addressLine: addressLine.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      zip: zip.trim() || null,
      phone: phone.trim() || null,
      technician: technician.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{facility ? "Edit Service Facility" : "Add Service Facility"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Joe's Garage" data-testid="input-facility-name" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="select-facility-form-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TYPE}>No type</SelectItem>
                {types.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Address Line</Label>
            <Input value={addressLine} onChange={e => setAddressLine(e.target.value)} placeholder="123 Main St" data-testid="input-facility-address-line" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_120px] gap-3">
            <div>
              <Label>City</Label>
              <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Springfield" data-testid="input-facility-city" />
            </div>
            <div>
              <Label>State/Province</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger data-testid="select-facility-state"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>United States</SelectLabel>
                    {STATE_PROVINCE_OPTIONS.filter(option => option.group === "United States").map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.value} — {option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Canada</SelectLabel>
                    {STATE_PROVINCE_OPTIONS.filter(option => option.group === "Canada").map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.value} — {option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ZIP/Postal Code</Label>
              <Input value={zip} onChange={e => setZip(e.target.value)} onBlur={handleZipBlur} placeholder="62701" data-testid="input-facility-zip" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-1234" data-testid="input-facility-phone" />
            </div>
            <div>
              <Label>Technician</Label>
              <Input value={technician} onChange={e => setTechnician(e.target.value)} placeholder="Optional default contact" data-testid="input-facility-technician" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" data-testid="input-facility-notes" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="cancel" onClick={() => onOpenChange(false)} data-testid="button-cancel-facility-form">
              <X className="size-4 mr-1.5" /> Cancel
            </Button>
            <Button variant="success" disabled={!name.trim() || saving} onClick={submit} data-testid="button-save-facility-form">
              <Save className="size-4 mr-1.5" /> Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageFacilityTypesDialog({ open, onOpenChange, types, canAdmin }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: ServiceFacilityType[];
  canAdmin: boolean;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [icon, setIcon] = useState("wrench");

  const [draftTypes, setDraftTypes] = useState<ServiceFacilityType[]>(types);
  useEffect(() => {
    setDraftTypes(types);
  }, [types]);

  const onError = (e: any) => toast({ title: "Save failed", description: String(e), variant: "destructive" });

  const createType = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/service-facility-types", { name: name.trim(), color, icon }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-facility-types"] });
      setName(""); setColor("#64748b"); setIcon("wrench");
    },
    onError,
  });

  const deleteType = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/service-facility-types/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/service-facility-types"] }),
    onError: (e) => toast({ title: "Delete failed", description: String(e), variant: "destructive" }),
  });

  const updateDraftType = (id: number, patch: Partial<ServiceFacilityType>) => {
    setDraftTypes(dts => dts.map(t => t.id === id ? { ...t, ...patch } : t));
  };

  const hasChanges = draftTypes.some(dt => {
    const original = types.find(t => t.id === dt.id);
    return !original
      || dt.name !== original.name
      || dt.color !== original.color
      || normalizeFacilityTypeIcon(dt.icon) !== normalizeFacilityTypeIcon(original.icon);
  });

  const saveTypes = useMutation({
    mutationFn: async () => {
      const work: Promise<unknown>[] = [];
      for (const dt of draftTypes) {
        const original = types.find(t => t.id === dt.id);
        if (!original) continue;
        const patch: Partial<ServiceFacilityType> = {};
        if (dt.name !== original.name) patch.name = dt.name;
        if (dt.color !== original.color) patch.color = dt.color;
        if (normalizeFacilityTypeIcon(dt.icon) !== normalizeFacilityTypeIcon(original.icon)) patch.icon = normalizeFacilityTypeIcon(dt.icon);
        if (Object.keys(patch).length) work.push(apiRequest("PATCH", `/api/service-facility-types/${dt.id}`, patch));
      }
      await Promise.all(work);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-facility-types"] });
      toast({ title: "Facility types saved" });
    },
    onError,
  });

  const cancelDraft = () => setDraftTypes(types);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Manage Facility Types</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <EditablePageActions
            showBack={false}
            hasChanges={hasChanges}
            isSaving={saveTypes.isPending}
            canSave={!!canAdmin && hasChanges}
            onCancel={cancelDraft}
            onSave={() => saveTypes.mutate()}
          />
          <div className="grid gap-2">
            {draftTypes.length === 0 && (
              <p className="text-sm text-muted-foreground">No facility types configured yet.</p>
            )}
            {draftTypes.map(type => (
              <div key={type.id} className="grid grid-cols-[56px_1fr_100px_40px] items-center gap-2 rounded-md border border-border px-2.5 py-2" data-testid={`row-facility-type-${type.id}`}>
                <Input
                  type="color"
                  className="h-9 p-1"
                  value={badgeColorValue(type.color)}
                  disabled={!canAdmin}
                  onChange={e => updateDraftType(type.id, { color: e.target.value })}
                  data-testid={`input-facility-type-color-${type.id}`}
                />
                <Input
                  className="h-9"
                  value={type.name}
                  disabled={!canAdmin}
                  onChange={e => updateDraftType(type.id, { name: e.target.value })}
                  data-testid={`input-facility-type-name-${type.id}`}
                />
                <Select value={normalizeFacilityTypeIcon(type.icon)} onValueChange={(value) => updateDraftType(type.id, { icon: value })} disabled={!canAdmin}>
                  <SelectTrigger className="h-9" data-testid={`select-facility-type-icon-${type.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FACILITY_TYPE_ICON_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="inline-flex items-center gap-2"><option.Icon className="size-4" />{option.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-9 w-9" disabled={!canAdmin} onClick={() => deleteType.mutate(type.id)} data-testid={`button-delete-facility-type-${type.id}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          {canAdmin && (
            <div className="grid grid-cols-[56px_1fr_100px_auto] items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2">
              <Input type="color" className="h-9 p-1" value={color} onChange={e => setColor(e.target.value)} data-testid="input-new-facility-type-color" />
              <Input className="h-9" placeholder="New type name" value={name} onChange={e => setName(e.target.value)} data-testid="input-new-facility-type-name" />
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger className="h-9" data-testid="select-new-facility-type-icon"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FACILITY_TYPE_ICON_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="inline-flex items-center gap-2"><option.Icon className="size-4" />{option.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!name.trim() || createType.isPending} onClick={() => createType.mutate()} data-testid="button-create-facility-type">
                <Plus className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
