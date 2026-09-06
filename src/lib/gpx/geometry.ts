import type { GeoBounds, GpxDocument, TrackPoint } from "../types/gpx";

/** Great-circle distance in meters between two lat/lon points (haversine). */
export function haversineDistanceMeters(
  a: Pick<TrackPoint, "lat" | "lon">,
  b: Pick<TrackPoint, "lat" | "lon">,
): number {
  const EARTH_RADIUS_M = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Project a target point onto a polyline: the distance along it (meters) of
 * the closest point, plus how far off the line the target sits. Null when the
 * polyline has fewer than two points. Used to express where waypoints sit on
 * the trace (km markers, profile markers, list readouts).
 */
export function distanceAlongTraceM(
  points: Array<Pick<TrackPoint, "lat" | "lon">>,
  target: Pick<TrackPoint, "lat" | "lon">,
): { alongM: number; offM: number } | null {
  if (points.length < 2) return null;

  // Cumulative geodesic distance at each vertex.
  const cumulative = new Array<number>(points.length);
  cumulative[0] = 0;
  for (let i = 1; i < points.length; i++) {
    cumulative[i] = cumulative[i - 1] + haversineDistanceMeters(points[i - 1], points[i]);
  }

  // Project onto each segment with a local planar approximation (fine at the
  // meter scale of one segment).
  const toLocal = (point: { lat: number; lon: number }, origin: { lat: number; lon: number }) => {
    const METERS_PER_DEGREE_LAT = 110_540;
    const cosLat = Math.cos((origin.lat * Math.PI) / 180);
    return {
      x: (point.lon - origin.lon) * METERS_PER_DEGREE_LAT * cosLat,
      y: (point.lat - origin.lat) * METERS_PER_DEGREE_LAT,
    };
  };

  let best: { alongM: number; offM: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const origin = a;
    const p = toLocal(target, origin);
    const segment = toLocal(b, origin);
    const length2 = segment.x * segment.x + segment.y * segment.y;
    let t = 0;
    if (length2 > 0) {
      t = (p.x * segment.x + p.y * segment.y) / length2;
      t = Math.max(0, Math.min(1, t));
    }
    const closest = { x: segment.x * t, y: segment.y * t };
    const dx = p.x - closest.x;
    const dy = p.y - closest.y;
    const offM = Math.sqrt(dx * dx + dy * dy);
    const alongM = cumulative[i] + t * haversineDistanceMeters(a, b);
    if (best === null || offM < best.offM) best = { alongM, offM };
  }
  return best;
}

/** Union of every coordinate in the document, for framing the map view. */
export function documentBounds(doc: GpxDocument): GeoBounds | null {
  const points: TrackPoint[] = [];
  for (const track of doc.tracks) {
    for (const segment of track.segments) points.push(...segment.points);
  }
  for (const route of doc.routes) points.push(...route.points);
  for (const waypoint of doc.waypoints) points.push(waypoint);

  if (points.length === 0) return null;

  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const { lat, lon } of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  return { minLat, minLon, maxLat, maxLon };
}
