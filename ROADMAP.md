# ROADMAP.md

## Phase 1 — View & Organize (current)

- [x] Project scaffold: Tauri v2 + React + TypeScript + Vite
- [x] Chakra UI theme setup + Phosphor Icons integration
- [x] App shell: collapsible sidebar + routing (Library / Projects / Settings)
- [x] SQLite setup via `tauri-plugin-sql` + initial migration (Project, GpxFile tables)
- [x] Import flow: file picker → parse metadata → store in library
- [x] Library view: list/grid of imported GPX files, filter by project
- [x] Project view: create/rename/delete projects, assign files to a project
- [x] GPX viewer: Leaflet map rendering tracks/waypoints/routes for a selected file
- [x] GPX viewer: elevation profile chart (distance vs. height, hover tooltip, climb/descent stats, cross-highlighted with the map on hover)
- [x] Export: copy a library file back out to a user-chosen location
- [x] Settings page (sidebar behavior, storage location, etc.)
- [x] Version info + update checks: build version from Rust, GitHub latest-release comparison

## Phase 2 — Create & Edit

### Trace editor workspace (in progress)

- [x] Trace editor workspace: map + collapsible right-hand details panel, tools in the top right (`/trace-editor`)
- [x] In-app trace creation: click the map to lay route positions (session-only, in-memory)
- [x] Waypoints: drop/drag/rename/recategorize/delete, with categories (checkpoint, hydration, first aid, start, finish, parking)
- [x] Full undo/redo history over the session (snapshot stack)

- [x] GPX serialization back to valid XML (`src/lib/gpx/serializeGpx.ts`: `<gpx>`/`<trk>`/`<trkseg>`/`<wpt>`, XML-escaped, symmetric with `parseGpx`)
- [x] Save to library: Rust `save_trace` writes the file + re-extracts metadata; DB row insert on first save, overwrite + metadata/name re-sync on re-save
- [x] Save a copy…: stores a duplicate trace as a new library file (same managed location as imported files) — no OS location prompt

- [x] Live elevation profile while drawing: elevations auto-fetched (opentopodata SRTM, cached, offline-safe) and re-computed on every change
- [x] Per-waypoint kilometer markers: distance along the trace shown on the profile, the waypoint list, and as labels on the map markers

### Remaining

- [ ] Unsaved-changes guard on navigation
- [ ] Editing existing library tracks/waypoints (drag points, add/remove)

## Later / Unscoped Ideas

- Multi-file comparison view (overlay multiple tracks on one map)
- Per-track elevation profile series (multiple series on one chart)
- Import from other formats (KML, TCX) with conversion to GPX
- Cloud sync / sharing between devices (currently local-only by design)

<!--
    Keep this file updated as scope shifts — it's the quick-glance status
    check for both humans and agents picking up work on the project.
-->
