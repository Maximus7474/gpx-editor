/**
 * In-memory shapes of a parsed GPX file, mirroring ARCHITECTURE.md. These are
 * the single shared types consumed by the viewer now and — in Phase 2 — by the
 * editing/serialization code, which will reuse this module to go back to XML.
 */

export interface TrackPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
}

export interface TrackSegment {
  points: TrackPoint[];
}

export interface Track {
  name?: string;
  segments: TrackSegment[];
}

export interface Route {
  name?: string;
  points: TrackPoint[];
}

export interface Waypoint extends TrackPoint {
  name?: string;
}

export interface GpxDocument {
  metadata: {
    name?: string;
    description?: string;
    time?: string;
  };
  tracks: Track[];
  routes: Route[];
  waypoints: Waypoint[];
}

/** Simple lat/lon box used to frame the map. */
export interface GeoBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}
