import L, { type LeafletMouseEvent } from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  distanceAlongTraceM,
  haversineDistanceMeters,
  projectPointOnSegment,
} from "../../lib/gpx/geometry";
import { useTraceEditorStore } from "../../lib/stores/traceEditorStore";
import { type EditorPoint, type EditorWaypoint, waypointCategory } from "../../lib/types/trace";

import "leaflet/dist/leaflet.css";

export const TRACE_COLOR = "#2563eb";
export const SELECT_COLOR = "#f59e0b";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const WORLD_CENTER: [number, number] = [20, 0];

const VERTEX_RADIUS = 5;

/**
 * Map canvas of the trace editor. Click behavior depends on the active tool:
 * "add-point" appends a route position, "add-waypoint" drops a waypoint,
 * "select" picks (or clears) the selection. Vertices render as small circles,
 * waypoints as draggable category-colored markers.
 */
export function EditorMap({ onEditWaypoint }: { onEditWaypoint: (id: string) => void }) {
  const points = useTraceEditorStore((s) => s.points);
  const waypoints = useTraceEditorStore((s) => s.waypoints);
  const hover = useTraceEditorStore((s) => s.hover);
  // Each waypoint's distance along the drawn trace, for the km label.
  const waypointKm = useMemo(() => {
    const map = new Map<string, number>();
    for (const waypoint of waypoints) {
      const projected = distanceAlongTraceM(points, waypoint);
      if (projected) map.set(waypoint.id, projected.alongM);
    }
    return map;
  }, [points, waypoints]);
  const hoverSegmentIndex =
    hover?.kind === "segment" && hover.index < points.length - 1 ? hover.index : null;

  return (
    <MapContainer
      center={WORLD_CENTER}
      zoom={2}
      style={{ height: "100%", width: "100%" }}
      attributionControl
    >
      <TileLayer
        url={TILE_URL}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <MapClickLayer />
      <TraceCamera />
      {points.length > 1 && (
        <>
          <Polyline
            positions={points.map(toLatLng)}
            pathOptions={{ color: TRACE_COLOR, weight: 4, opacity: 0.9 }}
          />
          {/* The hovered stretch of the trace (list/elevation-chart cross-highlight). */}
          {hoverSegmentIndex !== null && (
            <Polyline
              positions={[
                toLatLng(points[hoverSegmentIndex]),
                toLatLng(points[hoverSegmentIndex + 1]),
              ]}
              pathOptions={{ color: SELECT_COLOR, weight: 6, opacity: 0.85, interactive: false }}
            />
          )}
          {/* Invisible hit areas: hovering a section lights it up (map + elevation
              chart), clicking it inserts a point at the projected spot, between
              the two vertices. */}
          {points.slice(0, -1).map((point, index) => (
            <SegmentHitLayer
              key={`${point.id}-${points[index + 1].id}`}
              a={point}
              b={points[index + 1]}
            />
          ))}
        </>
      )}
      {points.map((point, index) => (
        <VertexMarker key={point.id} index={index} lat={point.lat} lon={point.lon} />
      ))}
      {waypoints.map((waypoint) => (
        <WaypointMarker
          key={waypoint.id}
          waypoint={waypoint}
          km={waypointKm.get(waypoint.id) ?? null}
          onEditWaypoint={onEditWaypoint}
        />
      ))}
      <HoverHighlights />
    </MapContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Click routing + camera                                              */
/* ------------------------------------------------------------------ */

function MapClickLayer() {
  const tool = useTraceEditorStore((s) => s.tool);
  const addPosition = useTraceEditorStore((s) => s.addPosition);
  const addWaypoint = useTraceEditorStore((s) => s.addWaypoint);
  const select = useTraceEditorStore((s) => s.select);
  const map = useMap();

  // Clicks that end a map drag must not add geometry (Leaflet's own click
  // suppression is reliable for mouse drags; guard for touch too).
  const movedRef = useRef(false);

  useEffect(() => {
    const container = map.getContainer();
    const cursor = tool === "add-point" || tool === "add-waypoint" ? "crosshair" : "";
    container.style.cursor = cursor;
    return () => {
      container.style.cursor = "";
    };
  }, [map, tool]);

  useMapEvents({
    click: (event) => {
      if (movedRef.current) return;
      const { lat, lng } = event.latlng;
      if (tool === "add-point") addPosition(lat, lng);
      else if (tool === "add-waypoint") addWaypoint(lat, lng);
      else select(null);
    },
    dragstart: () => {
      movedRef.current = true;
    },
    dragend: () => {
      // The browser fires a click shortly after the drag gesture ends.
      window.setTimeout(() => {
        movedRef.current = false;
      }, 0);
    },
  });
  return null;
}

/** Zoom to the first placed point, fit the whole trace when requested. */
function TraceCamera() {
  const points = useTraceEditorStore((s) => s.points);
  const fitSignal = useTraceEditorStore((s) => s.fitSignal);
  const map = useMap();
  const previousCount = useRef(0);
  // The last fitSignal this camera acted on. The fit effect also re-runs on
  // every points change, so without this guard any edit after a fit (or after
  // loading a file) would zoom out to refit the whole trace.
  const handledFitSignal = useRef(0);

  useEffect(() => {
    if (points.length === 0) return;
    if (previousCount.current === 0 && points.length === 1) {
      map.setView(toLatLng(points[0]), 15, { animate: true });
    }
    previousCount.current = points.length;
  }, [map, points]);

  useEffect(() => {
    // Fit only when the signal advances (the toolbar button or a file load),
    // never as a side effect of editing the trace.
    if (fitSignal === 0 || fitSignal === handledFitSignal.current) return;
    handledFitSignal.current = fitSignal;
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points.map(toLatLng)), { padding: [44, 44] });
    } else if (points.length === 1) {
      map.setView(toLatLng(points[0]), 16, { animate: true });
    }
  }, [fitSignal, map, points]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Vertices (draggable so they can be moved by hand)                   */
/* ------------------------------------------------------------------ */

function VertexMarker({ index, lat, lon }: { index: number; lat: number; lon: number }) {
  const selected = useTraceEditorStore(
    (s) => s.selected?.kind === "point" && s.selected.index === index,
  );
  const select = useTraceEditorStore((s) => s.select);
  const setHover = useTraceEditorStore((s) => s.setHover);
  const movePoint = useTraceEditorStore((s) => s.movePoint);

  function handleClick(event: LeafletMouseEvent) {
    L.DomEvent.stopPropagation(event.originalEvent);
    select({ kind: "point", index });
  }

  return (
    <Marker
      position={[lat, lon]}
      icon={vertexDivIcon(selected)}
      draggable
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{
        click: handleClick,
        mouseover: () => setHover({ kind: "point", index }),
        mouseout: () => setHover(null),
        dragend: (event) => {
          const position = (event.target as L.Marker).getLatLng();
          movePoint(index, position.lat, position.lng);
        },
      }}
    />
  );
}

