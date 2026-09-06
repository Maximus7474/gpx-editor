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

/// Serialize an in-editor trace (GPX XML) into the managed library and
/// re-extract its metadata so the SQLite index stays in sync. Pass
/// `file_path` to re-save over an existing library file (e.g. after further
/// edits); without it a new uniquely-named file is created.
#[tauri::command]
pub async fn save_trace(
    library: State<'_, LibraryDir>,
    xml: String,
    desired_name: String,
    file_path: Option<String>,
) -> Result<ImportedGpx, String> {
    if xml.trim().is_empty() {
        return Err("cannot save an empty GPX document".into());
    }

    let dir = library.0.clone();
    let (dest, original_name, remove_on_error) = match &file_path {
        Some(path) => {
            let dest = resolve_in_library(&dir, path)?;
            let name = dest
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("trace.gpx")
                .to_string();
            (dest, name, false)
        }
        None => {
            ensure_library_dir(&library);
            let name = sanitize_trace_name(&desired_name);
            (dir.join(unique_name(&name)), name, true)
        }
    };

    let dest_for_task = dest.clone();
    tauri::async_runtime::spawn_blocking(move || {
        fs::write(&dest_for_task, xml.as_bytes())
            .map_err(|e| format!("cannot write GPX file: {e}"))?;
        match gpxmeta::extract_metadata(&dest_for_task) {
            Ok(metadata) => Ok(metadata),
            Err(err) => {
                // Only delete files we just created — never a valid pre-existing
                // library file whose re-save failed.
                if remove_on_error {
                    let _ = fs::remove_file(&dest_for_task);
                }
                Err(err)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
    .map(|metadata| ImportedGpx {
        file_path: dest.to_string_lossy().into_owned(),
        original_name,
        metadata,
    })
}

/// Write a serialized GPX document to a user-chosen destination (native save
/// dialog on the frontend picks the path). Used by "Save a copy…" — no
/// library/DB involvement.
#[tauri::command]
pub async fn write_trace_to_path(dest_path: String, xml: String) -> Result<(), String> {
    if xml.trim().is_empty() {
        return Err("cannot save an empty GPX document".into());
    }
    let dest = PathBuf::from(dest_path);
    if dest.is_dir() {
        return Err("destination is a directory".into());
    }
    tauri::async_runtime::spawn_blocking(move || fs::write(&dest, xml.as_bytes()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("cannot write GPX file: {e}"))
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

/// Turn a user-entered trace name into a safe `.gpx` file name: trim, replace
/// path-hostile characters, and guarantee the extension.
fn sanitize_trace_name(raw: &str) -> String {
    let name: String = raw
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ' ' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let name = name.trim().trim_matches('.').trim();
    if name.is_empty() {
        return "trace.gpx".to_string();
    }
    if name.ends_with(".gpx") {
        name.to_string()
    } else {
        format!("{name}.gpx")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_trace_names() {
        assert_eq!(sanitize_trace_name("  My Course  "), "My Course.gpx");
        assert_eq!(sanitize_trace_name("a/b:c*gpx"), "a_b_c_gpx.gpx");
        assert_eq!(sanitize_trace_name("trail.gpx"), "trail.gpx");
        assert_eq!(sanitize_trace_name(".."), "trace.gpx");
        assert_eq!(sanitize_trace_name(""), "trace.gpx");
    }

    #[test]
    fn saved_document_round_trips_through_metadata_extraction() {
        let dir = std::env::temp_dir().join(format!("gpx_save_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sample.gpx");
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>My Course</name></metadata>
  <trk><name>My Course</name><trkseg>
    <trkpt lat="48.858950" lon="2.277020" />
    <trkpt lat="48.859500" lon="2.279000" />
  </trkseg></trk>
  <wpt lat="48.858950" lon="2.277020"><name>Start</name><type>Start</type></wpt>
</gpx>"#;
        std::fs::write(&path, xml).unwrap();
        let meta = gpxmeta::extract_metadata(&path).unwrap();
        assert_eq!(meta.name.as_deref(), Some("My Course"));
        assert_eq!(meta.track_count, 1);
        assert_eq!(meta.waypoint_count, 1);
        assert!(meta.distance_m > 0.0);
        let bounds = meta.bounds.unwrap();
        assert!(bounds.min_lat <= 48.8595 && bounds.max_lat >= 48.8595);
        let _ = std::fs::remove_dir_all(&dir);
    }
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
