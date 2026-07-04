const FALLBACK_CURRENCIES = [
  "USD", "CAD", "EUR", "GBP", "AUD", "NZD", "JPY", "CNY", "CHF", "MXN",
  "BRL", "INR", "KRW", "SGD", "HKD", "NOK", "SEK", "DKK", "ZAR", "AED",
];

function getCurrencyCodes(): string[] {
  const intlWithCurrencyList = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    return intlWithCurrencyList.supportedValuesOf?.("currency") ?? FALLBACK_CURRENCIES;
  } catch {
    return FALLBACK_CURRENCIES;
  }
}

export const CURRENCY_CODES = getCurrencyCodes();

export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function currencySymbol(code: string | null | undefined): string {
  const currency = code || "USD";
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find(part => part.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

