/** Row types for the SQLite library index (see src-tauri/src/db/mod.rs). */

export interface Project {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/** A GpxFileRow maps the file to a stored copy on disk. */
export interface GpxFile {
  id: number;
  projectId: number | null;
  filePath: string;
  originalName: string;
  name: string | null;
  importedAt: string;
  trackCount: number;
  waypointCount: number;
  routeCount: number;
  /** Precomputed length in meters (0 when the file has no track/route). */
  distanceM: number;
  boundsMinLat: number | null;
  boundsMinLon: number | null;
  boundsMaxLat: number | null;
  boundsMaxLon: number | null;
}

export function fileDisplayName(file: GpxFile): string {
  return file.name ?? file.originalName;
}

/** A GpxFile's lat/lon bounds as stored, when present. */
export interface StoredBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/** One file that Rust copied into the managed library, awaiting DB insert. */
export interface ImportedGpx {
  filePath: string;
  originalName: string;
  name?: string | null;
  trackCount: number;
  waypointCount: number;
  routeCount: number;
  distanceM: number;
  bounds?: StoredBounds | null;
}

export interface ImportFailure {
  fileName: string;
  error: string;
}

export interface ImportResult {
  imported: ImportedGpx[];
  failed: ImportFailure[];
}
