import { useEffect, useMemo, useRef, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Building2, Copy, Filter, LocateFixed, MapPin, Pencil, Phone, Plus, Save, Settings2, Trash2, X,
} from "lucide-react";
import { DialogHeaderActions, useUnsavedChangeGuard } from "@/components/EditablePageActions";
import { DiagnosticsRegistration } from "@/lib/diagnostics-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";
import { badgeColorValue, tintedBadgeStyle } from "@/lib/badges";
import { FACILITY_TYPE_ICON_OPTIONS, FacilityTypeIcon, facilityTypeByName, normalizeFacilityTypeIcon } from "@/lib/facility-types";
import { distanceMiles, formatDistanceMiles, mapsUrlFor } from "@/lib/maps";
import { ViewToggle, FilterGroup, CheckboxRow, FilterChip } from "@/pages/Assets";
import type { ViewMode } from "@/pages/Assets";
import { composeAddress } from "@shared/address";
import {
  PHONE_COUNTRIES, formatPhoneAsYouType, formatPhoneForDisplay, phoneCountryFromE164, phoneToE164, normalizePhoneToE164,
} from "@/lib/phone";
import type { CountryCode } from "libphonenumber-js";
import { SearchableColumnSelect } from "@/components/SearchableColumnSelect";
import { AddressFields } from "@/components/AddressFields";
import type { ServiceFacility, ServiceFacilityAddress, ServiceFacilityType } from "@shared/schema";

type SortKey = "name-asc" | "name-desc" | "type-asc" | "distance-asc";

const NO_TYPE = "__no_type__";

const FACILITY_TYPE_COMMON_ICONS = ["wrench", "building", "car", "truck", "store"];

export default function ServiceFacilities() {
  const { systemAdmin: canAdmin, fleet } = useAppContext();
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
  const addressesQ = useQuery<ServiceFacilityAddress[]>({ queryKey: ["/api/service-facility-addresses"] });
  const facilities = facilitiesQ.data ?? [];
  const types = typesQ.data ?? [];
  const addressesByFacility = useMemo(() => {
    const map = new Map<number, ServiceFacilityAddress[]>();
    for (const a of addressesQ.data ?? []) {
      const list = map.get(a.facilityId);
      if (list) list.push(a);
      else map.set(a.facilityId, [a]);
    }
    return map;
  }, [addressesQ.data]);

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
                  additionalAddresses={addressesByFacility.get(facility.id) ?? []}
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
                  additionalAddresses={addressesByFacility.get(facility.id) ?? []}
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
        onSaved={() => setAddOpen(false)}
        defaultCountryCode={fleet?.defaultCountryCode}
        defaultCallingCode={fleet?.defaultCallingCode}
      />
      <FacilityFormDialog
        open={!!editFacility}
        onOpenChange={(open) => { if (!open) setEditFacility(null); }}
        facility={editFacility}
        types={types}
        onSaved={() => setEditFacility(null)}
        defaultCountryCode={fleet?.defaultCountryCode}
        defaultCallingCode={fleet?.defaultCallingCode}
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

function AddressTypePill({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Building2 className="size-3" />
      {label}
    </span>
  );
}

function AddressLine({ facility, additionalAddresses, onCopy, revealOnHover }: {
  facility: ServiceFacility;
  additionalAddresses: ServiceFacilityAddress[];
  onCopy: (address: string) => void;
  revealOnHover: boolean;
}) {
  const baseAddress = composeAddress(facility);
  const rows = [
    ...(baseAddress ? [{ key: "primary", label: "Primary", address: baseAddress }] : []),
    ...additionalAddresses
      .map(a => ({ key: String(a.id), label: a.label?.trim() || (a.isPrimary ? "Primary" : "Secondary"), address: composeAddress(a) }))
      .filter(row => row.address),
  ];
  // Only show a type pill once a facility has more than one address on file —
  // a single-address facility displays its address plain, as it always has.
  const showPills = rows.length > 1;
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      {rows.map(row => (
        <div key={row.key} className="group/addr flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          {showPills && <AddressTypePill label={row.label} />}
          <span className="min-w-0 truncate">{row.address}</span>
          <button
            type="button"
            className={`inline-flex size-5 shrink-0 items-center justify-center rounded transition-opacity hover:bg-muted focus:opacity-100 ${revealOnHover ? "opacity-0 group-hover/addr:opacity-100" : ""}`}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCopy(row.address); }}
            aria-label="Copy address"
            data-testid={`button-copy-facility-address-${facility.id}-${row.key}`}
          >
            <Copy className="size-3" />
          </button>
          <a
            href={mapsUrlFor(row.address)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
            data-testid={`link-facility-map-${facility.id}-${row.key}`}
          >
            <MapPin className="size-3" /> Map
          </a>
        </div>
      ))}
    </div>
  );
}

