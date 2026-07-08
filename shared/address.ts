import { countryName } from "./countries";

export type AddressParts = {
  addressLine?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
};

export function composeAddress(parts: AddressParts): string {
  const line1 = (parts.addressLine ?? "").trim();
  const line2 = (parts.addressLine2 ?? "").trim();
  const city = (parts.city ?? "").trim();
  const state = (parts.state ?? "").trim();
  const zip = (parts.zip ?? "").trim();
  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const country = parts.country && parts.country !== "US" ? countryName(parts.country) : "";
  return [line1, line2, cityStateZip, country].filter(Boolean).join(", ");
}
