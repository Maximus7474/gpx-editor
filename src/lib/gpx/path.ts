import type { GpxDocument, TrackPoint } from "../types/gpx";
import { haversineDistanceMeters } from "./geometry";

export interface PathRun {
  /** "track" runs are individual <trkseg> segments; a route is one whole run. */
  kind: "track" | "route";
  points: TrackPoint[];
}

/**
 * The recorded geometry flattened into one ordered sequence: every track
 * segment in file order, then every route. This ordering is shared by the
 * map, the elevation profile, and hover cross-linking between the two, so a
 * distance along the path means the same thing everywhere. Runs are the
 * contiguous slices of `points` that the map draws as separate polylines.
 */
export interface OrderedPath {
  runs: PathRun[];
  /** Every point in order (concatenation of `runs`). */
  points: TrackPoint[];
  /** Cumulative distance at each point: dist[0] = 0, dist[i] includes the
      haversine gap to point i-1, so consecutive segments/tracks stay linked. */
  dist: number[];
  totalM: number;
  /** Flat `points` index where each run begins (parallel to `runs`). */
  runStart: number[];
}

export function buildOrderedPath(doc: GpxDocument): OrderedPath | null {
  const runs: PathRun[] = [];
  for (const track of doc.tracks) {
    for (const segment of track.segments) {
      runs.push({ kind: "track", points: segment.points });
    }
  }
  for (const route of doc.routes) {
    runs.push({ kind: "route", points: route.points });
  }

  const points: TrackPoint[] = [];
  const runStart: number[] = [];
  for (const run of runs) {
    runStart.push(points.length);
    points.push(...run.points);
  }
  if (points.length < 2) return null;

  const dist = new Array<number>(points.length);
  dist[0] = 0;
  for (let i = 1; i < points.length; i++) {
    dist[i] = dist[i - 1] + haversineDistanceMeters(points[i - 1], points[i]);
  }

  return { runs, points, dist, totalM: dist[dist.length - 1], runStart };
}

/** The lat/lon on the ordered path at `distanceM` meters along it. */
export function positionAtDistance(path: OrderedPath, distanceM: number): { lat: number; lon: number } {
  const { points, dist } = path;
  if (distanceM <= 0 || points.length === 1) return points[0];
  if (distanceM >= path.totalM) return points[points.length - 1];

  // Rightmost point whose cumulative distance is still <= target.
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (dist[mid] <= distanceM) lo = mid;
    else hi = mid - 1;
  }

  const span = dist[lo + 1] - dist[lo];
  const t = span > 0 ? (distanceM - dist[lo]) / span : 0;
  return {
    lat: points[lo].lat + t * (points[lo + 1].lat - points[lo].lat),
    lon: points[lo].lon + t * (points[lo + 1].lon - points[lo].lon),
  };
}
