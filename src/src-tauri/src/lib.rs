mod assets;
mod commands;
mod db;

use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::watch::WatchState::default())
        .setup(|app| {
            // SQLite 초기화 + 마이그레이션 후 상태 주입(app_data_dir 필요 → setup 단계).
            let database = db::init(app.handle()).expect("SQLite 초기화 실패");
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::fs_ops::read_file,
            commands::fs_ops::write_file,
            commands::fs_ops::read_dir_tree,
            commands::watch::watch_files,
            commands::workspace::ws_load,
            commands::workspace::ws_create_folder,
            commands::workspace::ws_rename,
            commands::workspace::ws_delete,
            commands::workspace::ws_add_file_ref,
            commands::workspace::ws_import_folder,
            commands::workspace::ws_move,
            commands::workspace::ws_toggle_favorite,
            commands::workspace::ws_touch_recent,
            commands::workspace::ws_export,
            commands::workspace::ws_import,
            commands::workspace::settings_get_all,
            commands::workspace::settings_set,
            commands::search::search_query,
            commands::search::search_index_folder,
            commands::search::search_reindex_path,
            commands::search::search_remove_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
