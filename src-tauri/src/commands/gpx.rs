//! Tauri commands for everything touching the on-disk GPX files.
//!
//! Imported files are copied into a managed library folder under the app data
//! directory — the user's originals are never modified. All reads/writes of
//! user-selected paths go through the native dialog plugin on the frontend;
//! these commands only accept paths that resolve inside the managed library
//! (except `import_gpx_files`, whose sources come from the file picker).

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

use crate::gpxmeta;

/// Managed location of the imported GPX library.
pub struct LibraryDir(pub PathBuf);

/// One successfully imported file, ready for the frontend to insert into the
/// SQLite index (the DB is written by the typed TS repository).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedGpx {
    /// Absolute path of the copy stored in the managed library.
    pub file_path: String,
    pub original_name: String,
    #[serde(flatten)]
    pub metadata: gpxmeta::GpxMetadata,
}

/// Per-file failure kept separate so one bad file doesn't abort a batch import.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub file_name: String,
    pub error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: Vec<ImportedGpx>,
    pub failed: Vec<ImportFailure>,
}

/// Pick files from the native dialog on the frontend, then pass the chosen
/// paths here to copy them into the managed library and parse their metadata.
#[tauri::command]
pub async fn import_gpx_files(
    library: State<'_, LibraryDir>,
    source_paths: Vec<String>,
) -> Result<ImportResult, String> {
    if source_paths.is_empty() {
        return Ok(ImportResult {
            imported: Vec::new(),
            failed: Vec::new(),
        });
    }
    ensure_library_dir(&library);

    let dir = library.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut imported = Vec::new();
        let mut failed = Vec::new();

        for source in source_paths {
            let source = PathBuf::from(source);
            let file_name = source
                .file_name()
                .and_then(|n| n.to_str())
                .map(String::from)
                .unwrap_or_else(|| "unnamed.gpx".to_string());

            let stored_name = unique_name(&file_name);
            let dest = dir.join(&stored_name);

            match fs::copy(&source, &dest) {
                Ok(_) => match gpxmeta::extract_metadata(&dest) {
                    Ok(metadata) => imported.push(ImportedGpx {
                        file_path: dest.to_string_lossy().into_owned(),
                        original_name: file_name,
                        metadata,
                    }),
                    Err(err) => {
                        let _ = fs::remove_file(&dest);
                        failed.push(ImportFailure { file_name, error: err });
                    }
                },
                Err(err) => failed.push(ImportFailure {
                    file_name,
                    error: format!("cannot copy file into library: {err}"),
                }),
            }
        }

        Ok(ImportResult { imported, failed })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read a stored GPX file back as raw XML so the frontend can parse the full
/// document for map rendering.
#[tauri::command]
pub async fn read_gpx_file(
    library: State<'_, LibraryDir>,
    file_path: String,
) -> Result<String, String> {
    let path = resolve_in_library(&library.0, &file_path)?;
    let content = tauri::async_runtime::spawn_blocking(move || fs::read_to_string(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("cannot read GPX file: {e}"))?;
    Ok(content)
}

/// Delete a stored file from the managed library. The frontend removes the
/// SQLite row first, so a failure here only orphans a file on disk.
#[tauri::command]
pub async fn remove_library_file(
    library: State<'_, LibraryDir>,
    file_path: String,
) -> Result<(), String> {
    let path = resolve_in_library(&library.0, &file_path)?;
    tauri::async_runtime::spawn_blocking(move || fs::remove_file(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("cannot delete file: {e}"))
}

/// Copy a stored GPX file to a user-chosen destination (native save dialog on
/// the frontend picks the destination). Phase 1 export is a plain copy of the
/// on-disk original.
#[tauri::command]
pub async fn export_gpx_file(
    library: State<'_, LibraryDir>,
    source_path: String,
    dest_path: String,
) -> Result<(), String> {
    let source = resolve_in_library(&library.0, &source_path)?;
    let dest = PathBuf::from(dest_path);
    if dest.is_dir() {
        return Err("destination is a directory".into());
    }
    tauri::async_runtime::spawn_blocking(move || fs::copy(&source, &dest))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("cannot export file: {e}"))?;
    Ok(())
}

/// Absolute path of the managed library folder (shown on the Settings page).
#[tauri::command]
pub fn library_dir(library: State<'_, LibraryDir>) -> Result<String, String> {
    Ok(library.0.to_string_lossy().into_owned())
}

fn ensure_library_dir(library: &LibraryDir) {
    if let Err(err) = fs::create_dir_all(&library.0) {
        eprintln!("cannot create library folder: {err}");
    }
}

/// Stored files are named `<nanos>_<original name>` so concurrent imports of
/// same-named files never collide.
fn unique_name(original: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos}_{original}")
}

/// Reject any path that does not resolve inside the managed library so these
/// commands can't be used to touch arbitrary files.
fn resolve_in_library(library: &Path, raw: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(raw);
    if !candidate.is_absolute() {
        return Err("path must be absolute".into());
    }
    if candidate.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("invalid path".into());
    }
    if !candidate.starts_with(library) {
        return Err("path is outside the managed library".into());
    }
    Ok(candidate)
}
