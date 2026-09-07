import type { GpxDocument, Route, Track, TrackPoint, Waypoint } from "../types/gpx";

/**
 * Parse GPX XML (read from disk via a Rust command) into the shared
 * `GpxDocument` shape using the WebView's built-in XML DOM parser — no extra
 * dependency. Namespaces are ignored on purpose: `getElementsByTagName`
 * matches local names whether or not the file declares a GPX namespace.
 *
 * Phase 2 note: editing will keep this as the single in-memory source of
 * truth and add a serializer (GpxDocument -> XML) beside it.
 */
export function parseGpx(xml: string): GpxDocument {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The file is not valid XML.");
  }

  const metadataEl = first(doc, "metadata");

  const tracks: Track[] = Array.from(doc.getElementsByTagName("trk")).map((trk) => {
    const trackName = text(child(trk, "name"));
    const segments = Array.from(trk.getElementsByTagName("trkseg")).map((seg) => ({
      points: Array.from(seg.getElementsByTagName("trkpt")).map(parsePoint),
    }));
    return { name: trackName, segments };
  });

  const routes: Route[] = Array.from(doc.getElementsByTagName("rte")).map((rte) => {
    const routeName = text(child(rte, "name"));
    const points = Array.from(rte.getElementsByTagName("rtept")).map(parsePoint);
    return { name: routeName, points };
  });

  const waypoints: Waypoint[] = Array.from(doc.getElementsByTagName("wpt")).map((wpt) => {
    const point = parsePoint(wpt);
    const waypoint: Waypoint = { ...point };
    const name = text(child(wpt, "name"));
    if (name !== undefined) waypoint.name = name;
    const type = text(child(wpt, "type"));
    if (type !== undefined) waypoint.type = type;
    return waypoint;
  });

  return {
    metadata: {
      name: metadataEl ? text(child(metadataEl, "name")) : undefined,
      description: metadataEl ? text(child(metadataEl, "desc")) : undefined,
      time: metadataEl ? text(child(metadataEl, "time")) : undefined,
    },
    tracks,
    routes,
    waypoints,
  };
}

function parsePoint(el: Element): TrackPoint {
  const lat = Number(el.getAttribute("lat"));
  const lon = Number(el.getAttribute("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Track/waypoint is missing valid lat/lon coordinates.");
  }
  const point: TrackPoint = { lat, lon };
  const ele = text(child(el, "ele"));
  if (ele !== undefined) point.ele = Number(ele);
  const time = text(child(el, "time"));
  if (time !== undefined) point.time = time;
  return point;
}

/** First matching element under `root` (or under the document). */
function first(root: Document | Element, tag: string): Element | undefined {
  const list = root.getElementsByTagName(tag);
  return list.length > 0 ? list[0] : undefined;
}

/** First direct child element with the given tag, if any. */
function child(parent: Element | undefined, tag: string): Element | undefined {
  if (!parent) return undefined;
  return Array.from(parent.children).find((c) => c.tagName === tag);
}

function text(el: Element | undefined): string | undefined {
  const value = el?.textContent?.trim();
  return value ? value : undefined;
}
