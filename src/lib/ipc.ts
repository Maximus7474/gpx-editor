import { invoke } from "@tauri-apps/api/core";
import type { ImportResult } from "./types/models";

/**
 * Thin typed wrappers over the Rust commands in src-tauri/src/commands/gpx.rs.
 * The frontend never touches the filesystem directly — file I/O always goes
 * through these commands.
 */

export function importGpxFiles(sourcePaths: string[]): Promise<ImportResult> {
  return invoke<ImportResult>("import_gpx_files", { sourcePaths });
}

/** Raw XML of a stored library file, parsed client-side for the viewer. */
export function readGpxFile(filePath: string): Promise<string> {
  return invoke<string>("read_gpx_file", { filePath });
}

export function removeLibraryFile(filePath: string): Promise<void> {
  return invoke<void>("remove_library_file", { filePath });
}

export function exportGpxFile(sourcePath: string, destPath: string): Promise<void> {
  return invoke<void>("export_gpx_file", { sourcePath, destPath });
}

/** Absolute path of the managed library folder (Settings page). */
export function getLibraryDir(): Promise<string> {
  return invoke<string>("library_dir");
}
