import { useEffect } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { Box, HStack, Text } from "@chakra-ui/react";
import type { GpxDocument, GeoBounds } from "../../lib/types/gpx";
import { DirectionMarkers } from "./DirectionMarkers";

import "leaflet/dist/leaflet.css";

export const TRACK_COLOR = "#2563eb";
export const ROUTE_COLOR = "#059669";
export const DIRECTION_COLOR = "000000";
export const WAYPOINT_COLOR = "#d97706";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const WORLD_CENTER: [number, number] = [20, 0];

interface MapViewProps {
  doc: GpxDocument;
  bounds: GeoBounds | null;
}

/**
 * Pure view of a parsed GPX document. Phase 2 editing will turn tracks and
 * waypoints into draggable/interactive layers on top of this map.
 */
export function MapView({ doc, bounds }: MapViewProps) {
  const hasGeometry = doc.tracks.length > 0 || doc.routes.length > 0 || doc.waypoints.length > 0;

  // Lines are collected once so polylines and their direction arrows share geometry.
  const trackLines = doc.tracks.flatMap((track, trackIndex) =>
    track.segments
      .filter((segment) => segment.points.length > 1)
      .map((segment, segmentIndex) => ({
        key: `t${trackIndex}-${segmentIndex}`,
        latlngs: segment.points.map(toLatLng),
      })),
  );
  const routeLines = doc.routes
    .filter((route) => route.points.length > 1)
    .map((route, routeIndex) => ({
      key: `r${routeIndex}`,
      latlngs: route.points.map(toLatLng),
    }));

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
        {trackLines.map((line) => (
          <Polyline
            key={line.key}
            positions={line.latlngs}
            pathOptions={{ color: TRACK_COLOR, weight: 4, opacity: 0.85 }}
          />
        ))}
        {trackLines.map((line) => (
          <DirectionMarkers key={`${line.key}-dir`} latlngs={line.latlngs} color={DIRECTION_COLOR} />
        ))}
        {routeLines.map((line) => (
          <Polyline
            key={line.key}
            positions={line.latlngs}
            pathOptions={{ color: ROUTE_COLOR, weight: 3, opacity: 0.85, dashArray: "6 8" }}
          />
        ))}
        {routeLines.map((line) => (
          <DirectionMarkers key={`${line.key}-dir`} latlngs={line.latlngs} color={ROUTE_COLOR} />
        ))}
        {doc.waypoints.map((waypoint, index) => (
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
