import {
  Box,
  Button,
  Collapsible,
  Flex,
  HStack,
  IconButton,
  Menu,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  CaretDoubleRightIcon,
  CaretDownIcon,
  DotsThreeVerticalIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";
import { toaster } from "../../components/ui/toaster";
import { formatDistance } from "../../lib/format";
import {
  distanceAlongTraceM,
  haversineDistanceMeters,
  midpointBetween,
} from "../../lib/gpx/geometry";
import { traceLengthM, useTraceEditorStore } from "../../lib/stores/traceEditorStore";
import {
  type EditorPoint,
  type EditorWaypoint,
  WAYPOINT_CATEGORIES,
  type WaypointCategoryId,
  waypointCategory,
  waypointLabel,
} from "../../lib/types/trace";

const PANEL_WIDTH = 320;

interface DetailsPanelProps {
  open: boolean;
  onToggle: () => void;
  onEditWaypoint: (id: string) => void;
}

/**
 * Collapsible right-hand details panel of the trace editor: the route
 * positions and waypoints listed out, cross-highlighted with the map on
 * hover and selectable/editable. When collapsed the map takes the full width
 * and the toggle in the toolbar re-opens it.
 */
export function DetailsPanel({ open, onToggle, onEditWaypoint }: DetailsPanelProps) {
  const points = useTraceEditorStore((s) => s.points);
  const waypoints = useTraceEditorStore((s) => s.waypoints);
  const selected = useTraceEditorStore((s) => s.selected);
  const setTool = useTraceEditorStore((s) => s.setTool);

  const cumulativeM = useMemo(() => {
    const distances = new Array<number>(points.length);
    distances[0] = 0;
    for (let i = 1; i < points.length; i++) {
      distances[i] = distances[i - 1] + haversineDistanceMeters(points[i - 1], points[i]);
    }
    return distances;
  }, [points]);

  const totalM = useMemo(() => traceLengthM(points), [points]);
  const categoriesInUse = useMemo(() => {
    const ids = new Set(waypoints.map((waypoint) => waypoint.category));
    return WAYPOINT_CATEGORIES.filter((category) => ids.has(category.id));
  }, [waypoints]);

  return (
    <Flex
      direction="column"
      h="full"
      w={open ? `${PANEL_WIDTH}px` : "0"}
      minW={open ? `${PANEL_WIDTH}px` : "0"}
      flexShrink="0"
      overflow="hidden"
      bg="bg.panel"
      borderLeftWidth={open ? "1px" : "0"}
      borderColor="border.subtle"
      transition="width 0.2s ease, min-width 0.2s ease, border-width 0.2s ease"
    >
      <HStack
        justify="space-between"
        px="3"
        py="2"
        flexShrink="0"
        borderBottomWidth="1px"
        borderColor="border.subtle"
      >
        <Text fontWeight="bold" textStyle="sm">
          Trace details
        </Text>
        <IconButton
          aria-label="Collapse details panel"
          variant="ghost"
          size="xs"
          onClick={onToggle}
        >
          <CaretDoubleRightIcon />
        </IconButton>
      </HStack>

      {open && (
        <>
          <Stack gap="0" flex="1" minH="0" overflowY="auto" py="2" px="3">
            <CollapsibleSection label="Positions" count={points.length}>
              {points.length === 0 ? (
                <EmptyHint
                  text="No positions yet — trace your route on the map."
                  actionLabel="Add positions"
                  onAction={() => setTool("add-point")}
                />
              ) : (
                <Stack gap="0.5" mb="4">
                  {points.map((point, index) => (
                    <PositionRow
                      key={point.id}
                      index={index}
                      point={point}
                      cumulativeM={cumulativeM[index]}
                      selected={selected?.kind === "point" && selected.index === index}
                    />
                  ))}
                </Stack>
              )}
            </CollapsibleSection>

            <CollapsibleSection label="Waypoints" count={waypoints.length}>
              {waypoints.length === 0 ? (
                <EmptyHint
                  text="Drop checkpoints, hydration stations, start/finish…"
                  actionLabel="Add waypoint"
                  onAction={() => setTool("add-waypoint")}
                />
              ) : (
                <Stack gap="0.5" mb="2">
                  {waypoints.map((waypoint) => (
                    <WaypointRow
                      key={waypoint.id}
                      waypoint={waypoint}
                      selected={selected?.kind === "waypoint" && selected.id === waypoint.id}
                      onEdit={onEditWaypoint}
                    />
                  ))}
                </Stack>
              )}
            </CollapsibleSection>

            {categoriesInUse.length > 0 && (
              <Box pt="1" mt="1" borderTopWidth="1px" borderColor="border.subtle">
                <Flex gap="1.5" flexWrap="wrap">
                  {categoriesInUse.map((category) => (
                    <CategoryChip key={category.id} id={category.id} />
                  ))}
                </Flex>
              </Box>
            )}
          </Stack>

          <HStack
            flexShrink="0"
            justify="space-between"
            px="3"
            py="2"
            borderTopWidth="1px"
            borderColor="border.subtle"
            textStyle="xs"
            color="fg.muted"
          >
            <Text>
              {points.length} position{points.length === 1 ? "" : "s"}
            </Text>
            {totalM > 0 && <Text fontWeight="medium">{formatDistance(totalM)}</Text>}
            <Text>
              {waypoints.length} waypoint{waypoints.length === 1 ? "" : "s"}
            </Text>
          </HStack>
        </>
      )}
    </Flex>
  );
}

function CollapsibleSection({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Collapsible.Root defaultOpen>
      <Collapsible.Trigger w="full" p="0" display="block" cursor="pointer">
        <HStack justify="space-between" mb="1" mt="1">
          <Text fontWeight="semibold" textStyle="sm">
            {label}
          </Text>
          <HStack gap="1">
            <Text color="fg.muted" textStyle="xs" tabIndex={-1}>
              {count}
            </Text>
            <Collapsible.Indicator
              transition="transform 0.2s"
              _open={{ transform: "rotate(180deg)" }}
              color="fg.muted"
            >
              <CaretDownIcon size={14} />
            </Collapsible.Indicator>
          </HStack>
        </HStack>
      </Collapsible.Trigger>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

function EmptyHint({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Box bg="bg.muted" rounded="md" px="3" py="2.5" mb="4" textStyle="sm">
      <Text color="fg.muted">{text}</Text>
      <Button variant="plain" size="xs" mt="1" colorPalette="blue" onClick={onAction}>
        {actionLabel}
      </Button>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

function PositionRow({
  index,
  point,
  cumulativeM,
  selected,
}: {
  index: number;
  point: EditorPoint;
  cumulativeM: number;
  selected: boolean;
}) {
  const select = useTraceEditorStore((s) => s.select);
  const setHover = useTraceEditorStore((s) => s.setHover);
  const points = useTraceEditorStore((s) => s.points);
  const deletePoint = useTraceEditorStore((s) => s.deletePoint);
  const insertPosition = useTraceEditorStore((s) => s.insertPosition);

  function insertBefore() {
    if (index === 0) {
      // No midpoint before the first vertex — duplicate it so it can be dragged.
      insertPosition(0, point.lat, point.lon, point.ele);
      return;
    }
    const previous = points[index - 1];
    const mid = midpointBetween(previous, point);
    insertPosition(index, mid.lat, mid.lon, avgElevation(previous, point));
  }

  function insertAfter() {
    const next = points[index + 1];
    if (!next) {
      // No midpoint after the last vertex — duplicate it so it can be dragged.
      insertPosition(index + 1, point.lat, point.lon, point.ele);
      return;
    }
    const mid = midpointBetween(point, next);
    insertPosition(index + 1, mid.lat, mid.lon, avgElevation(point, next));
  }

  function handleDelete() {
    deletePoint(index);
    toaster.create({ title: "Position deleted", type: "info" });
  }

  return (
    <Row
      selected={selected}
      onSelect={() => select({ kind: "point", index })}
      onMouseEnter={() => setHover({ kind: "point", index })}
      onMouseLeave={() => setHover(null)}
      ariaLabel={`Position ${index + 1}`}
    >
      <Box
        w="5"
        h="5"
        rounded="full"
        bg={selected ? "#f59e0b" : "#2563eb"}
        color="white"
        fontSize="10px"
        fontWeight="bold"
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink="0"
      >
        {index + 1}
      </Box>
      <Box minW="0" flex="1">
        <Text textStyle="xs" fontFamily="mono" lineClamp={1}>
          {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
        </Text>
        <Text color="fg.muted" textStyle="xs">
          at {formatDistance(cumulativeM)}
        </Text>
      </Box>
      <Menu.Root>
        <Menu.Trigger asChild>
          <IconButton
            aria-label={`Actions for position ${index + 1}`}
            variant="ghost"
            size="2xs"
            flexShrink="0"
            onClick={(event) => event.stopPropagation()}
          >
            <DotsThreeVerticalIcon />
          </IconButton>
        </Menu.Trigger>
        <Menu.Positioner>
          <Menu.Content>
            <Menu.Item value="insert-before" onClick={insertBefore}>
              <Menu.ItemText>Insert before</Menu.ItemText>
            </Menu.Item>
            <Menu.Item value="insert-after" onClick={insertAfter}>
              <Menu.ItemText>Insert after</Menu.ItemText>
            </Menu.Item>
            <Menu.Item value="delete" onClick={handleDelete}>
              <Menu.ItemText color="fg.error">Delete position</Menu.ItemText>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>
    </Row>
  );
}

/** Average elevation of two neighbors, when both carry one (for inserted midpoints). */
function avgElevation(a: EditorPoint, b: EditorPoint): number | undefined {
  if (a.ele !== undefined && b.ele !== undefined) return (a.ele + b.ele) / 2;
  return undefined;
}

function WaypointRow({
  waypoint,
  selected,
  onEdit,
}: {
  waypoint: EditorWaypoint;
  selected: boolean;
  onEdit: (id: string) => void;
}) {
  const select = useTraceEditorStore((s) => s.select);
  const setHover = useTraceEditorStore((s) => s.setHover);
  const deleteWaypoint = useTraceEditorStore((s) => s.deleteWaypoint);
  const points = useTraceEditorStore((s) => s.points);
  const category = waypointCategory(waypoint.category);
  const label = waypointLabel(waypoint);
  // Distance of the waypoint along the drawn trace, for the km readout.
  const alongKm = useMemo(() => {
    const projected = distanceAlongTraceM(points, waypoint);
    return projected ? (projected.alongM / 1000).toFixed(1) : null;
  }, [points, waypoint]);

  function handleDelete() {
    deleteWaypoint(waypoint.id);
    toaster.create({ title: "Waypoint deleted", type: "info" });
  }

  return (
    <Row
      selected={selected}
      onSelect={() => select({ kind: "waypoint", id: waypoint.id })}
      onMouseEnter={() => setHover({ kind: "waypoint", id: waypoint.id })}
      onMouseLeave={() => setHover(null)}
      ariaLabel={`Waypoint: ${label}`}
    >
      <Box
        w="3"
        h="3"
        rounded="full"
        bg={category.color}
        borderWidth="1px"
        borderColor="whiteAlpha.500"
        flexShrink="0"
      />
      <Box minW="0" flex="1">
        <Text textStyle="xs" fontWeight="medium" lineClamp={1}>
          {label}
        </Text>
        <Text color="fg.muted" textStyle="xs" lineClamp={1}>
          {category.label}
          {alongKm ? ` · km ${alongKm}` : ""} · {waypoint.lat.toFixed(5)}, {waypoint.lon.toFixed(5)}
        </Text>
      </Box>
      <HStack gap="0.5" flexShrink="0">
        <IconButton
          aria-label={`Edit ${label}`}
          variant="ghost"
          size="2xs"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(waypoint.id);
          }}
        >
          <PencilSimpleIcon />
        </IconButton>
        <IconButton
          aria-label={`Delete ${label}`}
          variant="ghost"
          size="2xs"
          colorPalette="red"
          onClick={(event) => {
            event.stopPropagation();
            handleDelete();
          }}
        >
          <TrashIcon />
        </IconButton>
      </HStack>
    </Row>
  );
}

function Row({
  selected,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  ariaLabel,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <HStack
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={selected}
      gap="2"
      px="2"
      py="1.5"
      rounded="md"
      cursor="pointer"
      bg={selected ? "bg.emphasized" : undefined}
      _hover={{ bg: "bg.muted" }}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {children}
    </HStack>
  );
}

function CategoryChip({ id }: { id: WaypointCategoryId }) {
  const category = waypointCategory(id);
  const count = useTraceEditorStore(
    (s) => s.waypoints.filter((waypoint) => waypoint.category === id).length,
  );
  return (
    <HStack gap="1" bg="bg.muted" rounded="full" px="1.5" py="0.5">
      <Box w="2" h="2" rounded="full" bg={category.color} />
      <Text textStyle="xs" color="fg.muted">
        {category.label} {count}
      </Text>
    </HStack>
  );
}
