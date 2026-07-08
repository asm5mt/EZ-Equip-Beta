import { addressFormats } from "i18n-postal-address";

// Which fields, in what order, and what to call the region field — per
// country, derived from i18n-postal-address (packages Google's Address Data
// Service, the same source libaddressinput/Chrome autofill uses). We only
// care about the locality block (city / region / postal code); name,
// company, and care-of fields in the underlying format are irrelevant to a
// facility/fleet address and are ignored.
const REGION_KEYS = ["state", "province", "region", "prefecture"] as const;
type RegionKey = (typeof REGION_KEYS)[number];

export interface CountryAddressConfig {
  hasRegion: boolean;
  regionLabel: string;
  /** Render order for the locality row — always a subset of ["city", "region", "postalCode"]. */
  order: Array<"city" | "region" | "postalCode">;
}

const DEFAULT_CONFIG: CountryAddressConfig = {
  hasRegion: true,
  regionLabel: "State/Province",
  order: ["city", "region", "postalCode"],
};

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const cache = new Map<string, CountryAddressConfig>();

export function getCountryAddressConfig(countryCode?: string | null): CountryAddressConfig {
  const code = (countryCode ?? "US").toUpperCase();
  const cached = cache.get(code);
  if (cached) return cached;

  const format = addressFormats[code]?.default ?? Object.values(addressFormats[code] ?? {})[0];
  if (!format?.array) {
    cache.set(code, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  const flat = (format.array as unknown[]).flat().map(part =>
    typeof part === "string" ? part : (part as { attribute: string }).attribute
  );
  const regionKey: RegionKey | undefined = REGION_KEYS.find(key => flat.includes(key));
  const hasRegion = !!regionKey;
  const regionLabel = regionKey ? capitalize(regionKey) : DEFAULT_CONFIG.regionLabel;

  const order = flat
    .filter((key): key is "city" | "postalCode" | RegionKey => key === "city" || key === "postalCode" || key === regionKey)
    .map(key => (key === regionKey ? "region" : key) as "city" | "region" | "postalCode");

  const config: CountryAddressConfig = {
    hasRegion,
    regionLabel,
    order: order.length ? order : DEFAULT_CONFIG.order,
  };
  cache.set(code, config);
  return config;
}
