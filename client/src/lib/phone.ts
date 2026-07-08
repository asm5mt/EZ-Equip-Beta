import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { countryName } from "@shared/countries";

export interface PhoneCountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
}

export const PHONE_COUNTRIES: PhoneCountryOption[] = getCountries()
  .map(code => ({ code, name: countryName(code), callingCode: getCountryCallingCode(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Same countries, sorted by dial code first (then name) for calling-code pickers. */
export const PHONE_COUNTRIES_BY_CALLING_CODE: PhoneCountryOption[] = [...PHONE_COUNTRIES].sort((a, b) => {
  const callingCodeDiff = Number(a.callingCode) - Number(b.callingCode);
  return callingCodeDiff !== 0 ? callingCodeDiff : a.name.localeCompare(b.name);
});

/** Formats a calling-code picker label, e.g. "+1 — United States". */
export function callingCodeLabel(country: Pick<PhoneCountryOption, "name" | "callingCode">): string {
  return `+${country.callingCode} — ${country.name}`;
}

/** Live-formats a national number as the user types, e.g. "5551234567" -> "(555) 123-4567". */
export function formatPhoneAsYouType(value: string, country: CountryCode): string {
  return new AsYouType(country).input(value);
}

/**
 * Normalizes a stored phone value to E.164. Handles both already-E.164 numbers
 * and legacy pre-migration values that were stored as plain national digits
 * (parsed using fallbackCountry, since "+" numbers ignore the country arg).
 */
export function normalizePhoneToE164(raw?: string | null, fallbackCountry: CountryCode = "US"): string | null {
  if (!raw) return null;
  return parsePhoneNumberFromString(raw, fallbackCountry)?.number ?? null;
}

/** Formats a stored phone value for display, in the convention of its country. */
export function formatPhoneForDisplay(raw?: string | null, fallbackCountry: CountryCode = "US"): string {
  if (!raw) return "";
  const parsed = parsePhoneNumberFromString(raw, fallbackCountry);
  return parsed ? parsed.formatNational() : raw;
}

/** The ISO country a stored phone value belongs to, for pre-filling the country selector. */
export function phoneCountryFromE164(raw?: string | null, fallbackCountry: CountryCode = "US"): CountryCode | undefined {
  if (!raw) return undefined;
  return parsePhoneNumberFromString(raw, fallbackCountry)?.country;
}

/** Converts a national-format input to E.164 for storage. Returns null if it can't be parsed at all. */
export function phoneToE164(nationalInput: string, country: CountryCode): string | null {
  const trimmed = nationalInput.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, country);
  return parsed?.number ?? null;
}

export function isPhoneValid(nationalInput: string, country: CountryCode): boolean {
  if (!nationalInput.trim()) return true;
  return isValidPhoneNumber(nationalInput, country);
}
