import { Box, Collapsible, HStack, Text } from "@chakra-ui/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useColorModeValue } from "../../components/ui/color-mode";
import { formatDistance } from "../../lib/format";
import { distanceAlongTraceM, haversineDistanceMeters } from "../../lib/gpx/geometry";
import { type ElevationProfile, elevationAtDistance } from "../../lib/gpx/profile";
import { traceLengthM, useTraceEditorStore } from "../../lib/stores/traceEditorStore";
import { type EditorPoint, type EditorWaypoint, waypointCategory } from "../../lib/types/trace";
import { SELECT_COLOR, TRACE_COLOR } from "./EditorMap";

const CHART_HEIGHT = 150;
const MARGIN = { top: 22, right: 16, bottom: 22 };
const MIN_Y_INSET = 40;

interface TraceElevationPanelProps {
  /** Real elevation samples; null when no point carries an elevation yet. */
  profile: ElevationProfile | null;
  points: EditorPoint[];
  waypoints: EditorWaypoint[];
  loading: boolean;
}

/**
 * Live elevation profile of the trace being drawn. Positions are enriched
 * with elevations as they are placed (see the store's `refreshElevations`);
 * the chart re-renders on every change. Each waypoint gets a marker at its
 * distance along the trace with a km label, so aid stations can be planned by
 * distance. Hovering the chart highlights the matching position on the map.
 * Without elevation data the chart degrades to a flat distance axis.
 */
export function TraceElevationPanel({
  profile,
  points,
  waypoints,
  loading,
}: TraceElevationPanelProps) {
  const [initialOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(max-width: 900px)").matches;
  });

  return (
    <Box
      bg="bg.panel"
      borderTopWidth="1px"
      borderColor="border.subtle"
      px={{ base: 3, md: 5 }}
      py="3"
      flexShrink="0"
    >
      <Collapsible.Root defaultOpen={initialOpen}>
        <Collapsible.Trigger w="full" p="0" display="block" cursor="pointer">
          <HStack justify="space-between" align="center" minH="6" gap="3" w="full">
            <HStack gap="2">
              <Box w="2.5" h="2.5" rounded="full" bg={TRACE_COLOR} flexShrink="0" />
              <Text fontWeight="bold" textStyle="sm">
                Elevation profile
              </Text>
              {loading && (
                <Text color="fg.muted" textStyle="xs">
                  Fetching elevation…
                </Text>
              )}
            </HStack>
            <HStack gap="2" align="center">
              <Collapsible.Context>
                {(api) =>
                  api.open && profile ? (
                    <HStack gap="4" textStyle="xs" flexWrap="wrap">
                      <ProfileStat label="Min" value={formatElevation(profile.minElevationM)} />
                      <ProfileStat label="Max" value={formatElevation(profile.maxElevationM)} />
                      {profile.totalClimbM > 0.5 && (
                        <ProfileStat
                          label="Climb"
                          value={`+${formatElevation(profile.totalClimbM)}`}
                        />
                      )}
                      {profile.totalDescentM > 0.5 && (
                        <ProfileStat
                          label="Descent"
                          value={`−${formatElevation(profile.totalDescentM)}`}
                        />
                      )}
                    </HStack>
                  ) : null
                }
              </Collapsible.Context>
              <Collapsible.Indicator
                transition="transform 0.2s"
                _open={{ transform: "rotate(180deg)" }}
                flexShrink="0"
              >
                <CaretDownIcon size={18} />
              </Collapsible.Indicator>
            </HStack>
          </HStack>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <Box pt="1.5">
            <ElevationChart profile={profile} points={points} waypoints={waypoints} />
          </Box>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <HStack gap="1">
      <Text color="fg.muted">{label}</Text>
      <Text fontWeight="medium">{value}</Text>
    </HStack>
  );
}

function formatElevation(meters: number): string {
  return `${Math.round(meters)} m`;
}

/* ------------------------------------------------------------------ */
/* Chart                                                              */
/* ------------------------------------------------------------------ */

interface WaypointMarker {
  id: string;
  distanceM: number;
  color: string;
  label: string;
}

