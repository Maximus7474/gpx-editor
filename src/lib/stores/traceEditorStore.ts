import { create } from "zustand";
import { elevationKey, fetchElevations } from "../elevation";
import { haversineDistanceMeters } from "../gpx/geometry";
import type {
  EditorPoint,
  EditorSelection,
  EditorTool,
  EditorWaypoint,
  WaypointCategoryId,
} from "../types/trace";

/**
 * In-memory session state for the trace editor. Nothing here is persisted —
 * GPX serialization + library save are a later milestone. The store is not
 * part of the app shell, so it survives navigating away and back (the page
 * shows an "Unsaved" indicator); `discard` resets it explicitly.
 */

/** Deep-ish snapshot of the editable geometry, stored for undo/redo. */
interface Snapshot {
  points: EditorPoint[];
  waypoints: EditorWaypoint[];
}

/** Ephemeral cross-highlight between the details panel and the map (not undoable). */
export type TraceHover = { kind: "point"; index: number } | { kind: "waypoint"; id: string } | null;

/** Where a trace was last saved in the library (drives re-save + the header). */
export interface SavedTraceFile {
  id: number;
  filePath: string;
  originalName: string;
  name: string;
}

const MAX_HISTORY = 100;

function validSelection(
  selection: EditorSelection | null,
  state: Snapshot,
): EditorSelection | null {
  if (!selection) return null;
  if (selection.kind === "point") {
    return selection.index >= 0 && selection.index < state.points.length ? selection : null;
  }
  return state.waypoints.some((waypoint) => waypoint.id === selection.id) ? selection : null;
}

interface TraceEditorState {
  points: EditorPoint[];
  waypoints: EditorWaypoint[];
  tool: EditorTool;
  selected: EditorSelection | null;
  hover: TraceHover;
  past: Snapshot[];
  future: Snapshot[];
  /** Bumped by the "zoom to trace" action; the map fits bounds when it changes. */
  fitSignal: number;
  /** The library file this trace was last saved to, once it has been saved. */
  savedFile: SavedTraceFile | null;
  /** False as soon as the geometry diverges from the last save. */
  saved: boolean;
  /** True while missing elevations are being fetched for the drawn points. */
  elevationLoading: boolean;

  // Tool & selection (not part of undo history).
  setTool: (tool: EditorTool) => void;
  select: (selection: EditorSelection | null) => void;
  setHover: (hover: TraceHover) => void;
  requestFit: () => void;
  /** Record a successful save (sets the workspace to "clean"). */
  markSaved: (file: SavedTraceFile) => void;

  // Mutations — each pushes the pre-mutation state onto the undo stack.
  /** Enrich positions that still lack an elevation (background, not undoable). */
  refreshElevations: () => Promise<void>;
  addPosition: (lat: number, lon: number) => void;
  addWaypoint: (lat: number, lon: number) => void;
  updateWaypoint: (id: string, patch: { category?: WaypointCategoryId; name?: string }) => void;
  moveWaypoint: (id: string, lat: number, lon: number) => void;
  deleteWaypoint: (id: string) => void;
  undo: () => void;
  redo: () => void;
  /** Reset the whole session (used by Discard/clear). */
  discard: () => void;
}

/** Length of the drawn trace in meters. */
export function traceLengthM(points: EditorPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistanceMeters(points[i - 1], points[i]);
  }
  return total;
}

let positionCounter = 0;
let waypointCounter = 0;
let elevationTimer: ReturnType<typeof setTimeout> | undefined;

