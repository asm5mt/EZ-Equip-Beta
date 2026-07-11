import type { LookupProvider } from "@shared/schema";

// ---------------------------------------------------------------------------
// OAuth2 client-credentials token cache
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

// Keyed by lookup_providers.id. In-memory only — a restart just re-fetches.
const tokenCache = new Map<number, CachedToken>();

// Exchanges the provider's client credentials for an access token at
// oauthTokenUrl (standard RFC 6749 client-credentials grant, form-encoded),
// caching the result until ~60 seconds before its expires_in would elapse.
export async function getOAuthToken(provider: LookupProvider): Promise<string> {
  const cached = tokenCache.get(provider.id);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.token;

  if (!provider.oauthTokenUrl || !provider.oauthClientId || !provider.oauthClientSecret) {
    throw new Error(`Provider "${provider.name}" is missing OAuth2 client-credentials configuration`);
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: provider.oauthClientId,
    client_secret: provider.oauthClientSecret,
  });
  if (provider.oauthScope) body.set("scope", provider.oauthScope);

  let response: Response;
  try {
    response = await fetch(provider.oauthTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
  } catch (err) {
    throw new Error(`OAuth2 token request failed for provider "${provider.name}": ${String((err as Error)?.message ?? err)}`);
  }
  if (!response.ok) {
    throw new Error(`OAuth2 token request failed for provider "${provider.name}": ${response.status}`);
  }
  const data = await response.json().catch(() => null);
  const token = data?.access_token;
  if (!token) {
    throw new Error(`OAuth2 token response for provider "${provider.name}" did not include access_token`);
  }
  const expiresIn = Number(data?.expires_in ?? 3600);
  const expiresAt = now + Math.max(expiresIn - 60, 0) * 1000;
  tokenCache.set(provider.id, { token, expiresAt });
  return token;
}

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

// Builds { url, headers } for a call to `provider`, applying auth per its
// authMethod. `extraParams` become the query string; `pathSuffix` (if given)
// is appended to baseUrl before the query string — used by NHTSA's
// path-shaped endpoints (e.g. /recalls/recallsByVehicle), left empty for
// ZIP/geocoding providers whose entire request is base URL + query string.
// `placeholders` are only consulted when provider.requestUrlTemplate is set:
// each `{token}` occurrence in the template is replaced with the
// URL-encoded value of the matching key (used for {query} on geocoding
// providers, {country}/{zip} on ZIP providers — never set for 'nhtsa').
export async function buildProviderRequest(
  provider: LookupProvider,
  extraParams: Record<string, string> = {},
  pathSuffix: string = "",
  placeholders: Record<string, string> = {},
): Promise<{ url: string; headers: Record<string, string> }> {
  const headers: Record<string, string> = { Accept: "application/json" };

  switch (provider.authMethod) {
    case "header":
      if (provider.authParamName && provider.authValue) {
        headers[provider.authParamName] = provider.bearerPrefix ? `Bearer ${provider.authValue}` : provider.authValue;
      }
      break;
    case "oauth2_client_credentials": {
      const token = await getOAuthToken(provider);
      headers.Authorization = `Bearer ${token}`;
      break;
    }
    default:
      break;
  }

  if (provider.requestUrlTemplate) {
    let url = provider.requestUrlTemplate;
    for (const [key, value] of Object.entries(placeholders)) {
      url = url.split(`{${key}}`).join(encodeURIComponent(value));
    }
    if (provider.authMethod === "query" && provider.authParamName && provider.authValue) {
      const separator = url.includes("?") ? "&" : "?";
      url += `${separator}${encodeURIComponent(provider.authParamName)}=${encodeURIComponent(provider.authValue)}`;
    }
    return { url, headers };
  }

  const params = new URLSearchParams(extraParams);
  if (provider.authMethod === "query" && provider.authParamName && provider.authValue) {
    params.set(provider.authParamName, provider.authValue);
  }

  const base = provider.baseUrl.replace(/\/+$/, "") + pathSuffix;
  const qs = params.toString();
  const url = qs ? `${base}?${qs}` : base;
  return { url, headers };
}

// ---------------------------------------------------------------------------
// Response-shape resolution
// ---------------------------------------------------------------------------

// Parses "results[0].geometry.location.lat" into ["results", 0, "geometry", "location", "lat"].
function parsePath(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  const regex = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) segments.push(match[1]);
    else segments.push(Number(match[2]));
  }
  return segments;
}

// Safely walks a dot/bracket-notation path against a parsed JSON value.
// Never throws — returns undefined on any missing or malformed segment.
export function extractField(json: unknown, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = json;
  for (const segment of parsePath(path)) {
    if (current == null) return undefined;
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else {
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}

export function resolveGeocodeResult(
  json: unknown,
  provider: LookupProvider,
): { latitude: number | null; longitude: number | null } {
  let latRaw: unknown;
  let lonRaw: unknown;

  if (provider.coordinatesArrayPath) {
    const arr = extractField(json, provider.coordinatesArrayPath);
    if (Array.isArray(arr)) {
      // Mapbox/GeoJSON convention [lon, lat] when not reversed (index 0=lon,
      // 1=lat); reversed means the array is [lat, lon] instead.
      const lonIndex = provider.coordinatesReversed ? 1 : 0;
      const latIndex = provider.coordinatesReversed ? 0 : 1;
      lonRaw = arr[lonIndex];
      latRaw = arr[latIndex];
    }
  } else {
    latRaw = provider.latPath ? extractField(json, provider.latPath) : undefined;
    lonRaw = provider.lonPath ? extractField(json, provider.lonPath) : undefined;
  }

  const latitude = latRaw != null ? Number(latRaw) : NaN;
  const longitude = lonRaw != null ? Number(lonRaw) : NaN;
  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

export function resolveZipResult(json: unknown, provider: LookupProvider): { city: string | null; state: string | null } {
  const city = provider.cityPath ? extractField(json, provider.cityPath) : undefined;
  const state = provider.statePath ? extractField(json, provider.statePath) : undefined;
  return {
    city: city != null ? String(city) : null,
    state: state != null ? String(state) : null,
  };
}
