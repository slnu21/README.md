mod assets;
mod commands;
mod db;

use std::sync::Mutex;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// .md 연결/명령행으로 넘어온 "열어야 할 파일 경로"를 프론트가 마운트 시 가져가도록 보관.
/// 콜드 스타트(앱이 꺼져 있던 경우)는 setup에서 argv를 읽어 채우고,
/// 웜 스타트(이미 실행 중)는 single-instance 콜백이 open-file 이벤트로 직접 전달한다.
pub struct PendingOpen(pub Mutex<Option<String>>);

/// argv(첫 요소=exe 제외)에서 실제 존재하는 첫 파일 경로를 고른다(플래그·비존재 경로 무시).
fn first_openable_arg<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && std::path::Path::new(a).is_file())
}

/// 프론트가 부팅 시 1회 호출 — 대기 중인 파일 경로를 꺼내 비운다.
#[tauri::command]
fn take_pending_open(state: tauri::State<PendingOpen>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)] // release에서만 single-instance 등록으로 재대입(디버그는 미사용)
    let mut builder = tauri::Builder::default();

    // single-instance는 **릴리스에서만** 활성. 두 번째 실행(예: .md 더블클릭) 시 새 프로세스는
    // 종료되고 argv가 콜백으로 전달된다 → 기존 창 포커스 + open-file emit(웜 스타트).
    // 개발(디버그)에선 끈다 — 새 dev 빌드가 기존 인스턴스와 충돌해 즉시 종료되는 문제를 피하기 위해.
    #[cfg(not(debug_assertions))]
    {
        use tauri::Emitter;
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = first_openable_arg(argv) {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.set_focus();
                }
                let _ = app.emit("open-file", path);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::watch::WatchState::default())
        .setup(|app| {
            // SQLite 초기화 + 마이그레이션 후 상태 주입(app_data_dir 필요 → setup 단계).
            let database = db::init(app.handle()).expect("SQLite 초기화 실패");
            app.manage(database);
            // 콜드 스타트: 명령행 인자의 파일 경로를 대기열에 저장(프론트가 마운트 시 take_pending_open).
            app.manage(PendingOpen(Mutex::new(first_openable_arg(std::env::args()))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            take_pending_open,
            commands::fs_ops::read_file,
            commands::fs_ops::read_file_base64,
            commands::fs_ops::write_file,
            commands::fs_ops::path_is_dir,
            commands::fs_ops::read_dir_tree,
            commands::watch::watch_files,
            commands::workspace::ws_load,
            commands::workspace::ws_create_folder,
            commands::workspace::ws_rename,
            commands::workspace::ws_delete,
            commands::workspace::ws_add_file_ref,
            commands::workspace::ws_import_folder,
            commands::workspace::ws_move,
            commands::workspace::ws_reorder,
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
