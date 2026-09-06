import type { GpxFile, ImportedGpx, Project } from "../types/models";
import { getDb } from "./client";

/**
 * Typed queries over the SQLite index. SQL stays in this module; components
 * and stores only talk in terms of `Project` / `GpxFile` objects.
 */

type SqlRow = Record<string, unknown>;

export async function listProjects(): Promise<Project[]> {
  const rows = (await (await getDb()).select<SqlRow[]>(
    "SELECT * FROM projects ORDER BY updated_at DESC, name ASC",
  )) as SqlRow[];
  return rows.map(rowToProject);
}

export async function createProject(name: string, description: string): Promise<Project> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO projects (name, description) VALUES ($1, $2)",
    [name, description],
  );
  const id = Number(result.lastInsertId);
  const rows = (await db.select<SqlRow[]>("SELECT * FROM projects WHERE id = $1", [id])) as SqlRow[];
  if (rows.length === 0) throw new Error("Project insert failed.");
  return rowToProject(rows[0]);
}

export async function renameProject(id: number, name: string): Promise<void> {
  await (
    await getDb()
  ).execute("UPDATE projects SET name = $1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = $2", [
    name,
    id,
  ]);
}

/**
 * Deleting a project only removes the project — its GPX files are unassigned
 * (FK is ON DELETE SET NULL), never deleted from the library.
 */
export async function deleteProject(id: number): Promise<void> {
  await (await getDb()).execute("DELETE FROM projects WHERE id = $1", [id]);
}

/** All files in the library, newest import first. */
export async function listGpxFiles(): Promise<GpxFile[]> {
  const rows = (await (await getDb()).select<SqlRow[]>(
    "SELECT * FROM gpx_files ORDER BY imported_at DESC, id DESC",
  )) as SqlRow[];
  return rows.map(rowToGpxFile);
}

export async function getGpxFile(id: number): Promise<GpxFile | null> {
  const rows = (await (await getDb()).select<SqlRow[]>(
    "SELECT * FROM gpx_files WHERE id = $1",
    [id],
  )) as SqlRow[];
  return rows.length > 0 ? rowToGpxFile(rows[0]) : null;
}

/** Insert files copied & parsed by the Rust import command, optionally assigned to a project. */
export async function insertGpxFiles(files: ImportedGpx[], projectId: number | null): Promise<void> {
  if (files.length === 0) return;
  const db = await getDb();
  for (const file of files) {
    await db.execute(
      `INSERT INTO gpx_files
         (project_id, file_path, original_name, track_count, waypoint_count,
          route_count, distance_m, bounds_min_lat, bounds_min_lon,
          bounds_max_lat, bounds_max_lon)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        projectId,
        file.filePath,
        file.originalName,
        file.trackCount,
        file.waypointCount,
        file.routeCount,
        file.distanceM,
        file.bounds?.minLat ?? null,
        file.bounds?.minLon ?? null,
        file.bounds?.maxLat ?? null,
        file.bounds?.maxLon ?? null,
      ],
    );
  }
}

export async function deleteGpxFile(id: number): Promise<void> {
  await (await getDb()).execute("DELETE FROM gpx_files WHERE id = $1", [id]);
}

/** Move a file into (or out of, when null) a project. */
export async function assignGpxFile(fileId: number, projectId: number | null): Promise<void> {
  await (await getDb()).execute("UPDATE gpx_files SET project_id = $1 WHERE id = $2", [
    projectId,
    fileId,
  ]);
}

export async function getSetting(key: string): Promise<string | null> {
  const rows = (await (await getDb()).select<SqlRow[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  )) as SqlRow[];
  return rows.length > 0 ? String(rows[0].value) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await (
    await getDb()
  ).execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

function rowToProject(row: SqlRow): Project {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToGpxFile(row: SqlRow): GpxFile {
  return {
    id: Number(row.id),
    projectId: row.project_id === null || row.project_id === undefined ? null : Number(row.project_id),
    filePath: String(row.file_path),
    originalName: String(row.original_name),
    importedAt: String(row.imported_at),
    trackCount: Number(row.track_count),
    waypointCount: Number(row.waypoint_count),
    routeCount: Number(row.route_count),
    distanceM: Number(row.distance_m ?? 0),
    boundsMinLat: row.bounds_min_lat === null || row.bounds_min_lat === undefined ? null : Number(row.bounds_min_lat),
    boundsMinLon: row.bounds_min_lon === null || row.bounds_min_lon === undefined ? null : Number(row.bounds_min_lon),
    boundsMaxLat: row.bounds_max_lat === null || row.bounds_max_lat === undefined ? null : Number(row.bounds_max_lat),
    boundsMaxLon: row.bounds_max_lon === null || row.bounds_max_lon === undefined ? null : Number(row.bounds_max_lon),
  };
}