const VERTEX_ICON_SIZE = 10;
const VERTEX_SELECTED_SIZE = 14;
const VERTEX_ICONS = new Map<string, L.DivIcon>();

/** Small circle for a route vertex — a divIcon so the marker can be dragged. */
function vertexDivIcon(selected: boolean): L.DivIcon {
  const key = selected ? "selected" : "plain";
  const cached = VERTEX_ICONS.get(key);
  if (cached) return cached;
  const size = selected ? VERTEX_SELECTED_SIZE : VERTEX_ICON_SIZE;
  const icon = L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#2563eb;border:${selected ? "2.5px solid #f59e0b" : "1.5px solid #ffffff"};box-shadow:0 1px 2px rgba(0,0,0,0.3);"></div>`,
    iconAnchor: [size / 2, size / 2],
  });
  VERTEX_ICONS.set(key, icon);
  return icon;
}

/* ------------------------------------------------------------------ */
/* Trace sections (between two vertices)                               */
/* ------------------------------------------------------------------ */

/**
 * Invisible hit area along one stretch of the trace (points `a` and `b`).
 * Which stretch was actually hit is resolved globally — near a shared vertex
 * the ±5 px band of two adjacent segments overlaps, and Leaflet's renderer
 * would otherwise report the topmost one instead of the nearest.
 */
