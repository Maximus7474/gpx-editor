mod commands;
mod db;
mod gpxmeta;

use tauri::Manager;

use commands::gpx::LibraryDir;
use commands::updates::UpdateCheckCache;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Imported GPX files live in a managed folder under the app data
            // directory; SQLite only indexes them.
            let library_dir = app.path().app_data_dir()?.join("library");
            std::fs::create_dir_all(&library_dir)?;
            app.manage(LibraryDir(library_dir));
            app.manage(UpdateCheckCache(std::sync::Mutex::new(None)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::gpx::import_gpx_files,
            commands::gpx::read_gpx_file,
            commands::gpx::remove_library_file,
            commands::gpx::export_gpx_file,
            commands::gpx::save_trace,
            commands::gpx::write_trace_to_path,
            commands::gpx::library_dir,
            commands::elevation::lookup_elevations,
            commands::updates::app_version,
            commands::updates::check_for_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
