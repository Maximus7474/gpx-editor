import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import "leaflet-polylinedecorator";

interface DirectionMarkersProps {
  /** The line to decorate, ordered from start to end of travel. */
  latlngs: [number, number][];
  color: string;
}

/**
 * Arrowheads over a polyline showing the direction of travel. They are spaced
 * in screen pixels and redrawn when the map moves or zooms, so the interval
 * stays visually consistent at every zoom level. Arrow direction follows the
 * order of the coordinates, i.e. the recorded direction of the track/route.
 */
export function DirectionMarkers({ latlngs, color }: DirectionMarkersProps) {
  const map = useMap();

  useEffect(() => {
    if (latlngs.length < 2) return;
    // The decorator reads a Polyline's coordinates; the base line never touches the map.
    const baseLine = L.polyline(latlngs);
    const decorator = L.polylineDecorator(baseLine, {
      patterns: [
        {
          offset: 12,
          endOffset: 12,
          repeat: 170,
          symbol: L.Symbol.arrowHead({
            polygon: true,
            pixelSize: 10,
            headAngle: 45,
            pathOptions: {
              stroke: true,
              color: "#ffffff",
              weight: 1,
              fillColor: color,
              fillOpacity: 1,
            },
          }),
        },
      ],
    }).addTo(map);

    return () => {
      map.removeLayer(decorator);
    };
  }, [map, latlngs, color]);

  return null;
}