function ElevationChart({
  profile,
  points,
  waypoints,
}: {
  profile: ElevationProfile | null;
  points: EditorPoint[];
  waypoints: EditorWaypoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const setHover = useTraceEditorStore((s) => s.setHover);
  const hover = useTraceEditorStore((s) => s.hover);
  const [hoverDistanceM, setHoverDistanceM] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const axisColor = useColorModeValue("#71717a", "#a1a1aa");
  const gridColor = useColorModeValue("#e4e4e7", "#3f3f46");

  const { totalM, cumulativeM } = useMemo(() => {
    const cumulative = new Array<number>(points.length);
    cumulative[0] = 0;
    for (let i = 1; i < points.length; i++) {
      cumulative[i] = cumulative[i - 1] + haversineDistanceMeters(points[i - 1], points[i]);
    }
    return { totalM: traceLengthM(points), cumulativeM: cumulative };
  }, [points]);

  // Waypoints positioned along the trace (km markers).
  const markers = useMemo<WaypointMarker[]>(() => {
    if (points.length < 2) return [];
    const result: WaypointMarker[] = [];
    for (const waypoint of waypoints) {
      const projected = distanceAlongTraceM(points, waypoint);
      if (!projected) continue;
      const distanceM = Math.max(0, Math.min(totalM, projected.alongM));
      result.push({
        id: waypoint.id,
        distanceM,
        color: waypointCategory(waypoint.category).color,
        label: `km ${(distanceM / 1000).toFixed(1)}`,
      });
    }
    return result;
  }, [points, waypoints, totalM]);

  const plotWidth = Math.max(0, width - MIN_Y_INSET - MARGIN.right);
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const plotBottom = MARGIN.top + plotHeight;

  const { samples, yScale, hasElevation } = useMemo(() => {
    if (profile) {
      return {
        samples: profile.points,
        yScale: niceScale(profile.minElevationM, profile.maxElevationM, 3),
        hasElevation: true,
      };
    }
    // Flat distance-only mode: no elevation data, but the axis + km markers
    // still make the panel useful for planning by distance.
    const flat = points.map((_, index) => ({ distanceM: cumulativeM[index], elevationM: 0 }));
    return { samples: flat, yScale: niceScale(0, 1, 3), hasElevation: false };
  }, [profile, points, cumulativeM]);

  const { linePath, xOf, yOf } = useMemo(() => {
    const xOf = (d: number) => MIN_Y_INSET + (plotWidth * d) / Math.max(1, totalM);
    const yOf = (e: number) =>
      MARGIN.top + plotHeight - (plotHeight * (e - yScale.min)) / (yScale.max - yScale.min);
    const linePath = samples
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xOf(p.distanceM).toFixed(2)},${yOf(p.elevationM).toFixed(2)}`,
      )
      .join("");
    return { linePath, xOf, yOf };
  }, [samples, plotWidth, plotHeight, totalM, yScale]);

  // Cross-highlight from the list/map: a hovered vertex becomes a dot on the
  // curve, a hovered stretch becomes the matching part of the curve highlighted.
  const hoveredPointPosition =
    hover?.kind === "point" && hover.index < points.length
      ? {
          x: xOf(cumulativeM[hover.index]),
          y: yOf(profile ? elevationAtDistance(profile, cumulativeM[hover.index]) : 0),
        }
      : null;
  const hoveredSegmentPath =
    hover?.kind === "segment" && hover.index >= 0 && hover.index < points.length - 1
      ? (() => {
          const d0 = cumulativeM[hover.index];
          const d1 = cumulativeM[hover.index + 1];
          const e0 = profile ? elevationAtDistance(profile, d0) : 0;
          const e1 = profile ? elevationAtDistance(profile, d1) : 0;
          return `M${xOf(d0).toFixed(2)},${yOf(e0).toFixed(2)}L${xOf(d1).toFixed(2)},${yOf(e1).toFixed(2)}`;
        })()
      : null;

  function handlePointerMove(event: ReactPointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < 0 || x > plotWidth) {
      setHoverDistanceM(null);
      setHover(null);
      return;
    }
    const distanceM = (x / plotWidth) * totalM;
    setHoverDistanceM(distanceM);
    setHover({ kind: "point", index: nearestPointIndex(cumulativeM, distanceM) });
  }

  function handlePointerLeave() {
    setHoverDistanceM(null);
    setHover(null);
  }

  if (width === 0) return <Box ref={containerRef} h={`${CHART_HEIGHT}px`} />;

  const hoverElevation =
    hoverDistanceM !== null && profile ? elevationAtDistance(profile, hoverDistanceM) : null;
  const tooltipLeft =
    hoverDistanceM !== null
      ? Math.min(Math.max(xOf(hoverDistanceM), 64), Math.max(64, width - 64))
      : 0;

  return (
    <Box ref={containerRef} position="relative" h={`${CHART_HEIGHT}px`}>
      <svg
        width={width}
        height={CHART_HEIGHT}
        role="img"
        aria-label="Elevation profile of the trace being drawn, with waypoint kilometer markers"
      >
        {/* Y gridlines + labels */}
        {yScale.ticks.map((tick) => (
          <g key={`y${tick}`}>
            <line
              x1={MIN_Y_INSET}
              x2={MIN_Y_INSET + plotWidth}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke={gridColor}
              strokeWidth="1"
            />
            <text
              x={MIN_Y_INSET - 6}
              y={yOf(tick)}
              fill={axisColor}
              fontSize="9"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {hasElevation ? formatElevation(tick) : ""}
            </text>
          </g>
        ))}

        {/* X axis labels (start + end distance) */}
        <text x={MIN_Y_INSET} y={CHART_HEIGHT - 6} fill={axisColor} fontSize="9" textAnchor="start">
          0
        </text>
        <text
          x={MIN_Y_INSET + plotWidth}
          y={CHART_HEIGHT - 6}
          fill={axisColor}
          fontSize="9"
          textAnchor="end"
        >
          {formatDistance(totalM)}
        </text>

        {/* Area + line */}
        {samples.length > 1 && (
          <>
            <path
              d={`${linePath}L${xOf(samples[samples.length - 1].distanceM).toFixed(2)},${plotBottom.toFixed(2)}L${MIN_Y_INSET.toFixed(2)},${plotBottom.toFixed(2)}Z`}
              fill={hasElevation ? "#2563eb33" : "#2563eb14"}
            />
            <path
              d={linePath}
              fill="none"
              stroke={hasElevation ? TRACE_COLOR : "#2563eb55"}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Hovered stretch of the trace, highlighted on the curve. */}
        {hoveredSegmentPath && (
          <path
            d={hoveredSegmentPath}
            fill="none"
            stroke={SELECT_COLOR}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Hovered vertex, marked with a dot on the curve. */}
        {hoveredPointPosition && (
          <circle
            cx={hoveredPointPosition.x}
            cy={hoveredPointPosition.y}
            r="4"
            fill={SELECT_COLOR}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
        )}

        {/* Waypoint km markers */}
        {markers.map((marker) => {
          const x = xOf(marker.distanceM);
          const labelX = Math.min(Math.max(x, 26), width - 26);
          const nearStart = x < 30;
          const nearEnd = x > width - 30;
          const emphasized = hover?.kind === "waypoint" && hover.id === marker.id;
          return (
            <g key={marker.id}>
              <line
                x1={x}
                x2={x}
                y1={MARGIN.top}
                y2={plotBottom}
                stroke={marker.color}
                strokeWidth={emphasized ? 3 : 1.5}
                strokeDasharray="3 3"
              />
              {emphasized && (
                <circle
                  cx={x}
                  cy={MARGIN.top}
                  r="3.5"
                  fill={marker.color}
                  stroke="#ffffff"
                  strokeWidth="1"
                />
              )}
              <text
                x={labelX}
                y={MARGIN.top - 7}
                fill={marker.color}
                fontSize="9"
                fontWeight="bold"
                textAnchor={nearStart ? "start" : nearEnd ? "end" : "middle"}
              >
                {marker.label}
              </text>
            </g>
          );
        })}

        {/* Crosshair + tooltip anchor */}
        {hoverDistanceM !== null && (
          <line
            x1={xOf(hoverDistanceM)}
            x2={xOf(hoverDistanceM)}
            y1={MARGIN.top}
            y2={plotBottom}
            stroke={axisColor}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Pointer capture overlay */}
        <rect
          x={MIN_Y_INSET}
          y={MARGIN.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          style={{ touchAction: "none", cursor: "crosshair" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
      </svg>

      {!hasElevation && samples.length > 1 && (
        <Box
          position="absolute"
          left="50%"
          top="50%"
          transform="translate(-50%, -50%)"
          pointerEvents="none"
          textAlign="center"
        >
          <Text color="fg.muted" textStyle="xs">
            No elevation data — the axis still shows distance for planning.
          </Text>
        </Box>
      )}

      {!hasElevation && samples.length <= 1 && (
        <Box
          position="absolute"
          left="50%"
          top="50%"
          transform="translate(-50%, -50%)"
          pointerEvents="none"
          textAlign="center"
        >
          <Text color="fg.muted" textStyle="xs">
            {points.length < 2
              ? "Draw at least two positions to see a profile."
              : "No elevation data."}
          </Text>
        </Box>
      )}

      {hoverDistanceM !== null && hoverElevation !== null && (
        <Box
          position="absolute"
          left={`${tooltipLeft}px`}
          top={`${yOf(hoverElevation)}px`}
          transform="translate(-50%, calc(-100% - 10px))"
          bg="bg.panel"
          borderWidth="1px"
          borderColor="border"
          rounded="md"
          px="2.5"
          py="1"
          shadow="md"
          pointerEvents="none"
          zIndex="1"
          textAlign="center"
        >
          <Text textStyle="xs" fontWeight="semibold">
            {hoverDistanceM === 0 ? "0 m" : formatDistance(hoverDistanceM)}
          </Text>
          <Text textStyle="xs" color="fg.muted">
            {formatElevation(hoverElevation)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/** Index of the vertex whose cumulative distance is closest before `d`. */
function nearestPointIndex(cumulativeM: number[], distanceM: number): number {
  if (cumulativeM.length === 0) return 0;
  let lo = 0;
  let hi = cumulativeM.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulativeM[mid] <= distanceM) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

interface NiceScale {
  min: number;
  max: number;
  ticks: number[];
}

function niceScale(rawMin: number, rawMax: number, count: number): NiceScale {
  let min = rawMin;
  let max = rawMax;
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const stepFactor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = stepFactor * magnitude;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = lo; value <= hi + step * 1e-9; value += step) ticks.push(value);
  return { min: lo, max: hi, ticks };
}
