import { apiRequest } from "@/lib/queryClient";

export type RecallCacheStatus = "ok" | "has_recalls" | "has_complaints" | "error";

export type NhtsaRecallRecord = Record<string, unknown>;
export type NhtsaComplaintRecord = Record<string, unknown>;

export type VehicleSafetyLookup = {
  make: string;
  model: string;
  modelYear: string;
  lookupSource?: "vpic" | "manual";
  strictModel?: boolean;
};

export type RecallCacheEntry = {
  fetchedAt: number;
  lookup: VehicleSafetyLookup;
  recalls: NhtsaRecallRecord[];
  complaints: NhtsaComplaintRecord[];
  status: RecallCacheStatus;
  error?: string;
};

export const recallCache: Record<number, RecallCacheEntry> = {};

const pendingFetches: Record<number, Promise<RecallCacheEntry> | undefined> = {};
const pendingLookups: Record<number, VehicleSafetyLookup | undefined> = {};
const ONE_HOUR = 60 * 60 * 1000;

export function getRecallCacheEntry(vehicleId: number) {
  return recallCache[vehicleId] ?? null;
}

export function isRecallCacheFresh(entry?: RecallCacheEntry | null) {
  return !!entry && Date.now() - entry.fetchedAt < ONE_HOUR;
}

export function isRecallCacheEntryForVehicle(entry: RecallCacheEntry | null | undefined, vehicle: VehicleSafetyLookup) {
  if (!entry) return false;
  return entry.lookup.make === vehicle.make
    && entry.lookup.model === vehicle.model
    && entry.lookup.modelYear === vehicle.modelYear
    && Boolean(entry.lookup.strictModel) === Boolean(vehicle.strictModel);
}

export function safetyStatusForCounts(recalls: unknown[], complaints: unknown[]): RecallCacheStatus {
  if (recalls.length > 0) return "has_recalls";
  if (complaints.length > 0) return "has_complaints";
  return "ok";
}

export async function fetchRecallCacheEntry(
  vehicleId: number,
  vehicle: VehicleSafetyLookup,
  options: { force?: boolean; cacheErrors?: boolean } = {},
) {
  const existing = getRecallCacheEntry(vehicleId);
  if (!options.force && isRecallCacheFresh(existing) && isRecallCacheEntryForVehicle(existing, vehicle)) return existing!;
  if (!options.force && pendingFetches[vehicleId] && isSameVehicleLookup(pendingLookups[vehicleId], vehicle)) return pendingFetches[vehicleId]!;

  const params = new URLSearchParams({
    make: vehicle.make,
    model: vehicle.model,
    modelYear: vehicle.modelYear,
  });
  if (vehicle.strictModel) params.set("exactModel", "true");
  const promise = apiRequest("GET", `/api/nhtsa/safety?${params.toString()}`)
    .then(async response => {
      const data = await response.json();
      const recalls = Array.isArray(data?.recalls) ? data.recalls : [];
      const complaints = Array.isArray(data?.complaints) ? data.complaints : [];
      const entry: RecallCacheEntry = {
        fetchedAt: Date.now(),
        lookup: vehicle,
        recalls,
        complaints,
        status: safetyStatusForCounts(recalls, complaints),
      };
      recallCache[vehicleId] = entry;
      return entry;
    })
    .catch(error => {
      if (options.cacheErrors) {
        const entry: RecallCacheEntry = {
          fetchedAt: Date.now(),
          lookup: vehicle,
          recalls: [],
          complaints: [],
          status: "error",
          error: String(error?.message ?? error),
        };
        recallCache[vehicleId] = entry;
      }
      throw error;
    })
    .finally(() => {
      pendingFetches[vehicleId] = undefined;
      pendingLookups[vehicleId] = undefined;
    });

  pendingFetches[vehicleId] = promise;
  pendingLookups[vehicleId] = vehicle;
  return promise;
}

function isSameVehicleLookup(a: VehicleSafetyLookup | undefined, b: VehicleSafetyLookup) {
  return !!a
    && a.make === b.make
    && a.model === b.model
    && a.modelYear === b.modelYear
    && Boolean(a.strictModel) === Boolean(b.strictModel);
}
