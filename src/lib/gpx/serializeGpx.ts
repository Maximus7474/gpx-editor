import type { GpxDocument, Waypoint } from "../types/gpx";
import { type EditorPoint, type EditorWaypoint, waypointCategory } from "../types/trace";

/**
 * Serialize an in-memory `GpxDocument` back to GPX 1.1 XML (Phase 2 editing).
 * The trace editor builds documents via `traceToGpxDocument`; the resulting
 * XML is written by Rust commands (`save_trace` / `write_trace_to_path`) and
 * re-parsed on open by `parseGpx`, so the two stay symmetric.
 */

export function traceToGpxDocument(
  name: string,
  points: EditorPoint[],
  waypoints: EditorWaypoint[],
): GpxDocument {
  const doc: GpxDocument = {
    metadata: { name },
    tracks: [],
    routes: [],
    waypoints: [],
  };
  if (points.length > 0) {
    doc.tracks = [
      {
        name,
        segments: [
          {
            points: points.map((point) => {
              const result: { lat: number; lon: number; ele?: number } = {
                lat: point.lat,
                lon: point.lon,
              };
              if (point.ele !== undefined) result.ele = point.ele;
              return result;
            }),
          },
        ],
      },
    ];
  }
  doc.waypoints = waypoints.map((waypoint): Waypoint => {
    const result: Waypoint = { lat: waypoint.lat, lon: waypoint.lon };
    const name = waypoint.name?.trim();
    if (name) result.name = name;
    result.type = waypointCategory(waypoint.category).label;
    return result;
  });
  return doc;
}

export function serializeGpxDocument(doc: GpxDocument): string {
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="GPX Editor" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`,
  ];

  if (doc.metadata.name) {
    lines.push("  <metadata>", `    <name>${escapeXml(doc.metadata.name)}</name>`, "  </metadata>");
  }

  for (const track of doc.tracks) {
    lines.push("  <trk>");
    if (track.name) lines.push(`    <name>${escapeXml(track.name)}</name>`);
    for (const segment of track.segments) {
      lines.push("    <trkseg>");
      for (const point of segment.points) {
        if (point.ele !== undefined) {
          lines.push(
            `      <trkpt lat="${formatCoord(point.lat)}" lon="${formatCoord(point.lon)}"><ele>${formatCoord(point.ele)}</ele></trkpt>`,
          );
        } else {
          lines.push(
            `      <trkpt lat="${formatCoord(point.lat)}" lon="${formatCoord(point.lon)}" />`,
          );
        }
      }
      lines.push("    </trkseg>");
    }
    lines.push("  </trk>");
  }

  for (const waypoint of doc.waypoints) {
    lines.push(`  <wpt lat="${formatCoord(waypoint.lat)}" lon="${formatCoord(waypoint.lon)}">`);
    if (waypoint.name) lines.push(`    <name>${escapeXml(waypoint.name)}</name>`);
    if (waypoint.type) lines.push(`    <type>${escapeXml(waypoint.type)}</type>`);
    lines.push("  </wpt>");
  }

  lines.push("</gpx>");
  return lines.join("\n");
}

function formatCoord(value: number): string {
  return value.toFixed(6);
}

/** Escape text/attribute content for XML (order matters: `&` first). */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
