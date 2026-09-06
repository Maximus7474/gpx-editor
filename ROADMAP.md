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
- [x] Export: copy a library file back out to a user-chosen location
- [x] Settings page (placeholder: sidebar behavior, storage location, etc.)

## Phase 2 — Create & Edit

- [ ] In-app GPX creation (draw a new track/route on the map)
- [ ] Editing existing tracks/waypoints (drag points, add/remove, rename)
- [ ] GPX serialization back to valid XML
- [ ] Save / save-as, with SQLite metadata re-sync after edits
- [ ] Undo/redo, unsaved-changes handling

## Later / Unscoped Ideas

- Multi-file comparison view (overlay multiple tracks on one map)
- Elevation profile charts per track
- Import from other formats (KML, TCX) with conversion to GPX
- Cloud sync / sharing between devices (currently local-only by design)

<!--
    Keep this file updated as scope shifts — it's the quick-glance status
    check for both humans and agents picking up work on the project.
-->
