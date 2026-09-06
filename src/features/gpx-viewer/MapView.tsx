import { memo, useEffect, useMemo, useRef } from "react";
import L, { type LeafletMouseEvent } from "leaflet";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { Box, HStack, Text } from "@chakra-ui/react";
import type { GpxDocument, GeoBounds, Waypoint } from "../../lib/types/gpx";
import { buildOrderedPath, positionAtDistance, type OrderedPath } from "../../lib/gpx/path";
import { DirectionMarkers } from "./DirectionMarkers";

import "leaflet/dist/leaflet.css";

export const TRACK_COLOR = "#2563eb";
export const ROUTE_COLOR = "#059669";
export const DIRECTION_COLOR = "000000";
export const WAYPOINT_COLOR = "#d97706";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const WORLD_CENTER: [number, number] = [20, 0];

/** Cursor must land within this many screen pixels of the path to hover it. */
const HOVER_SNAP_PX = 12;

interface MapViewProps {
  doc: GpxDocument;
  bounds: GeoBounds | null;
  /** Position along the ordered path (meters) highlighted by the elevation
      chart, if any. Owned by the viewer page so both panels share it. */
  hoverDistanceM: number | null;
  onHoverChange: (distanceM: number | null) => void;
}

/**
 * Map view of a parsed GPX document, hover-linked with the elevation chart:
 * hovering the drawn path highlights the same spot on the chart and vice
 * versa (both express the position as meters along the shared ordered path).
 * Phase 2 editing will turn tracks and waypoints into draggable/interactive
 * layers on top of this map.
 */
