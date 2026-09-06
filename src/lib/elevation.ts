import { invoke } from "@tauri-apps/api/core";

/**
 * Elevation lookups for the trace editor. Drawn positions don't carry an
 * elevation (map clicks only give lat/lon), so the editor enriches them from
 * a free DEM API (opentopodata SRTM 90m — no API key) as the trace is drawn.
 *
 * The fetch happens on the Rust side (`lookup_elevations`) because the API
 * doesn't send CORS headers — a browser-level fetch from the app is blocked.
 * Results are cached per coordinate so re-drawing/undoing never re-hits the
 * network; failures are NOT cached, so a later attempt can retry. Offline the
 * command rejects and the editor shows a flat profile with a note.
 */

const cache = new Map<string, number | null>();

/** Stable cache key for a coordinate (5 decimals ≈ 1 m precision). */
export function elevationKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

export function cachedElevation(lat: number, lon: number): number | undefined {
  const value = cache.get(elevationKey(lat, lon));
  return value === null || value === undefined ? undefined : value;
}

/**
 * Resolve elevations for the given coordinates, aligned to the input order.
 * Every entry is a number when known, or null when the lookup failed (offline,
 * missing tile) — callers treat null as "no data".
 */
export async function fetchElevations(
  points: Array<{ lat: number; lon: number }>,
): Promise<Array<number | null>> {
  const result = new Array<number | null>(points.length).fill(null);
  const missing = new Map<string, number[]>();
  points.forEach((point, index) => {
    const key = elevationKey(point.lat, point.lon);
    const cached = cache.get(key);
    if (cached !== undefined) {
      result[index] = cached;
    } else {
      const indexes = missing.get(key) ?? [];
      indexes.push(index);
      missing.set(key, indexes);
    }
  });

  const keys = [...missing.keys()];
  if (keys.length > 0) {
    let elevations: Array<number | null> = [];
    try {
      elevations = await invoke<Array<number | null>>("lookup_elevations", {
        locations: keys.map((key) => key.split(",").map(Number)),
      });
    } catch {
      // Offline or command failure: leave everything uncached so a later
      // attempt can retry.
    }
    for (let i = 0; i < keys.length; i++) {
      const value = elevations[i];
      if (value === null || value === undefined) continue;
      cache.set(keys[i], value);
      for (const index of missing.get(keys[i]) ?? []) {
        result[index] = value;
      }
    }
  }

  return result;
}
