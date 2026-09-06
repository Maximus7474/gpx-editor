import L from "leaflet";
import { Fragment } from "react";
import { Marker, Popup } from "react-leaflet";
import { haversineDistanceMeters } from "../../lib/gpx/geometry";
import type { OrderedPath } from "../../lib/gpx/path";

/** Start marker color (green). */
export const START_COLOR = "#22c55e";
/** Stop marker color (red). */
export const STOP_COLOR = "#ef4444";

/**
 * When a course's start and finish are closer than this (meters) their markers
 * would overlap on the map, so they are merged into a single half-green /
 * half-red marker. Covers closed loops and out-and-back courses, whose first
 * and last recorded points typically sit a few meters apart due to GPS noise.
 */
const OVERLAP_THRESHOLD_M = 25;

const ICON_SIZE = 24;

function courseIcon(
  background: string,
  contentHtml: string,
  title: string,
  fontSize = 10,
): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div title="${title}" style="width:${ICON_SIZE}px;height:${ICON_SIZE}px;border-radius:50%;background:${background};border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.4);font:700 ${fontSize}px/1 system-ui,sans-serif;color:#ffffff;">${contentHtml}</div>`,
    iconSize: [ICON_SIZE, ICON_SIZE],
    iconAnchor: [ICON_SIZE / 2, ICON_SIZE / 2],
    popupAnchor: [0, -ICON_SIZE / 2],
  });
}

const START_ICON = courseIcon(START_COLOR, "S", "Start");
const STOP_ICON = courseIcon(STOP_COLOR, "F", "Finish");
const COMBINED_ICON = courseIcon(
  `linear-gradient(to right, ${START_COLOR} 0 50%, ${STOP_COLOR} 50% 100%)`,
  `<span style="flex:1;text-align:center;">S</span><span style="flex:1;text-align:center;">F</span>`,
  "Start & Finish",
  8,
);

interface CourseMarkersProps {
  path: OrderedPath;
}

/**
 * Start (green "S") and finish (red "F") markers for every course — each track
 * segment and route drawn on the map. When a course's start and finish share
 * (or nearly share) a position — closed loops, out-and-backs — the two are
 * merged into a single half-green / half-red marker.
 */
export function CourseMarkers({ path }: CourseMarkersProps) {
  return (
    <>
      {path.runs.map((run, runIndex) => {
        if (run.points.length === 0) return null;
        const start = run.points[0];
        const end = run.points[run.points.length - 1];
        const key = path.runStart[runIndex];
        const merged = haversineDistanceMeters(start, end) <= OVERLAP_THRESHOLD_M;
        if (merged) {
          return (
            <Marker
              key={`${key}-start-finish`}
              position={[start.lat, start.lon]}
              icon={COMBINED_ICON}
            >
              <Popup>Start &amp; Finish</Popup>
            </Marker>
          );
        }
        return (
          <Fragment key={key}>
            <Marker position={[start.lat, start.lon]} icon={START_ICON}>
              <Popup>Start</Popup>
            </Marker>
            <Marker position={[end.lat, end.lon]} icon={STOP_ICON}>
              <Popup>Finish</Popup>
            </Marker>
          </Fragment>
        );
      })}
    </>
  );
}