export function MapView({ doc, bounds, hoverDistanceM, onHoverChange }: MapViewProps) {
  const hasTrackOrRoute = doc.tracks.length > 0 || doc.routes.length > 0;
  const hasGeometry = hasTrackOrRoute || doc.waypoints.length > 0;
  // Flattened ordered geometry shared with the elevation chart. Referentially
  // stable per document so the static map layers can bail out of re-renders
  // while the hover position updates on every mouse move.
  const path = useMemo(() => buildOrderedPath(doc), [doc]);

  return (
    <Box position="relative" h="full" w="full">
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
        <FitBounds bounds={bounds} />
        {path && <StaticLayers path={path} waypoints={doc.waypoints} />}
        {path && (
          <MapInteractions path={path} hoverDistanceM={hoverDistanceM} onHoverChange={onHoverChange} />
        )}
      </MapContainer>

      {!hasGeometry && (
        <Box
          position="absolute"
          inset="0"
          zIndex="1001"
          display="flex"
          alignItems="center"
          justifyContent="center"
          pointerEvents="none"
        >
          <Text bg="bg.panel" px="4" py="2" rounded="md" shadow="sm" textStyle="sm">
            This file contains no routable data to display.
          </Text>
        </Box>
      )}

      <HStack
        position="absolute"
        top="3"
        right="3"
        zIndex="1001"
        gap="3"
        bg="bg.panel"
        px="3"
        py="2"
        rounded="md"
        shadow="sm"
        borderWidth="1px"
        borderColor="border.subtle"
        textStyle="xs"
        color="fg.muted"
      >
        <LegendDot color={TRACK_COLOR} label="Track" />
        <LegendDot color={ROUTE_COLOR} label="Route" dashed />
        <LegendDot color={WAYPOINT_COLOR} label="Waypoint" />
      </HStack>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Static map layers (memoized: don't re-render on hover changes)      */
/* ------------------------------------------------------------------ */

interface StaticLayersProps {
  path: OrderedPath;
  waypoints: Waypoint[];
}

const StaticLayers = memo(function StaticLayers({ path, waypoints }: StaticLayersProps) {
  return (
    <>
      {path.runs.map((run, runIndex) =>
        run.points.length > 1 ? (
          <LineGroup
            key={runIndex}
            kind={run.kind}
            latlngs={run.points.map(toLatLng)}
            color={run.kind === "track" ? DIRECTION_COLOR : ROUTE_COLOR}
          />
        ) : null,
      )}
      {waypoints.map((waypoint, index) => (
        <CircleMarker
          key={`w${index}`}
          center={[waypoint.lat, waypoint.lon]}
          radius={6}
          pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: WAYPOINT_COLOR, fillOpacity: 0.9 }}
        >
          <Popup>
            <Box textStyle="sm">
              <Text fontWeight="bold">{waypoint.name ?? `Waypoint ${index + 1}`}</Text>
              <Text color="fg.muted">
                {waypoint.lat.toFixed(5)}, {waypoint.lon.toFixed(5)}
              </Text>
              {waypoint.ele !== undefined && <Text color="fg.muted">Ele: {waypoint.ele} m</Text>}
            </Box>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
});

function LineGroup({
  kind,
  latlngs,
  color,
}: {
  kind: "track" | "route";
  latlngs: [number, number][];
  color: string;
}) {
  return (
    <>
      <Polyline
        positions={latlngs}
        pathOptions={{
          color: kind === "track" ? TRACK_COLOR : ROUTE_COLOR,
          weight: kind === "track" ? 4 : 3,
          opacity: 0.85,
          dashArray: kind === "route" ? "6 8" : undefined,
          interactive: false,
        }}
      />
      <DirectionMarkers latlngs={latlngs} color={color} />
    </>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <HStack gap="1.5">
      <Box
        w="3"
        h={dashed ? "0" : "3"}
        borderTopWidth={dashed ? "2px" : undefined}
        borderTopColor={dashed ? color : undefined}
        bg={dashed ? undefined : color}
        rounded="full"
      />
      <Text>{label}</Text>
    </HStack>
  );
}

/* ------------------------------------------------------------------ */
/* Hover interactions                                                  */
/* ------------------------------------------------------------------ */

interface MapInteractionsProps {
  path: OrderedPath;
  hoverDistanceM: number | null;
  onHoverChange: (distanceM: number | null) => void;
}

function MapInteractions({ path, hoverDistanceM, onHoverChange }: MapInteractionsProps) {
  const map = useMap();
  const cacheRef = useRef<Float64Array | null>(null);

  // Screen-space coordinates of every path vertex, refreshed whenever the
  // view settles so the hover math below never touches the projection API.
  useEffect(() => {
    const refresh = () => {
      const cache = new Float64Array(path.points.length * 2);
      for (let i = 0; i < path.points.length; i++) {
        const pt = map.latLngToContainerPoint([path.points[i].lat, path.points[i].lon]);
        cache[2 * i] = pt.x;
        cache[2 * i + 1] = pt.y;
      }
      cacheRef.current = cache;
    };
    refresh();
    map.on("moveend", refresh);
    map.on("zoomend", refresh);
    return () => {
      map.off("moveend", refresh);
      map.off("zoomend", refresh);
    };
  }, [map, path]);

  // Hovering the path reports the nearest distance along it; leaving the map
  // (or starting a drag) clears the shared highlight.
  const draggingRef = useRef(false);
  useEffect(() => {
    const onMove = (event: LeafletMouseEvent) => {
      if (draggingRef.current) return;
      const cache = cacheRef.current;
      if (!cache) return;
      const distance = nearestDistanceM(path, cache, event.containerPoint.x, event.containerPoint.y);
      onHoverChange(distance);
    };
    const startDrag = () => {
      draggingRef.current = true;
      onHoverChange(null);
    };
    const endDrag = () => {
      draggingRef.current = false;
    };
    map.on("mousemove", onMove);
    map.on("dragstart", startDrag);
    map.on("dragend", endDrag);
    const container = map.getContainer();
    const onLeave = () => onHoverChange(null);
    container.addEventListener("pointerleave", onLeave);
    return () => {
      map.off("mousemove", onMove);
      map.off("dragstart", startDrag);
      map.off("dragend", endDrag);
      container.removeEventListener("pointerleave", onLeave);
    };
  }, [map, path, onHoverChange]);

  // When the highlight comes from the chart and lands off-screen, pan so the
  // map keeps showing the position being explored.
  useEffect(() => {
    if (hoverDistanceM === null) return;
    const { lat, lon } = positionAtDistance(path, hoverDistanceM);
    if (!map.getBounds().contains([lat, lon])) {
      map.panTo([lat, lon], { animate: true, duration: 0.3 });
    }
  }, [map, path, hoverDistanceM]);

  const hover = hoverDistanceM !== null ? positionAtDistance(path, hoverDistanceM) : null;

  return hover ? (
    <CircleMarker
      center={[hover.lat, hover.lon]}
      radius={6}
      pathOptions={{
        color: "#18181b",
        weight: 3,
        fillColor: "#ffffff",
        fillOpacity: 1,
        interactive: false,
      }}
    />
  ) : null;
}

/**
 * Project the cursor onto the drawn path in screen space and return the
 * distance (meters) of the closest point, or null when nothing is within
 * `HOVER_SNAP_PX` pixels. The interpolation fraction found on screen is used
 * against the precomputed geodesic distances of the segment — visually the
 * same spot, no matter how the map is zoomed.
 */
function nearestDistanceM(path: OrderedPath, cache: Float64Array, x: number, y: number): number | null {
  const tolerance2 = HOVER_SNAP_PX * HOVER_SNAP_PX;
  let best2 = Infinity;
  let bestIndex = -1;
  let bestT = 0;

  for (let runIndex = 0; runIndex < path.runs.length; runIndex++) {
    const run = path.runs[runIndex];
    const count = run.points.length;
    if (count < 2) continue;
    const start = path.runStart[runIndex];
    let ax = cache[2 * start];
    let ay = cache[2 * start + 1];
    for (let j = 0; j < count - 1; j++) {
      const i = start + j;
      const bx = cache[2 * (i + 1)];
      const by = cache[2 * (i + 1) + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const segment2 = dx * dx + dy * dy;
      let t = 0;
      if (segment2 > 0) {
        t = ((x - ax) * dx + (y - ay) * dy) / segment2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
      }
      const qx = ax + t * dx;
      const qy = ay + t * dy;
      const ox = x - qx;
      const oy = y - qy;
      const d2 = ox * ox + oy * oy;
      if (d2 < best2) {
        best2 = d2;
        bestIndex = i;
        bestT = t;
      }
      ax = bx;
      ay = by;
    }
  }

  if (best2 > tolerance2 || bestIndex < 0) return null;
  return path.dist[bestIndex] + bestT * (path.dist[bestIndex + 1] - path.dist[bestIndex]);
}

function FitBounds({ bounds }: { bounds: GeoBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    const latLngBounds = L.latLngBounds(
      [bounds.minLat, bounds.minLon],
      [bounds.maxLat, bounds.maxLon],
    );
    if (latLngBounds.isValid()) {
      map.fitBounds(latLngBounds, { padding: [28, 28] });
    }
  }, [map, bounds]);
  return null;
}

function toLatLng(point: { lat: number; lon: number }): [number, number] {
  return [point.lat, point.lon];
}
