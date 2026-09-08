# ROADMAP.md

## Phase 1 — View & Organize (done)

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

## Phase 2 — Create & Edit (current)

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

- [x] Editing existing library tracks/waypoints: load a library file into the editor (`/trace-editor/:fileId`, Edit button in the Library rows and the viewer header), drag/add/remove points and waypoints, save back to the same file (re-save overwrites the managed file + re-syncs index metadata); a warning banner flags files with multiple tracks/routes that get consolidated on save
- [x] Unsaved-changes guard on navigation: leaving the workspace (sidebar, back button, direct nav, window close) with unsaved edits opens a confirm dialog (Keep editing / Discard & leave); Clear keeps its own confirm
- [x] Leaving the workspace discards the in-memory session (loaded trace, drawn points, history), so the trace editor always re-opens as a blank project

## Phase 3 — Smarter creation tools

- [ ] Snap to paths: fetch nearby ways from the OSM Overpass API (free, no key) and snap drawn vertices/waypoints onto them; toggleable while drawing
- [ ] Route following via OSRM: pick a start/end point and a profile (driving / cycling / hiking), insert the road-following polyline into the trace
- [ ] Track cleanup tools: smoothing, simplification (Douglas–Peucker), stray-point removal, reverse direction, split track at a point
- [ ] Grade-colored elevation profile (color the profile line by steepness) + climb categorization — helps plan aid stations on climbs

## Phase 4 — Maps & Offline

- [ ] Map type chooser: OpenStreetMap, satellite, terrain, dark — persisted per user in settings
- [ ] Offline tile packs: draw a region on the map, download its tiles to app data (Rust side), storage manager with size estimates, offline indicator; viewer/editor fall back to cached tiles without network

## Phase 5 — Context Actions & Sharing

- [ ] Map right-click context menu: open location in Google Street View (browser), copy coordinates, drop waypoint here
- [ ] More export formats: KML, TCX, GeoJSON, waypoints as CSV
- [ ] Printable course card (PDF): map + elevation profile + waypoint/aid-station table
- [ ] Bulk waypoint import from CSV (checkpoints / hydration stations planned in a spreadsheet)

## Phase 6 — Mobile (Tauri native, iOS/Android)

- [ ] Tauri mobile port: touch-first shell, gestures, platform toolchains (Xcode / Android SDK)
- [ ] Live GPS tracking mode: show current position on the trace
- [ ] Offline-first mobile experience (Phase 4 tile packs + elevation cache, no network needed) — the GPS-companion use case

## Later / Unscoped Ideas

- Multi-file comparison view (overlay multiple tracks on one map)
- Per-track elevation profile series (multiple series on one chart)
- Import from other formats (KML, TCX) with conversion to GPX
- Cloud sync / sharing between devices (currently local-only by design)
- Library backup/restore (export the whole library as an archive)
- Keyboard shortcuts
- i18n / multi-language UI

<!--
    Keep this file updated as scope shifts — it's the quick-glance status
    check for both humans and agents picking up work on the project.
-->
