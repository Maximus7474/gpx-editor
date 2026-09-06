# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## Project Summary

A desktop application, built with **Tauri v2 + React**, for viewing and (in a
later phase) creating/editing **GPX files** to support **event management**
(e.g. races, hikes, organized routes). Users manage GPX files inside
**projects**, where one project represents one event and can contain multiple
GPX files/routes.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Shell | Tauri v2 (Rust) | Native window, filesystem, SQLite access |
| Frontend | React + TypeScript | Vite as the build tool |
| UI kit | [Chakra UI](https://chakra-ui.com) | All components should use Chakra primitives/theme, not raw CSS, unless Chakra has no equivalent |
| Icons | [Phosphor Icons](https://phosphoricons.com) | Use the React package (`@phosphor-icons/react`); pick one consistent weight (default: `regular`) across the app |
| Mapping | Leaflet + OpenStreetMap tiles | `react-leaflet` wrapper preferred over raw Leaflet calls |
| Local persistence | SQLite via `tauri-plugin-sql` | GPX files themselves stay as files on disk; SQLite stores the library/project index and metadata |
| GPX parsing | TBD — see "Open Questions" | Needs to run in the frontend (for preview) and/or Rust side |
| State management | TBD — see "Open Questions" | |

> Anything marked TBD is a placeholder default until confirmed — agents should
> flag it rather than silently deciding.

## Project Phases

1. **Phase 1 (current focus):** View-only GPX library — import, list, preview
   on map, organize into projects, export.
2. **Phase 2:** Create/edit GPX tracks, waypoints, and routes directly in-app.

Do not build editing functionality ahead of Phase 1 being solid unless
explicitly asked — see `ROADMAP.md`.

## Repository Conventions

- **Package manager:** TBD — default assumption is `pnpm` unless a lockfile
  says otherwise. Check for an existing lockfile before running install
  commands.
- **Formatting/linting:** Prettier + ESLint (React/TypeScript configs).
  Run the project's lint/format scripts before considering a task done.
- **Types:** TypeScript strict mode. Avoid `any`; define shared types for
  GPX data structures in one place (see `ARCHITECTURE.md`).
- **Components:** Functional components + hooks only. No class components.
- **File naming:** `PascalCase` for component files, `camelCase` for
  hooks/utils.
- **Rust side:** Keep Tauri commands thin — parsing/business logic in
  dedicated modules, not inline in command handlers.

## Directory Structure (proposed)

```
src/
  app/            # routing, top-level layout (Sidebar + content area)
  components/     # shared/reusable UI components
  features/
    library/      # GPX library view (list/grid of imported files)
    projects/     # project (event) management
    gpx-viewer/   # map + track detail viewing
    settings/     # app settings page
  lib/
    db/           # tauri-plugin-sql client + typed queries
    gpx/          # GPX parsing/serialization helpers
    types/        # shared TypeScript types (Gpx, Track, Project, etc.)
  hooks/
src-tauri/
  src/
    commands/     # Tauri commands (file I/O, GPX read/write)
    db/           # migrations
```

## Do

- Use Chakra UI's theming system for colors/spacing instead of hardcoded
  values — set up a theme file early.
- Keep GPX parsing logic isolated from UI components so it can be reused
  for both viewing (Phase 1) and editing (Phase 2).
- Write Tauri commands for anything touching the filesystem or SQLite;
  never access the filesystem directly from the frontend.
- Update `ARCHITECTURE.md` when a structural decision changes.

## Don't

- Don't introduce a second UI kit or icon set alongside Chakra/Phosphor.
- Don't store parsed GPX file contents in SQLite — SQLite holds metadata
  and the library/project index; GPX files remain the source of truth on
  disk.
- Don't build Phase 2 (editing) UI/state until Phase 1 is agreed complete.

## Open Questions for the Maintainer

These are flagged as unresolved — ask before assuming:

- Package manager (npm/pnpm/yarn)?
- Preferred state management (React Context, Zustand, Redux Toolkit, Jotai)?
- Which GPX parsing library (e.g. `gpxparser`, `togeojson`, a Rust crate like
  `gpx`) — parse on frontend, Rust backend, or both?
- Where should GPX files physically live — a user-chosen folder, or a
  managed app-data directory?
- Testing stack (Vitest? Playwright/Tauri driver for e2e?)