function SegmentHitLayer({ a, b }: { a: EditorPoint; b: EditorPoint }) {
  const setHover = useTraceEditorStore((s) => s.setHover);
  const insertPosition = useTraceEditorStore((s) => s.insertPosition);
  const points = useTraceEditorStore((s) => s.points);

  function handleClick(event: LeafletMouseEvent) {
    // Stop the DOM event AND Leaflet's own path→map propagation (the renderer
    // checks `originalEvent._stopped` after each target), so the map click
    // layer doesn't also append a point.
    L.DomEvent.stopPropagation(event.originalEvent);
    L.DomEvent.stopPropagation(event);
    const nearest = nearestSegment(points, event.latlng);
    if (!nearest) return;
    insertPosition(
      nearest.index + 1,
      nearest.proj.lat,
      nearest.proj.lon,
      avgEle(points[nearest.index], points[nearest.index + 1]),
    );
  }

  return (
    <Polyline
      positions={[toLatLng(a), toLatLng(b)]}
      pathOptions={{ color: "transparent", weight: 10 }}
      eventHandlers={{
        mouseover: (event) => {
          const nearest = nearestSegment(points, event.latlng);
          if (nearest) setHover({ kind: "segment", index: nearest.index });
        },
        mouseout: () => setHover(null),
        click: handleClick,
      }}
    />
  );
}

/**
 * The stretch of the trace nearest to a map point: its segment index, the
 * projected insertion point, and how far off the line it sits (meters).
 */
function nearestSegment(
  points: EditorPoint[],
  latlng: { lat: number; lng: number },
): { index: number; proj: { lat: number; lon: number }; offM: number } | null {
  let best: { index: number; proj: { lat: number; lon: number }; offM: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const proj = projectPointOnSegment(points[i], points[i + 1], {
      lat: latlng.lat,
      lon: latlng.lng,
    });
    const offM = haversineDistanceMeters(proj, { lat: latlng.lat, lon: latlng.lng });
    if (!best || offM < best.offM) best = { index: i, proj, offM };
  }
  return best;
}

/** Average elevation of two neighbors, when both carry one (for inserted midpoints). */
function avgEle(a: EditorPoint | undefined, b: EditorPoint | undefined): number | undefined {
  if (a?.ele !== undefined && b?.ele !== undefined) return (a.ele + b.ele) / 2;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Waypoints                                                           */
/* ------------------------------------------------------------------ */

function WaypointMarker({
  waypoint,
  km,
  onEditWaypoint,
}: {
  waypoint: EditorWaypoint;
  km: number | null;
  onEditWaypoint: (id: string) => void;
}) {
  const selected = useTraceEditorStore(
    (s) => s.selected?.kind === "waypoint" && s.selected.id === waypoint.id,
  );
  const select = useTraceEditorStore((s) => s.select);
  const moveWaypoint = useTraceEditorStore((s) => s.moveWaypoint);
  const category = waypointCategory(waypoint.category);

  const icon = waypointDivIcon(category.color, selected, km);

  function handleClick(event: LeafletMouseEvent) {
    L.DomEvent.stopPropagation(event.originalEvent);
    select({ kind: "waypoint", id: waypoint.id });
  }

  return (
    <Marker
      position={[waypoint.lat, waypoint.lon]}
      icon={icon}
      draggable
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{
        click: handleClick,
        dblclick: (event) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          onEditWaypoint(waypoint.id);
        },
        dragend: (event) => {
          const position = (event.target as L.Marker).getLatLng();
          moveWaypoint(waypoint.id, position.lat, position.lng);
        },
      }}
    />
  );
}

