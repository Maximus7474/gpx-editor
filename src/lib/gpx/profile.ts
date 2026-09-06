import type { GpxDocument } from "../types/gpx";
import { buildOrderedPath } from "./path";

export interface ElevationProfilePoint {
  /** Cumulative distance along the recorded path, in meters. */
  distanceM: number;
  elevationM: number;
}

export interface ElevationProfile {
  /** Sorted by `distanceM`, one sample per GPX point that has an `<ele>`. */
  points: ElevationProfilePoint[];
  totalDistanceM: number;
  minElevationM: number;
  maxElevationM: number;
  totalClimbM: number;
  totalDescentM: number;
}

/**
 * Elevation samples along the ordered path (same flattening the map uses):
 * one sample per point that carries an `<ele>`, positioned by its cumulative
 * distance. Points without elevation still advance the distance, so the
 * horizontal axis stays true to the route. Returns null when there is nothing
 * to chart (fewer than two points overall, or none carry an elevation).
 */
export function elevationProfile(doc: GpxDocument): ElevationProfile | null {
  const path = buildOrderedPath(doc);
  if (!path) return null;

  const points: ElevationProfilePoint[] = [];
  let minElevationM = Infinity;
  let maxElevationM = -Infinity;
  let totalClimbM = 0;
  let totalDescentM = 0;
  let previousElevation: number | undefined;

  for (let i = 0; i < path.points.length; i++) {
    const ele = path.points[i].ele;
    if (ele === undefined || !Number.isFinite(ele)) continue;

    points.push({ distanceM: path.dist[i], elevationM: ele });
    minElevationM = Math.min(minElevationM, ele);
    maxElevationM = Math.max(maxElevationM, ele);
    if (previousElevation !== undefined) {
      const delta = ele - previousElevation;
      if (delta > 0) totalClimbM += delta;
      else totalDescentM += -delta;
    }
    previousElevation = ele;
  }

  if (points.length === 0) return null;

  return {
    points,
    totalDistanceM: path.totalM,
    minElevationM,
    maxElevationM,
    totalClimbM,
    totalDescentM,
  };
}

/** Elevation of the profile curve at `distanceM`, interpolated between
    samples (constant outside the sampled span, i.e. clamped at the ends). */
export function elevationAtDistance(profile: ElevationProfile, distanceM: number): number {
  const { points } = profile;
  if (points.length === 1 || distanceM <= points[0].distanceM) return points[0].elevationM;
  const last = points[points.length - 1];
  if (distanceM >= last.distanceM) return last.elevationM;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].distanceM <= distanceM) lo = mid;
    else hi = mid - 1;
  }

  const a = points[lo];
  const b = points[lo + 1];
  const span = b.distanceM - a.distanceM;
  const t = span > 0 ? (distanceM - a.distanceM) / span : 0;
  return a.elevationM + t * (b.elevationM - a.elevationM);
}