function FacilityGridCard({ facility, additionalAddresses, configuredType, distance, onCopy, onEdit, onDelete, canAdmin }: {
  facility: ServiceFacility;
  additionalAddresses: ServiceFacilityAddress[];
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
        <AddressLine facility={facility} additionalAddresses={additionalAddresses} onCopy={onCopy} revealOnHover />
        {distance != null && <div className="text-[11px] text-muted-foreground">{formatDistanceMiles(distance)} away</div>}
      </div>
      <div className="mt-3 flex items-center gap-3">
        {facility.phone && (
          <a href={`tel:${facility.phone}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" onClick={(e) => e.stopPropagation()} data-testid={`link-facility-phone-${facility.id}`}>
            <Phone className="size-3.5" /> {formatPhoneForDisplay(facility.phone, facility.country as CountryCode)}
          </a>
        )}
      </div>
    </div>
  );
}

function FacilityListRow({ facility, additionalAddresses, configuredType, distance, onCopy, onEdit, onDelete, canAdmin }: {
  facility: ServiceFacility;
  additionalAddresses: ServiceFacilityAddress[];
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
                <Phone className="size-3.5" /> {formatPhoneForDisplay(facility.phone, facility.country as CountryCode)}
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AddressLine facility={facility} additionalAddresses={additionalAddresses} onCopy={onCopy} revealOnHover={false} />
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

type DraftFacilityAddress = {
  id: number;
  label: string;
  isPrimary: boolean;
  addressLine: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  isNew?: boolean;
};

function FacilityFormDialog({ open, onOpenChange, facility, types, onSaved, defaultCountryCode, defaultCallingCode }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facility?: ServiceFacility | null;
  types: ServiceFacilityType[];
  onSaved: () => void;
  defaultCountryCode?: string;
  defaultCallingCode?: string | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState(NO_TYPE);
  const [addressLine, setAddressLine] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>("US");
  const [technician, setTechnician] = useState("");
  const [notes, setNotes] = useState("");
  const [draftAddresses, setDraftAddresses] = useState<DraftFacilityAddress[]>([]);
  const [deletedAddressIds, setDeletedAddressIds] = useState<number[]>([]);
  const nextTempId = useRef(0);

  const addressesQ = useQuery<ServiceFacilityAddress[]>({
    queryKey: ["/api/service-facility-addresses", { facilityId: facility?.id }],
    enabled: open && !!facility?.id,
  });

  useEffect(() => {
    if (!open) return;
    setName(facility?.name ?? "");
    setType(facility?.type ?? NO_TYPE);
    setAddressLine(facility?.addressLine ?? "");
    setAddressLine2(facility?.addressLine2 ?? "");
    setCity(facility?.city ?? "");
    setState(facility?.state ?? "");
    setZip(facility?.zip ?? "");
    const initialCountry = facility?.country ?? defaultCountryCode ?? "US";
    setCountry(initialCountry);
    setPhone(facility?.phone ? formatPhoneForDisplay(facility.phone, initialCountry as CountryCode) : "");
    setPhoneCountry(
      phoneCountryFromE164(facility?.phone, initialCountry as CountryCode)
      ?? (defaultCallingCode as CountryCode)
      ?? (defaultCountryCode as CountryCode)
      ?? "US"
    );
    setTechnician(facility?.technician ?? "");
    setNotes(facility?.notes ?? "");
  }, [open, facility, defaultCountryCode, defaultCallingCode]);

  useEffect(() => {
    if (!open) return;
    setDraftAddresses((addressesQ.data ?? []).map(a => ({
      id: a.id,
      label: a.label ?? "",
      isPrimary: a.isPrimary,
      addressLine: a.addressLine ?? "",
      addressLine2: a.addressLine2 ?? "",
      city: a.city ?? "",
      state: a.state ?? "",
      zip: a.zip ?? "",
      country: a.country,
    })));
    setDeletedAddressIds([]);
  }, [open, facility?.id, addressesQ.data]);

  const addDraftAddress = () => {
    nextTempId.current -= 1;
    setDraftAddresses(list => [...list, {
      id: nextTempId.current,
      label: "",
      isPrimary: false,
      addressLine: "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      country,
      isNew: true,
    }]);
  };
  const updateDraftAddress = (id: number, patch: Partial<DraftFacilityAddress>) => {
    setDraftAddresses(list => list.map(a => a.id === id ? { ...a, ...patch } : a));
  };
  const removeDraftAddress = (addr: DraftFacilityAddress) => {
    setDraftAddresses(list => list.filter(a => a.id !== addr.id));
    if (!addr.isNew) setDeletedAddressIds(ids => [...ids, addr.id]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const basePayload = {
        name: name.trim(),
        type: type === NO_TYPE ? null : type,
        addressLine: addressLine.trim() || null,
        addressLine2: addressLine2.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zip: zip.trim() || null,
        country,
        phone: phoneToE164(phone, phoneCountry),
        technician: technician.trim() || null,
        notes: notes.trim() || null,
      };
      let facilityId: number;
      if (facility) {
        await apiRequest("PATCH", `/api/service-facilities/${facility.id}`, basePayload);
        facilityId = facility.id;
      } else {
        const created = await apiRequest("POST", "/api/service-facilities", basePayload).then(r => r.json());
        facilityId = created.id;
      }

      const work: Promise<unknown>[] = [];
      for (const id of deletedAddressIds) {
        work.push(apiRequest("DELETE", `/api/service-facility-addresses/${id}`));
      }
      for (const addr of draftAddresses) {
        const payload = {
          facilityId,
          label: addr.label.trim() || null,
          isPrimary: addr.isPrimary,
          addressLine: addr.addressLine.trim() || null,
          addressLine2: addr.addressLine2.trim() || null,
          city: addr.city.trim() || null,
          state: addr.state.trim() || null,
          zip: addr.zip.trim() || null,
          country: addr.country,
        };
        work.push(
          addr.isNew
            ? apiRequest("POST", "/api/service-facility-addresses", payload)
            : apiRequest("PATCH", `/api/service-facility-addresses/${addr.id}`, payload)
        );
      }
      await Promise.all(work);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/service-facilities"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/service-facility-addresses"] });
      toast({ title: "Service facility saved" });
      onSaved();
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const submit = () => {
    if (!name.trim()) return;
    saveMutation.mutate();
  };

  const hasChanges = open && (
    name.trim() !== (facility?.name ?? "")
    || type !== (facility?.type ?? NO_TYPE)
    || addressLine.trim() !== (facility?.addressLine ?? "")
    || addressLine2.trim() !== (facility?.addressLine2 ?? "")
    || city.trim() !== (facility?.city ?? "")
    || state.trim() !== (facility?.state ?? "")
    || zip.trim() !== (facility?.zip ?? "")
    || country !== (facility?.country ?? "US")
    || (phoneToE164(phone, phoneCountry) ?? "") !== (normalizePhoneToE164(facility?.phone, (facility?.country as CountryCode) ?? "US") ?? "")
    || technician.trim() !== (facility?.technician ?? "")
    || notes.trim() !== (facility?.notes ?? "")
    || deletedAddressIds.length > 0
    || draftAddresses.some(addr => {
      if (addr.isNew) return true;
      const original = (addressesQ.data ?? []).find(a => a.id === addr.id);
      return !original
        || addr.label.trim() !== (original.label ?? "")
        || addr.isPrimary !== original.isPrimary
        || addr.addressLine.trim() !== (original.addressLine ?? "")
        || addr.addressLine2.trim() !== (original.addressLine2 ?? "")
        || addr.city.trim() !== (original.city ?? "")
        || addr.state.trim() !== (original.state ?? "")
        || addr.zip.trim() !== (original.zip ?? "")
        || addr.country !== original.country;
    })
  );

  const { confirmOrRun: confirmClose, dialog: unsavedDialog } = useUnsavedChangeGuard({ hasChanges, onSave: submit });
  const handleOpenChange = (next: boolean) => {
    if (!next) confirmClose(() => onOpenChange(false));
    else onOpenChange(next);
  };

  const phoneCallingCode = PHONE_COUNTRIES.find(c => c.code === phoneCountry)?.callingCode;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideCloseButton className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>{facility ? "Edit Service Facility" : "Add Service Facility"}</DialogTitle>
          <DialogHeaderActions
            onCancel={() => handleOpenChange(false)}
            onSave={submit}
            canSave={!!name.trim()}
            isSaving={saveMutation.isPending}
            hasChanges={hasChanges}
          />
        </DialogHeader>
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
          <AddressFields
            value={{ country, addressLine, addressLine2, city, state, zip }}
            onChange={next => {
              setCountry(next.country);
              setAddressLine(next.addressLine);
              setAddressLine2(next.addressLine2);
              setCity(next.city);
              setState(next.state);
              setZip(next.zip);
            }}
            idPrefix="facility"
          />
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Additional Addresses</div>
              <Button type="button" variant="outline" size="sm" onClick={addDraftAddress} data-testid="button-add-facility-address">
                <Plus className="size-4 mr-1.5" /> Add Address
              </Button>
            </div>
            {draftAddresses.length === 0 && (
              <p className="text-xs text-muted-foreground">No additional addresses.</p>
            )}
            {draftAddresses.map(addr => (
              <div key={addr.id} className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3" data-testid={`row-facility-address-${addr.id}`}>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={addr.label}
                      onChange={e => updateDraftAddress(addr.id, { label: e.target.value })}
                      placeholder="Mailing, Loading Dock, Warehouse…"
                      data-testid={`input-facility-address-label-${addr.id}`}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 pb-2">
                    <Switch
                      checked={addr.isPrimary}
                      onCheckedChange={checked => updateDraftAddress(addr.id, { isPrimary: checked })}
                      data-testid={`switch-facility-address-primary-${addr.id}`}
                    />
                    <span className="text-xs text-muted-foreground">Primary</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeDraftAddress(addr)}
                    aria-label="Remove address"
                    data-testid={`button-remove-facility-address-${addr.id}`}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <AddressFields
                  value={{ country: addr.country, addressLine: addr.addressLine, addressLine2: addr.addressLine2, city: addr.city, state: addr.state, zip: addr.zip }}
                  onChange={next => updateDraftAddress(addr.id, next)}
                  idPrefix={`facility-address-${addr.id}`}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <div className="flex gap-2">
                <SearchableColumnSelect
                  items={PHONE_COUNTRIES}
                  columns={[
                    { key: "name", label: "Country", get: c => c.name },
                    { key: "callingCode", label: "Code", get: c => `+${c.callingCode}` },
                  ]}
                  getId={c => c.code}
                  value={phoneCountry}
                  onSelect={code => setPhoneCountry(code as CountryCode)}
                  triggerLabel={phoneCallingCode ? `${phoneCountry} +${phoneCallingCode}` : phoneCountry}
                  className="w-[104px] shrink-0 px-2"
                  data-testid="select-facility-phone-country"
                />
                <Input
                  value={phone}
                  onChange={e => setPhone(formatPhoneAsYouType(e.target.value, phoneCountry))}
                  placeholder="(555) 555-1234"
                  className="flex-1"
                  data-testid="input-facility-phone"
                />
              </div>
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
        </div>
        {unsavedDialog}
      </DialogContent>
      </Dialog>
    </>
  );
}

type DraftFacilityType = ServiceFacilityType & { isNew?: boolean };

function ManageFacilityTypesDialog({ open, onOpenChange, types, canAdmin }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: ServiceFacilityType[];
  canAdmin: boolean;
}) {
  const { toast } = useToast();

  const [draftTypes, setDraftTypes] = useState<DraftFacilityType[]>(types);
  useEffect(() => {
    setDraftTypes(types);
  }, [types]);

  const onError = (e: any) => toast({ title: "Save failed", description: String(e), variant: "destructive" });

  const deleteType = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/service-facility-types/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/service-facility-types"] }),
    onError: (e) => toast({ title: "Delete failed", description: String(e), variant: "destructive" }),
  });

  const updateDraftType = (id: number, patch: Partial<ServiceFacilityType>) => {
    setDraftTypes(dts => dts.map(t => t.id === id ? { ...t, ...patch } : t));
  };

  const addDraftType = () => {
    setDraftTypes(dts => [...dts, { id: -Date.now(), name: "", color: "#64748b", icon: "wrench", isNew: true }]);
  };

  const removeDraftType = (type: DraftFacilityType) => {
    if (type.isNew) {
      setDraftTypes(dts => dts.filter(t => t.id !== type.id));
    } else {
      deleteType.mutate(type.id);
    }
  };

  const hasChanges = draftTypes.some(dt => {
    if (dt.isNew) return true;
    const original = types.find(t => t.id === dt.id);
    return !original
      || dt.name !== original.name
      || dt.color !== original.color
      || normalizeFacilityTypeIcon(dt.icon) !== normalizeFacilityTypeIcon(original.icon);
  });
  const canSaveTypes = hasChanges && draftTypes.every(dt => dt.name.trim().length > 0);

  const saveTypes = useMutation({
    mutationFn: async () => {
      const work: Promise<unknown>[] = [];
      for (const dt of draftTypes) {
        if (dt.isNew) {
          work.push(apiRequest("POST", "/api/service-facility-types", {
            name: dt.name.trim(),
            color: dt.color,
            icon: normalizeFacilityTypeIcon(dt.icon),
          }));
          continue;
        }
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
      onOpenChange(false);
    },
    onError,
  });

  const cancelDraft = () => {
    setDraftTypes(types);
  };

  const { confirmOrRun: confirmClose, dialog: unsavedDialog } = useUnsavedChangeGuard({
    hasChanges,
    onSave: () => saveTypes.mutate(),
  });
  const handleOpenChange = (next: boolean) => {
    if (!next) confirmClose(() => { cancelDraft(); onOpenChange(false); });
    else onOpenChange(next);
  };

  return (
    <>
      {open && <DiagnosticsRegistration name="Manage Facility Types" context={{ hasChanges }} />}
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideCloseButton className="max-w-lg">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>Manage Facility Types</DialogTitle>
          <div className="flex shrink-0 items-center gap-2.5">
            {canAdmin && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  onClick={addDraftType}
                  aria-label="Add facility type"
                  data-testid="button-add-facility-type"
                >
                  <Plus className="size-4" />
                </Button>
                <div className="h-5 w-px bg-border" aria-hidden="true" />
              </>
            )}
            <DialogHeaderActions
              onCancel={() => handleOpenChange(false)}
              onSave={() => saveTypes.mutate()}
              canSave={!!canAdmin && canSaveTypes}
              isSaving={saveTypes.isPending}
              hasChanges={hasChanges}
            />
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            {draftTypes.length === 0 && (
              <p className="text-sm text-muted-foreground">No facility types configured yet.</p>
            )}
            {draftTypes.map(type => (
              <div key={type.id} className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] items-center gap-2 rounded-md border border-border px-2.5 py-2" data-testid={`row-facility-type-${type.id}`}>
                <FacilityTypeStylePopover
                  type={type}
                  disabled={!canAdmin}
                  onChange={patch => updateDraftType(type.id, patch)}
                />
                <Input
                  className="h-9"
                  placeholder="New type name"
                  value={type.name}
                  disabled={!canAdmin}
                  onChange={e => updateDraftType(type.id, { name: e.target.value })}
                  data-testid={`input-facility-type-name-${type.id}`}
                />
                <Button variant="ghost" size="icon" className="h-9 w-9" disabled={!canAdmin} onClick={() => removeDraftType(type)} data-testid={`button-delete-facility-type-${type.id}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        {unsavedDialog}
      </DialogContent>
      </Dialog>
    </>
  );
}

function FacilityTypeStylePopover({ type, disabled, onChange }: {
  type: ServiceFacilityType;
  disabled: boolean;
  onChange: (patch: Partial<ServiceFacilityType>) => void;
}) {
  const [iconSearch, setIconSearch] = useState("");
  const filteredIcons = FACILITY_TYPE_ICON_OPTIONS.filter(option =>
    option.label.toLowerCase().includes(iconSearch.trim().toLowerCase())
    || String(option.value).toLowerCase().includes(iconSearch.trim().toLowerCase())
  );
  const commonIcons = FACILITY_TYPE_ICON_OPTIONS.filter(option => FACILITY_TYPE_COMMON_ICONS.includes(option.value));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex w-full max-w-[140px] items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          data-testid={`button-facility-type-style-${type.id}`}
        >
          <Badge
            variant="outline"
            className="inline-flex w-full items-center justify-start gap-1.5 truncate text-[10px] font-medium tracking-wide transition-shadow hover:shadow-sm"
            style={tintedBadgeStyle(type.color)}
          >
            <FacilityTypeIcon icon={type.icon} className="size-3 shrink-0" />
            <span className="truncate">{type.name || "Facility Type"}</span>
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] space-y-4" data-testid={`popover-facility-type-style-${type.id}`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Color</div>
          <div className="mt-2 grid grid-cols-[56px_1fr] items-center gap-3 rounded-md border border-border bg-muted/35 p-2">
            <Input
              type="color"
              className="h-10 w-14 cursor-pointer p-1"
              value={badgeColorValue(type.color)}
              onChange={event => onChange({ color: event.target.value })}
              data-testid={`input-facility-type-color-${type.id}`}
              aria-label="Choose facility type color"
            />
            <Badge
              variant="outline"
              className="inline-flex w-full items-center justify-start gap-1.5 truncate text-[10px] font-medium tracking-wide"
              style={tintedBadgeStyle(type.color)}
            >
              <FacilityTypeIcon icon={type.icon} className="size-3 shrink-0" />
              <span className="truncate">{type.name || "Facility Type"}</span>
            </Badge>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Icon</div>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {commonIcons.map(option => (
              <button
                key={option.value}
                type="button"
                title={option.label}
                className={`flex h-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${normalizeFacilityTypeIcon(type.icon) === option.value ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : ""}`}
                onClick={() => onChange({ icon: normalizeFacilityTypeIcon(option.value) })}
                data-testid={`button-facility-type-icon-common-${type.id}-${option.value}`}
              >
                <option.Icon className="size-4" />
              </button>
            ))}
          </div>
          <Input
            className="mt-2 h-8"
            value={iconSearch}
            onChange={event => setIconSearch(event.target.value)}
            placeholder="Search icons"
            data-testid={`input-facility-type-icon-search-${type.id}`}
          />
          <div className="mt-2 grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
            {filteredIcons.map(option => (
              <button
                key={option.value}
                type="button"
                className={`flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-border bg-background px-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${normalizeFacilityTypeIcon(type.icon) === option.value ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : ""}`}
                onClick={() => onChange({ icon: normalizeFacilityTypeIcon(option.value) })}
                data-testid={`button-facility-type-icon-${type.id}-${option.value}`}
              >
                <option.Icon className="size-4" />
                <span className="max-w-full truncate">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
