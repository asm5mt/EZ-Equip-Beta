export type AddressParts = {
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function composeAddress(parts: AddressParts): string {
  const line1 = (parts.addressLine ?? "").trim();
  const city = (parts.city ?? "").trim();
  const state = (parts.state ?? "").trim();
  const zip = (parts.zip ?? "").trim();
  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [line1, cityStateZip].filter(Boolean).join(", ");
}