const WAYPOINT_ICON_SIZE = 22;
const WAYPOINT_ICONS = new Map<string, L.DivIcon>();

function waypointDivIcon(color: string, selected: boolean, km: number | null): L.DivIcon {
  const kmLabel = km !== null ? `km ${(km / 1000).toFixed(1)}` : null;
  const key = `${color}-${selected ? "1" : "0"}-${kmLabel ?? ""}`;
  const cached = WAYPOINT_ICONS.get(key);
  if (cached) return cached;
  const border = selected ? "3px solid #f59e0b" : "2px solid #ffffff";
  const labelHtml = kmLabel
    ? `<div style="margin-top:2px;background:rgba(255,255,255,0.85);color:#18181b;font:600 10px/1.2 system-ui,sans-serif;padding:1px 4px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.2);white-space:nowrap;">${kmLabel}</div>`
    : "";
  const icon = L.divIcon({
    className: "",
    html: `<div title="" style="display:flex;flex-direction:column;align-items:center;"><div style="width:${WAYPOINT_ICON_SIZE}px;height:${WAYPOINT_ICON_SIZE}px;border-radius:50%;background:${color};border:${border};box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>${labelHtml}</div>`,
    iconAnchor: [WAYPOINT_ICON_SIZE / 2, WAYPOINT_ICON_SIZE / 2],
  });
  WAYPOINT_ICONS.set(key, icon);
  return icon;
}

/* ------------------------------------------------------------------ */
/* Hover cross-highlight (details panel -> map)                        */
/* ------------------------------------------------------------------ */

function HoverHighlights() {
  const hover = useTraceEditorStore((s) => s.hover);
  const selected = useTraceEditorStore((s) => s.selected);
  const points = useTraceEditorStore((s) => s.points);
  const waypoints = useTraceEditorStore((s) => s.waypoints);

  const selectedPointIndex = selected?.kind === "point" ? selected.index : null;
  const hoverPoint = hover?.kind === "point" ? points[hover.index] : undefined;
  const hoveredWaypoint =
    hover?.kind === "waypoint" ? waypoints.find((waypoint) => waypoint.id === hover.id) : undefined;

  const selectedWaypoint =
    selected?.kind === "waypoint"
      ? waypoints.find((waypoint) => waypoint.id === selected.id)
      : undefined;

  return (
    <>
      {hoverPoint && hover?.kind === "point" && hover.index !== selectedPointIndex && (
        <CircleMarker
          center={[hoverPoint.lat, hoverPoint.lon]}
          radius={VERTEX_RADIUS + 4}
          pathOptions={{
            color: SELECT_COLOR,
            weight: 2,
            fill: false,
            interactive: false,
          }}
        />
      )}
      {hoveredWaypoint && (
        <CircleMarker
          center={[hoveredWaypoint.lat, hoveredWaypoint.lon]}
          radius={WAYPOINT_ICON_SIZE / 2 + 2}
          pathOptions={{
            color: waypointCategory(hoveredWaypoint.category).color,
            weight: 2.5,
            fill: false,
            interactive: false,
          }}
        />
      )}
      {selectedWaypoint && !hoveredWaypoint && (
        <CircleMarker
          center={[selectedWaypoint.lat, selectedWaypoint.lon]}
          radius={WAYPOINT_ICON_SIZE / 2 + 2}
          pathOptions={{
            color: SELECT_COLOR,
            weight: 2,
            dashArray: "2 2",
            fill: false,
            interactive: false,
          }}
        />
      )}
    </>
  );
}

function toLatLng(point: { lat: number; lon: number }): [number, number] {
  return [point.lat, point.lon];
}