export const useTraceEditorStore = create<TraceEditorState>((set, get) => {
  /**
   * Debounced: fetch elevations for any drawn point that lacks one and merge
   * them in. Elevation is derived metadata — it never enters the undo history,
   * so undoing to a snapshot without elevations re-enriches those points.
   */
  const scheduleElevationRefresh = () => {
    if (elevationTimer) clearTimeout(elevationTimer);
    elevationTimer = setTimeout(() => {
      void get().refreshElevations();
    }, 600);
  };

  /** Push the current geometry onto `past` (clearing `future`) before mutating. */
  const beginChange = () => {
    const { past, points, waypoints } = get();
    set({
      past: [...past.slice(-(MAX_HISTORY - 1)), { points, waypoints }],
      future: [],
      saved: false,
    });
  };

  const popUndo = (): Snapshot | null => {
    const { past } = get();
    if (past.length === 0) return null;
    const previous = past[past.length - 1];
    set({ past: past.slice(0, -1) });
    return previous;
  };

  return {
    points: [],
    waypoints: [],
    tool: "add-point",
    selected: null,
    hover: null,
    past: [],
    future: [],
    fitSignal: 0,
    savedFile: null,
    saved: false,
    elevationLoading: false,

    setTool: (tool) => set({ tool }),
    select: (selection) => set({ selected: selection, hover: null }),
    setHover: (hover) => set({ hover }),
    requestFit: () => set({ fitSignal: get().fitSignal + 1 }),
    markSaved: (file) => set({ savedFile: file, saved: true }),

    refreshElevations: async () => {
      const { points } = get();
      const missing = points.filter((point) => point.ele === undefined);
      if (missing.length === 0) return;
      set({ elevationLoading: true });
      try {
        const elevations = await fetchElevations(missing);
        const byKey = new Map<string, number>();
        elevations.forEach((elevation, index) => {
          if (elevation !== null && elevation !== undefined) {
            byKey.set(elevationKey(missing[index].lat, missing[index].lon), elevation);
          }
        });
        set((state) => ({
          points: state.points.map((point) => {
            if (point.ele !== undefined) return point;
            const elevation = byKey.get(elevationKey(point.lat, point.lon));
            return elevation === undefined ? point : { ...point, ele: elevation };
          }),
        }));
      } finally {
        set({ elevationLoading: false });
      }
    },

    addPosition: (lat, lon) => {
      const { points } = get();
      const last = points[points.length - 1];
      // Ignore duplicate clicks on the same spot (below ~0.5 m).
      if (last && haversineDistanceMeters(last, { lat, lon }) < 0.5) return;
      beginChange();
      set({
        points: [...points, { id: `position-${++positionCounter}`, lat, lon }],
      });
      scheduleElevationRefresh();
    },

    addWaypoint: (lat, lon) => {
      beginChange();
      const waypoint: EditorWaypoint = {
        id: `waypoint-${++waypointCounter}`,
        lat,
        lon,
        category: "checkpoint",
      };
      set({
        waypoints: [...get().waypoints, waypoint],
        selected: { kind: "waypoint", id: waypoint.id },
      });
    },

    updateWaypoint: (id, patch) => {
      const { waypoints } = get();
      const target = waypoints.find((waypoint) => waypoint.id === id);
      if (!target) return;
      const nextName = patch.name?.trim();
      const name = nextName ? nextName : undefined;
      const category = patch.category ?? target.category;
      if (name === target.name && category === target.category) return;
      beginChange();
      set({
        waypoints: waypoints.map((waypoint) =>
          waypoint.id === id ? { ...waypoint, name, category } : waypoint,
        ),
      });
    },

    moveWaypoint: (id, lat, lon) => {
      const { waypoints } = get();
      const target = waypoints.find((waypoint) => waypoint.id === id);
      if (!target) return;
      if (target.lat === lat && target.lon === lon) return;
      beginChange();
      set({
        waypoints: waypoints.map((waypoint) =>
          waypoint.id === id ? { ...waypoint, lat, lon } : waypoint,
        ),
      });
    },

    deleteWaypoint: (id) => {
      const { waypoints, selected } = get();
      if (!waypoints.some((waypoint) => waypoint.id === id)) return;
      beginChange();
      set({
        waypoints: waypoints.filter((waypoint) => waypoint.id !== id),
        selected: selected?.kind === "waypoint" && selected.id === id ? null : selected,
      });
    },

    undo: () => {
      const { future, points, waypoints, selected } = get();
      const previous = popUndo();
      if (!previous) return;
      set({
        future: [...future.slice(-(MAX_HISTORY - 1)), { points, waypoints }],
        points: previous.points,
        waypoints: previous.waypoints,
        selected: validSelection(selected, previous),
        hover: null,
        saved: false,
      });
      scheduleElevationRefresh();
    },

    redo: () => {
      const { future, past, points, waypoints, selected } = get();
      if (future.length === 0) return;
      const next = future[future.length - 1];
      set({
        past: [...past.slice(-(MAX_HISTORY - 1)), { points, waypoints }],
        future: future.slice(0, -1),
        points: next.points,
        waypoints: next.waypoints,
        selected: validSelection(selected, next),
        hover: null,
        saved: false,
      });
      scheduleElevationRefresh();
    },

    discard: () => {
      positionCounter = 0;
      waypointCounter = 0;
      if (elevationTimer) clearTimeout(elevationTimer);
      set({
        points: [],
        waypoints: [],
        selected: null,
        hover: null,
        past: [],
        future: [],
        savedFile: null,
        saved: false,
        elevationLoading: false,
      });
    },
  };
});
