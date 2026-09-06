import type { GeoBounds, GpxDocument, TrackPoint } from "../types/gpx";

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
