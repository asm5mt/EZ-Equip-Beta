// Country list (ISO 3166-1 alpha-2 + common English name) from world-countries.
// Per-country ADDRESS FORMAT (which fields, order) comes separately from
// i18n-postal-address (client/src/lib/address-format.ts), which packages
// Google's Address Data Service — the same source libaddressinput/Chrome
// autofill uses. This file is the one canonical country list shared by the
// client (Country picker, phone country-code picker) and the server
// (geocoding query enrichment).
import worldCountries from "world-countries";

export interface CountryOption {
  code: string;
  name: string;
}

export const COUNTRIES: CountryOption[] = worldCountries
  .map(c => ({ code: c.cca2, name: c.name.common }))
  .sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_NAME_BY_CODE = new Map(COUNTRIES.map(c => [c.code, c.name]));

export function countryName(code?: string | null): string {
  if (!code) return "";
  return COUNTRY_NAME_BY_CODE.get(code.toUpperCase()) ?? code;
}
