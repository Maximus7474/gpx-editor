import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { Box, Collapsible, HStack, Text } from "@chakra-ui/react";
import { useColorModeValue } from "../../components/ui/color-mode";
import { formatDistance } from "../../lib/format";
import { elevationAtDistance, elevationProfile, type ElevationProfile } from "../../lib/gpx/profile";
import type { GpxDocument } from "../../lib/types/gpx";
import { ROUTE_COLOR, TRACK_COLOR } from "./MapView";

const CHART_HEIGHT = 170;
const MARGIN = { top: 10, right: 14, bottom: 24 };
const MIN_Y_LABEL_INSET = 44;
const MAX_Y_LABEL_INSET = 96;

interface ElevationPanelProps {
  doc: GpxDocument;
  /** Position along the ordered path (meters) to highlight, if any. Owned by
      the viewer page so the map and chart can cross-highlight each other. */
  hoverDistanceM: number | null;
  onHoverChange: (distanceM: number | null) => void;
}

/**
 * Elevation profile for a parsed GPX document. Tracks and routes are flattened
 * into one ordered series (most files contain only one of the two); the accent
 * color follows whichever the file actually has. Hovering the chart reports a
 * distance along that same ordered path; the map highlights the matching spot.
 * Phase 2 editing will be able to recompute the profile live from the same
 * in-memory document.
 */
