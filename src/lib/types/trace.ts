/**
 * In-memory shapes for the trace editor workspace (Phase 2). The editor holds
 * one ordered list of route positions plus a set of free-standing waypoints.
 * Vertices carry a stable id for UI keys/selection and map 1:1 onto GPX
 * `trkpt` (lat/lon) when serialization lands in a later milestone.
 */

/** One editable route vertex on the trace. */
export interface EditorPoint {
  id: string;
  lat: number;
  lon: number;
  /** Meters above sea level, when known (auto-fetched; optional). */
  ele?: number;
}

export type WaypointCategoryId =
  | "checkpoint"
  | "hydration"
  | "first-aid"
  | "start"
  | "finish"
  | "parking";

export interface WaypointCategory {
  id: WaypointCategoryId;
  label: string;
  color: string;
}

/** Fixed category palette — shared by map markers, the details panel, and the dialog. */
export const WAYPOINT_CATEGORIES: WaypointCategory[] = [
  { id: "checkpoint", label: "Checkpoint", color: "#d97706" },
  { id: "hydration", label: "Hydration", color: "#0891b2" },
  { id: "first-aid", label: "First aid", color: "#dc2626" },
  { id: "start", label: "Start", color: "#16a34a" },
  { id: "finish", label: "Finish", color: "#7c3aed" },
  { id: "parking", label: "Parking", color: "#64748b" },
];

export function waypointCategory(id: WaypointCategoryId): WaypointCategory {
  return WAYPOINT_CATEGORIES.find((category) => category.id === id) ?? WAYPOINT_CATEGORIES[0];
}

/** A free-standing marker placed on the map (checkpoint, hydration, …). */
export interface EditorWaypoint {
  id: string;
  lat: number;
  lon: number;
  category: WaypointCategoryId;
  name?: string;
}

/** Default category a newly dropped waypoint gets until the user edits it. */
export const DEFAULT_WAYPOINT_CATEGORY: WaypointCategoryId = "checkpoint";

/** Display label for a waypoint row: its name, falling back to the category. */
export function waypointLabel(waypoint: EditorWaypoint): string {
  return waypoint.name?.trim() || waypointCategory(waypoint.category).label;
}

/** Which interaction the map is in: pick vs. place route positions vs. drop waypoints. */
export type EditorTool = "select" | "add-point" | "add-waypoint";

export type EditorSelection = { kind: "point"; index: number } | { kind: "waypoint"; id: string };
