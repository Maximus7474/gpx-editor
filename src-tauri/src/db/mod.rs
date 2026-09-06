use tauri_plugin_sql::{Migration, MigrationKind};

/// Connection string used by both the Rust-side migration registration and the
/// frontend `Database.load(...)` call. Must match exactly.
pub const DB_URL: &str = "sqlite:gpx-editor.db";

/// Schema migrations for the local library index. GPX file contents never live
/// in the database — only project/file metadata and settings do.
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_projects",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS projects (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );",
        },
        Migration {
            version: 2,
            description: "create_gpx_files",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS gpx_files (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id     INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                file_path      TEXT NOT NULL UNIQUE,
                original_name  TEXT NOT NULL,
                imported_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                track_count    INTEGER NOT NULL DEFAULT 0,
                waypoint_count INTEGER NOT NULL DEFAULT 0,
                route_count    INTEGER NOT NULL DEFAULT 0,
                distance_m     REAL NOT NULL DEFAULT 0,
                bounds_min_lat REAL,
                bounds_min_lon REAL,
                bounds_max_lat REAL,
                bounds_max_lon REAL
            );",
        },
        Migration {
            version: 3,
            description: "index_gpx_files_project",
            kind: MigrationKind::Up,
            sql: "CREATE INDEX IF NOT EXISTS idx_gpx_files_project ON gpx_files(project_id);",
        },
        Migration {
            version: 4,
            description: "create_settings",
            kind: MigrationKind::Up,
            sql: "CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        },
    ]
}
