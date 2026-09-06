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
import { distanceAlongTraceM } from "../../lib/gpx/geometry";
import { useTraceEditorStore } from "../../lib/stores/traceEditorStore";
import { type EditorWaypoint, waypointCategory } from "../../lib/types/trace";

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
  // Each waypoint's distance along the drawn trace, for the km label.
  const waypointKm = useMemo(() => {
    const map = new Map<string, number>();
    for (const waypoint of waypoints) {
      const projected = distanceAlongTraceM(points, waypoint);
      if (projected) map.set(waypoint.id, projected.alongM);
    }
    return map;
  }, [points, waypoints]);

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
        <Polyline
          positions={points.map(toLatLng)}
          pathOptions={{ color: TRACE_COLOR, weight: 4, opacity: 0.9 }}
        />
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

  useEffect(() => {
    if (points.length === 0) return;
    if (previousCount.current === 0 && points.length === 1) {
      map.setView(toLatLng(points[0]), 15, { animate: true });
    }
    previousCount.current = points.length;
  }, [map, points]);

  useEffect(() => {
    if (fitSignal === 0) return;
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points.map(toLatLng)), { padding: [44, 44] });
    } else if (points.length === 1) {
      map.setView(toLatLng(points[0]), 16, { animate: true });
    }
  }, [fitSignal, map, points]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Vertices                                                            */
/* ------------------------------------------------------------------ */

function VertexMarker({ index, lat, lon }: { index: number; lat: number; lon: number }) {
  const selected = useTraceEditorStore(
    (s) => s.selected?.kind === "point" && s.selected.index === index,
  );
  const select = useTraceEditorStore((s) => s.select);

  function handleClick(event: LeafletMouseEvent) {
    L.DomEvent.stopPropagation(event.originalEvent);
    select({ kind: "point", index });
  }

  return (
    <CircleMarker
      center={[lat, lon]}
      radius={selected ? VERTEX_RADIUS + 2 : VERTEX_RADIUS}
      pathOptions={
        selected
          ? { color: SELECT_COLOR, weight: 2.5, fillColor: TRACE_COLOR, fillOpacity: 1 }
          : { color: "#ffffff", weight: 1.5, fillColor: TRACE_COLOR, fillOpacity: 1 }
      }
      eventHandlers={{ click: handleClick }}
    />
  );
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
