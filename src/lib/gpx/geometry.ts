import type { GeoBounds, GpxDocument, TrackPoint } from "../types/gpx";

/** Great-circle distance in meters between two lat/lon points (haversine). */
export function haversineDistanceMeters(a: Pick<TrackPoint, "lat" | "lon">, b: Pick<TrackPoint, "lat" | "lon">): number {
  const EARTH_RADIUS_M = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
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
