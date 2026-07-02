mod assets;
mod commands;
mod db;

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
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::fs_ops::read_file,
            commands::fs_ops::write_file,
            commands::fs_ops::read_dir_tree,
            commands::watch::watch_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
