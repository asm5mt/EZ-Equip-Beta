// Nominatim requires a descriptive User-Agent identifying the application
// (see https://operations.osmfoundation.org/policies/nominatim/) — requests
// without one are liable to be blocked.
const NOMINATIM_USER_AGENT = "EZ-Equip-ServiceFacilities/1.0 (internal fleet maintenance tool)";

export async function geocodeAddress(query: string): Promise<{ latitude: number | null; longitude: number | null }> {
  const trimmed = query.trim();
  if (!trimmed) return { latitude: null, longitude: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const params = new URLSearchParams({ format: "json", limit: "1", q: trimmed });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return { latitude: null, longitude: null };
    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    const latitude = first ? Number(first.lat) : NaN;
    const longitude = first ? Number(first.lon) : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { latitude: null, longitude: null };
    return { latitude, longitude };
  } catch {
    return { latitude: null, longitude: null };
  } finally {
    clearTimeout(timeout);
  }
}
