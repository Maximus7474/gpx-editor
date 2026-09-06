# ARCHITECTURE.md

## Overview

The app is a Tauri v2 desktop application. React handles the UI; Rust handles
filesystem access, GPX file I/O, and the local SQLite database. GPX files
live as plain files on disk (source of truth); SQLite stores an index of
projects, files, and metadata so the library can be queried and organized
without re-parsing GPX files on every launch.

```
┌───────────────────────────────┐
│           React UI            │
│  (Chakra UI + Phosphor)       │
├───────────────┬───────────────┤
│  Library view │  Map viewer   │  ...features
├───────────────┴───────────────┤
│      lib/db, lib/gpx (TS)     │  <- typed client, calls Tauri commands
└──────────────┬────────────────┘
               │ Tauri IPC
┌──────────────▼─────────────────┐
│         Rust (src-tauri)       │
│  commands/  db/  gpx parsing   │
├────────────────────────────────┤
│  SQLite (index/metadata)       │
│  Filesystem (.gpx files)       │
└────────────────────────────────┘
```

## Data Model

### Project (event)

Represents one event. Contains many GPX files/routes.

```
Project
  id
  name
  description
  created_at
  updated_at
```

### GpxFile (library entry)

Metadata about an imported GPX file. The actual GPX XML stays on disk;
this row indexes it.

```
GpxFile
  id
  project_id       -- FK -> Project.id (nullable, ON DELETE SET NULL)
  file_path        -- absolute path of the copy in the managed library
  original_name
  imported_at
  track_count
  waypoint_count
  route_count
  distance_m        -- precomputed for list/sort display
  bounds_min_lat / bounds_min_lon / bounds_max_lat / bounds_max_lon
                    -- bounding box, for map fit
```

A small `settings` (key/value) table stores UI preferences such as the
sidebar collapse state.

### Parsed GPX shape (in-memory / TypeScript types)

Not persisted directly — derived from parsing the file, used by the
viewer/editor:

```ts
interface GpxDocument {
  metadata: { name?: string; description?: string; time?: string };
  tracks: Track[];
  routes: Route[];
  waypoints: Waypoint[];
}

interface Track {
  name?: string;
  segments: TrackPoint[][];
}

interface TrackPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
}
```

> Exact shape should mirror whatever GPX parsing library is chosen (see
> Open Questions in AGENTS.md) — keep this as the single shared type
> definition consumed across features.

## Local Storage Strategy

- **GPX files:** stored as-is in a managed `library/` folder under the app
  data directory. Import copies the user's file there; the original is never
  modified. Rust owns all filesystem access.
- **SQLite (via `tauri-plugin-sql`):** holds the `Project`, `GpxFile`, and
  `settings` tables above. Schema migrations are registered Rust-side in
  `src-tauri/src/db` against connection `sqlite:gpx-editor.db` and run when
  the frontend loads that connection (`lib/db/client.ts`). Frontend reads/
  writes go through a typed repository layer (`lib/db/repository.ts`).
- **Export:** a Rust command copies the stored GPX to a user-chosen
  destination (Phase 1); Phase 2 editing will require re-serializing edited
  data back to GPX XML before export/save.

## Navigation & Layout

- Persistent app shell with a **collapsible sidebar** (Chakra UI drawer/box
  pattern, not a separate library) containing:
  - Library (all GPX files)
  - Projects (list, expandable to each project's files)
  - Settings
- Sidebar collapse state persists across sessions via the SQLite `settings`
  table (a Zustand store hydrates it on launch).
- Routing: React Router (or Tauri-friendly equivalent) with routes per
  section; project selection reflected in the URL (e.g.
  `/projects/:projectId`) so state survives refresh/navigation.

## GPX Viewing Pipeline (Phase 1)

1. User picks `.gpx` files (native dialog via the Tauri dialog plugin).
2. Rust command (`import_gpx_files`) copies each file into the managed
   library and parses metadata (track/waypoint/route counts, bounding box,
   distance) with the `gpx` crate; the frontend repository inserts the rows.
3. Library view lists entries from SQLite (fast, no re-parsing).
4. Opening a file reads it back through a Rust command and the frontend
   parses it into a `GpxDocument` (dependency-free DOMParser parser in
   `src/lib/gpx`), rendered on the Leaflet map (`react-leaflet`) with tracks
   and routes as polylines and waypoints as markers, fit to the document's
   bounds.

## Phase 2 (in progress) — Trace editor workspace

Editing has started as an in-memory **trace editor workspace** at
`/trace-editor` (Phase 1 remains view-only). Positions and waypoints live in a
session-only Zustand store (`src/lib/stores/traceEditorStore.ts`); the map
(`src/features/trace-editor/EditorMap.tsx`) places route positions on click and
waypoints as draggable, category-colored markers; a collapsible right-hand
panel lists both; a snapshot-based history drives Undo/Redo. Geometry types
are in `src/lib/types/trace.ts` (vertices reuse `TrackPoint` so they serialize
straight into a GPX track later).

Serialization + saving are in place: `src/lib/gpx/serializeGpx.ts` turns the
editor state (or any `GpxDocument`) back into GPX 1.1 XML, symmetric with
`parseGpx`. Saving to the library goes through Rust (`save_trace` writes the
file and re-runs `gpxmeta::extract_metadata` so the index stays in sync; the
TS repository inserts the row on first save and updates metadata/name on
re-save). "Save a copy…" writes the XML straight to a user-chosen path
(`write_trace_to_path`) without touching the library.

Elevation: drawn positions carry no elevation, so the editor enriches them in
`src/lib/elevation.ts` via the free opentopodata SRTM API. The fetch runs in a
Rust command (`commands/elevation.rs`) because the API sends no CORS headers
— same reason the update check lives on the Rust side. The frontend caches
per coordinate (debounced in the store, offline-safe — failures stay uncached
and render as a flat distance-only profile). Waypoints get km markers everywhere
(profile, list, map labels) via `distanceAlongTraceM` in
`src/lib/gpx/geometry.ts`.

Still to come (Phase 2 remainder):

- Unsaved-changes warning on navigation.
- Loading existing library files into the editor (drag/edit points).

## Resolved Decisions (recorded 2026-09)

(mirrors AGENTS.md — kept in sync)

- **GPX parsing:** Rust `gpx` crate extracts metadata at import
  (`src-tauri/src/gpxmeta`); the frontend parses full detail on open via a
  typed DOMParser parser (`src/lib/gpx/parseGpx.ts`).
- **State management:** Zustand stores in `src/lib/stores`.
- **GPX file storage:** managed `library/` folder under the app data
  directory; imports are copies.
- **UI preferences:** SQLite `settings` table.

## Open Architectural Question

- Testing approach (unit + e2e).
