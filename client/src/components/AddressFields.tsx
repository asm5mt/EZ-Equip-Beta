import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableColumnSelect } from "@/components/SearchableColumnSelect";
import { COUNTRIES, countryName } from "@shared/countries";
import { getCountryAddressConfig } from "@/lib/address-format";
import { STATE_PROVINCE_OPTIONS, regionLabel as usCaRegionLabel } from "@/lib/regions";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/queryClient";

export interface AddressFieldsValue {
  country: string;
  addressLine: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * Reusable country-aware address entry block: Country + State/Region picker
 * (searchable, from Round 1's SearchableColumnSelect), Address Line 1/2, and
 * City/Region/ZIP fields whose presence, label, and order are driven by the
 * selected country (see lib/address-format.ts). Includes ZIP-autofill via
 * /api/zip-lookup (server-side proxy in front of Zippopotam or an
 * admin-configured mirror), scoped to the selected country. Shared by every
 * address entry point in the app (fleet address, facility's own address, and
 * each additional facility address) so this logic is never duplicated.
 */
export function AddressFields({ value, onChange, idPrefix, disabled }: {
  value: AddressFieldsValue;
  onChange: (next: AddressFieldsValue) => void;
  idPrefix: string;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const config = getCountryAddressConfig(value.country);
  const set = (patch: Partial<AddressFieldsValue>) => onChange({ ...value, ...patch });

  const handleZipBlur = async () => {
    const trimmed = value.zip.trim();
    if (trimmed.length < 3) return;
    try {
      const res = await fetch(`${API_BASE}/api/zip-lookup?country=${encodeURIComponent(value.country.toLowerCase())}&zip=${encodeURIComponent(trimmed)}`);
      // Covers: lookups disabled by an admin (403), country/code not supported
      // by the configured provider, or code not found — skip gracefully either way.
      if (!res.ok) return;
      const place = (await res.json())?.places?.[0];
      if (!place) return;
      const patch: Partial<AddressFieldsValue> = {};
      if (place["place name"]) patch.city = place["place name"];
      if (config.hasRegion && place["state abbreviation"]) patch.state = place["state abbreviation"];
      if (Object.keys(patch).length) set(patch);
    } catch {
      toast({ title: "Couldn't look up that postal code", description: "You can still enter City/State manually.", variant: "destructive" });
    }
  };

  const cityField = (
    <div key="city">
      <Label>City</Label>
      <Input
        value={value.city}
        onChange={e => set({ city: e.target.value })}
        placeholder="Springfield"
        disabled={disabled}
        data-testid={`input-${idPrefix}-city`}
      />
    </div>
  );
  const regionField = config.hasRegion ? (
    <div key="region">
      <Label>{config.regionLabel}</Label>
      {value.country === "US" || value.country === "CA" ? (
        <SearchableColumnSelect
          items={STATE_PROVINCE_OPTIONS.filter(option => option.group === (value.country === "US" ? "United States" : "Canada"))}
          columns={[
            { key: "code", label: "Code", get: o => o.value },
            { key: "name", label: "Name", get: o => o.label },
          ]}
          getId={o => o.value}
          value={value.state}
          onSelect={code => set({ state: code })}
          triggerLabel={value.state ? usCaRegionLabel(value.state) : ""}
          placeholder={`Select ${config.regionLabel.toLowerCase()}`}
          disabled={disabled}
          data-testid={`select-${idPrefix}-state`}
        />
      ) : (
        <Input
          value={value.state}
          onChange={e => set({ state: e.target.value })}
          placeholder={config.regionLabel}
          disabled={disabled}
          data-testid={`input-${idPrefix}-state`}
        />
      )}
    </div>
  ) : null;
  const zipField = (
    <div key="postalCode">
      <Label>ZIP/Postal Code</Label>
      <Input
        value={value.zip}
        onChange={e => set({ zip: e.target.value })}
        onBlur={handleZipBlur}
        placeholder="62701"
        disabled={disabled}
        data-testid={`input-${idPrefix}-zip`}
      />
    </div>
  );
  const fieldByKey = { city: cityField, region: regionField, postalCode: zipField };
  const orderedFields = config.order.map(key => fieldByKey[key]).filter(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <Label>Country</Label>
        <SearchableColumnSelect
          items={COUNTRIES}
          columns={[
            { key: "name", label: "Country", get: c => c.name },
            { key: "code", label: "Code", get: c => c.code },
          ]}
          getId={c => c.code}
          value={value.country}
          onSelect={code => set({ country: code, state: "" })}
          triggerLabel={countryName(value.country)}
          placeholder="Select country"
          disabled={disabled}
          data-testid={`select-${idPrefix}-country`}
        />
      </div>
      <div>
        <Label>Address Line</Label>
        <Input
          value={value.addressLine}
          onChange={e => set({ addressLine: e.target.value })}
          placeholder="123 Main St"
          disabled={disabled}
          data-testid={`input-${idPrefix}-address-line`}
        />
      </div>
      <div>
        <Label>Address Line 2</Label>
        <Input
          value={value.addressLine2}
          onChange={e => set({ addressLine2: e.target.value })}
          placeholder="Suite, unit, etc. (optional)"
          disabled={disabled}
          data-testid={`input-${idPrefix}-address-line-2`}
        />
      </div>
      <div className={`grid grid-cols-1 gap-3 ${orderedFields.length >= 3 ? "sm:grid-cols-[1fr_130px_120px]" : "sm:grid-cols-2"}`}>
        {orderedFields}
      </div>
    </div>
  );
}