export function ElevationPanel({ doc, hoverDistanceM, onHoverChange }: ElevationPanelProps) {
  const profile = useMemo(() => elevationProfile(doc), [doc]);
  const accent = doc.tracks.length > 0 ? TRACK_COLOR : ROUTE_COLOR;
  // Start collapsed on narrow (mobile) viewports so the map keeps the space;
  // the header toggle overrides this default for the lifetime of the panel.
  // Read synchronously via matchMedia — Chakra's useBreakpointValue would
  // flash its fallback value on first render.
  const [initialOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(max-width: 767px)").matches;
  });

  return (
    <Box bg="bg.panel" borderTopWidth="1px" borderColor="border.subtle" px={{ base: 4, md: 6 }} py="3" flexShrink="0">
      <Collapsible.Root defaultOpen={initialOpen}>
        <Collapsible.Trigger w="full" p="0" display="block" cursor="pointer">
          <HStack justify="space-between" align="flex-end" minH="6" gap="3" flexWrap="wrap" w="full">
            <HStack gap="2">
              <Box w="2.5" h="2.5" rounded="full" bg={accent} flexShrink="0" />
              <Text fontWeight="bold" textStyle="sm">
                Elevation profile
              </Text>
            </HStack>
            <HStack gap="2" align="center">
              <Collapsible.Context>
                {(api) =>
                  api.open && profile ? (
                    <HStack gap="4" textStyle="xs" flexWrap="wrap">
                      <ProfileStat label="Min" value={formatElevation(profile.minElevationM)} />
                      <ProfileStat label="Max" value={formatElevation(profile.maxElevationM)} />
                      {profile.totalClimbM > 0.5 && (
                        <ProfileStat label="Climb" value={`+${formatElevation(profile.totalClimbM)}`} />
                      )}
                      {profile.totalDescentM > 0.5 && (
                        <ProfileStat label="Descent" value={`−${formatElevation(profile.totalDescentM)}`} />
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
          {/* Padding lives on this inner box, not on Content, so the height
              animation doesn't jank (see the collapsible docs). */}
          <Box pt="1.5">
            {profile ? (
              <ElevationChart
                profile={profile}
                accent={accent}
                hoverDistanceM={hoverDistanceM}
                onHoverChange={onHoverChange}
              />
            ) : (
              <Box h={`${CHART_HEIGHT}px`} display="flex" alignItems="center" justifyContent="center">
                <Text color="fg.muted" textStyle="sm">
                  This file has no elevation data.
                </Text>
              </Box>
            )}
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

interface ElevationChartProps {
  profile: ElevationProfile;
  accent: string;
  hoverDistanceM: number | null;
  onHoverChange: (distanceM: number | null) => void;
}

function ElevationChart({ profile, accent, hoverDistanceM, onHoverChange }: ElevationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const yLabelGroupRef = useRef<SVGGElement>(null);
  const [width, setWidth] = useState(0);
  // Left inset grows to fit the widest y-axis label, so no label ever clips
  // at the svg edge regardless of font, zoom, or value width (e.g. "1200 m").
  const [yLabelInset, setYLabelInset] = useState(MIN_Y_LABEL_INSET);

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

  const plotWidth = Math.max(0, width - yLabelInset - MARGIN.right);
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const plotBottom = MARGIN.top + plotHeight;

  const { xTicks, xStep, yTicks, yStep, linePath, areaPath, xOf, yOf } = useMemo(() => {
    const { points, totalDistanceM, minElevationM, maxElevationM } = profile;
    const xOf = (d: number) => yLabelInset + (plotWidth * d) / totalDistanceM;
    const yScale = niceScale(minElevationM, maxElevationM, 4);
    const yOf = (e: number) =>
      MARGIN.top + plotHeight - (plotHeight * (e - yScale.min)) / (yScale.max - yScale.min);

    const xScale = niceScale(0, totalDistanceM, 5);

    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.distanceM).toFixed(2)},${yOf(p.elevationM).toFixed(2)}`)
      .join("");
    const lastX = xOf(points[points.length - 1].distanceM).toFixed(2);
    const bottom = plotBottom.toFixed(2);
    const areaPath = `${linePath}L${lastX},${bottom}L${yLabelInset.toFixed(2)},${bottom}Z`;

    return {
      xTicks: xScale.ticks,
      xStep: xScale.step,
      yTicks: yScale.ticks,
      yStep: yScale.step,
      linePath,
      areaPath,
      xOf,
      yOf,
    };
  }, [profile, plotWidth, plotHeight, plotBottom, yLabelInset]);

  // Measure the rendered labels (getBBox ignores viewport clipping, so this
  // works even on a first pass where the svg is still too narrow) and widen
  // the inset to fit. Re-measures whenever ticks or width change.
  useEffect(() => {
    const group = yLabelGroupRef.current;
    if (!group) return;
    const labels = Array.from(group.querySelectorAll("text"));
    if (labels.length === 0) return;
    const widest = Math.max(...labels.map((label) => label.getBBox().width));
    const next = Math.min(MAX_Y_LABEL_INSET, Math.max(MIN_Y_LABEL_INSET, Math.ceil(widest) + 14));
    setYLabelInset((current) => (current === next ? current : next));
  }, [yTicks, width]);

  // A hover is expressed as a distance along the path, so the same value
  // highlights this chart and the map. Interpolate so the marker rides the
  // drawn line exactly (samples can sit hundreds of meters apart).
  const distance = hoverDistanceM !== null ? Math.min(profile.totalDistanceM, Math.max(0, hoverDistanceM)) : null;
  const hoverElevation = distance !== null ? elevationAtDistance(profile, distance) : null;
  const tooltipLeft = distance !== null
    ? Math.min(Math.max(xOf(distance), 64), Math.max(64, width - 64))
    : 0;

  function handlePointerMove(event: ReactPointerEvent<SVGRectElement>) {
    // The capture rect starts at the plot origin, so x is already relative to
    // the plot: 0 at the left axis, plotWidth at the right edge. (Earlier this
    // subtracted yLabelInset a second time, shifting the reported distance by
    // the label gutter and trailing the map marker behind the cursor.)
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < 0 || x > plotWidth) {
      onHoverChange(null);
      return;
    }
    const distanceM = (x / plotWidth) * profile.totalDistanceM;
    onHoverChange(distanceM);
  }

  if (width === 0) return <Box ref={containerRef} h={`${CHART_HEIGHT}px`} />;

  return (
    <Box ref={containerRef} position="relative" h={`${CHART_HEIGHT}px`}>
      <svg
        width={width}
        height={CHART_HEIGHT}
        role="img"
        aria-label="Elevation profile chart: distance on the horizontal axis, elevation on the vertical axis"
      >
        <defs>
          <linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines + y labels */}
        <g ref={yLabelGroupRef}>
          {yTicks.map((tick) => (
            <g key={`y${tick}`}>
              <line x1={yLabelInset} x2={yLabelInset + plotWidth} y1={yOf(tick)} y2={yOf(tick)} stroke={gridColor} strokeWidth="1" />
              <text x={yLabelInset - 8} y={yOf(tick)} fill={axisColor} fontSize="10" textAnchor="end" dominantBaseline="middle">
                {formatElevationTick(tick, yStep)}
              </text>
            </g>
          ))}
        </g>

        {/* Vertical gridlines + x labels. Ticks past the total distance are
            dropped, and a label that would collide with the right edge is
            skipped so it never clips. */}
        {xTicks.map((tick) => {
          if (tick > profile.totalDistanceM) return null;
          const x = xOf(tick);
          const clipped = x > width - MARGIN.right - 24;
          return (
            <g key={`x${tick}`}>
              <line x1={x} x2={x} y1={MARGIN.top} y2={plotBottom} stroke={gridColor} strokeWidth="1" />
              {!clipped && (
                <text x={x} y={CHART_HEIGHT - 7} fill={axisColor} fontSize="10" textAnchor="middle">
                  {formatDistanceTick(tick, xStep)}
                </text>
              )}
            </g>
          );
        })}

        {/* Profile area + line */}
        <path d={areaPath} fill="url(#elevation-fill)" />
        <path d={linePath} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Crosshair + marker at the hovered distance (either direction). */}
        {distance !== null && (
          <g>
            <line
              x1={xOf(distance)}
              x2={xOf(distance)}
              y1={MARGIN.top}
              y2={plotBottom}
              stroke={axisColor}
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {hoverElevation !== null && (
              <circle
                cx={xOf(distance)}
                cy={yOf(hoverElevation)}
                r="4.5"
                fill={accent}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}

        {/* Pointer capture overlay — must stay on top */}
        <rect
          x={yLabelInset}
          y={MARGIN.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          style={{ touchAction: "none", cursor: "crosshair" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => onHoverChange(null)}
        />
      </svg>

      {distance !== null && hoverElevation !== null && (
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
            {distance === 0 ? "0 m" : formatDistance(distance)}
          </Text>
          <Text textStyle="xs" color="fg.muted">
            {formatElevation(hoverElevation)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Scales & ticks                                                       */
/* ------------------------------------------------------------------ */

interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** Round a [min, max] range to a "nice" axis with `count`-ish ticks. */
function niceScale(rawMin: number, rawMax: number, count: number): NiceScale {
  let min = rawMin;
  let max = rawMax;
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const stepFactor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = stepFactor * magnitude;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = lo; value <= hi + step * 1e-9; value += step) ticks.push(value);
  return { min: lo, max: hi, step, ticks };
}

function formatElevationTick(value: number, step: number): string {
  const decimals = step < 10 ? 1 : 0;
  return `${value.toFixed(decimals)} m`;
}

function formatDistanceTick(value: number, step: number): string {
  if (step >= 1000) {
    const km = value / 1000;
    const decimals = Number.isInteger(step / 1000) ? 0 : 1;
    return `${km.toFixed(decimals)} km`;
  }
  return `${Math.round(value)} m`;
}
