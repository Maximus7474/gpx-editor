import Database from "@tauri-apps/plugin-sql";

/**
 * Shared connection to the SQLite index. Must match the connection string the
 * Rust side registered its migrations against (see src-tauri/src/db/mod.rs).
 * Loading the connection triggers those migrations automatically.
 */
const DB_URL = "sqlite:gpx-editor.db";

let dbPromise: Promise<Database> | undefined;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}
