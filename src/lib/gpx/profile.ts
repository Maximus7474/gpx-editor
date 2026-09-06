import type { GpxDocument, TrackPoint } from "../types/gpx";
import { haversineDistanceMeters } from "./geometry";

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
 * Flattens every track segment and route into one ordered profile: cumulative
 * distance along the path vs. elevation. Points without an `<ele>` still
 * advance the distance so the horizontal axis stays true to the route; they
 * are simply skipped as samples. Returns null when there is no elevation data
 * to chart (no lines, or every point lacks an elevation).
 */
export function elevationProfile(doc: GpxDocument): ElevationProfile | null {
  const ordered: TrackPoint[] = [];
  for (const track of doc.tracks) {
    for (const segment of track.segments) ordered.push(...segment.points);
  }
  for (const route of doc.routes) ordered.push(...route.points);

  if (ordered.length < 2) return null;

  const points: ElevationProfilePoint[] = [];
  let distanceM = 0;
  let minElevationM = Infinity;
  let maxElevationM = -Infinity;
  let totalClimbM = 0;
  let totalDescentM = 0;
  let previousElevation: number | undefined;

  for (let i = 0; i < ordered.length; i++) {
    const point = ordered[i];
    if (i > 0) distanceM += haversineDistanceMeters(ordered[i - 1], point);

    if (point.ele === undefined || !Number.isFinite(point.ele)) continue;

    points.push({ distanceM, elevationM: point.ele });
    minElevationM = Math.min(minElevationM, point.ele);
    maxElevationM = Math.max(maxElevationM, point.ele);
    if (previousElevation !== undefined) {
      const delta = point.ele - previousElevation;
      if (delta > 0) totalClimbM += delta;
      else totalDescentM += -delta;
    }
    previousElevation = point.ele;
  }

  if (points.length === 0) return null;

  return {
    points,
    totalDistanceM: distanceM,
    minElevationM,
    maxElevationM,
    totalClimbM,
    totalDescentM,
  };
}