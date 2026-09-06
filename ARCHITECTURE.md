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
  project_id       -- FK -> Project.id
  file_path        -- absolute path on disk
  original_name
  imported_at
  track_count
  waypoint_count
  distance_m        -- precomputed for list/sort display
  bounds            -- bounding box (min/max lat/lon), for map fit
```

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

- **GPX files:** stored as-is on disk. Location TBD (user-chosen folder vs.
  app-data directory) — needs a decision before Phase 1 import flow is
  built.
- **SQLite (via `tauri-plugin-sql`):** holds `Project` and `GpxFile` tables
  above, plus schema migrations. Frontend reads/writes via a typed
  repository layer (`lib/db/`), mirroring the pattern of keeping SQL out of
  components.
- **Export:** exporting a library entry is a file copy of the on-disk GPX
  (Phase 1); Phase 2 editing will require re-serializing edited data back
  to GPX XML before export/save.

## Navigation & Layout

- Persistent app shell with a **collapsible sidebar** (Chakra UI drawer/box
  pattern, not a separate library) containing:
  - Library (all GPX files)
  - Projects (list, expandable to each project's files)
  - Settings
- Sidebar collapse state should persist across sessions (simple local
  setting, e.g. stored in SQLite `settings` table or a lightweight
  `tauri-plugin-store` key — pick one, don't use both).
- Routing: React Router (or Tauri-friendly equivalent) with routes per
  section; project selection reflected in the URL (e.g.
  `/projects/:projectId`) so state survives refresh/navigation.

## GPX Viewing Pipeline (Phase 1)

1. User imports a `.gpx` file (file picker via Tauri dialog plugin).
2. Rust command copies/references the file, parses basic metadata
   (track/waypoint counts, bounding box, distance), inserts a `GpxFile` row.
3. Library view lists entries from SQLite (fast, no re-parsing).
4. Opening a file triggers full parse (frontend or Rust — TBD) into a
   `GpxDocument`, rendered on the Leaflet map (`react-leaflet`) with tracks
   as polylines and waypoints as markers, fit to the stored bounding box.

## Phase 2 Considerations (editing — not built yet)

- Editing requires a mutable in-memory representation of `GpxDocument`,
  a serializer back to valid GPX XML, and a save path (overwrite vs.
  save-as) that keeps the SQLite index in sync (re-run metadata
  extraction after save).
- Undo/redo and unsaved-changes warnings will matter once editing exists;
  not needed for Phase 1.

## Open Architectural Questions

(mirrors AGENTS.md — kept in sync)

- GPX parsing library choice and whether parsing happens in Rust, the
  frontend, or both (e.g. Rust for fast metadata extraction on import,
  frontend for full detail on open).
- State management library for cross-component state (selected project,
  sidebar collapse, etc.).
- Where GPX files are physically stored on disk.
- Testing approach (unit + e2e).
