mod app_paths;
mod assets;
mod commands;
mod db;
mod perf;
/// 에이전트 브리지(MCP stdio 서버). `main` 이 Tauri 를 세우기 전에 갈라져 들어온다 — ADR 0002.
pub mod mcp;
mod scope;

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
pub struct PendingOpen(pub Mutex<Option<PendingFile>>);

/// 열어야 할 파일과, 있으면 그 파일에서 보여 줄 줄(1-based — 에이전트 브리지 `open_in_app(line)`).
#[derive(Clone, serde::Serialize)]
pub struct PendingFile {
    pub path: String,
    pub line: Option<u32>,
}

/// 줄 지정 플래그. 브리지가 붙이고(`mcp::tools::launch_args`) 여기서 읽는다 — 한 토큰이라야 한다.
pub(crate) const LINE_FLAG: &str = "--line=";

/// argv(첫 요소=exe 제외)에서 실제 존재하는 첫 파일 경로를 고른다(플래그·비존재 경로 무시).
fn first_openable_arg<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && std::path::Path::new(a).is_file())
}

/// argv 의 `--line=N`(N ≥ 1). 없거나 숫자가 아니면 None — 줄은 덤이라 틀려도 파일은 연다.
pub(crate) fn line_from_args<I: IntoIterator<Item = String>>(args: I) -> Option<u32> {
    args.into_iter().skip(1).find_map(|a| {
        let head = a.get(..LINE_FLAG.len())?;
        if !head.eq_ignore_ascii_case(LINE_FLAG) {
            return None;
        }
        a[LINE_FLAG.len()..].trim().parse::<u32>().ok().filter(|&n| n >= 1)
    })
}

/// 프론트가 부팅 시 1회 호출 — 대기 중인 파일(과 줄)을 꺼내 비운다.
#[tauri::command]
fn take_pending_open(state: tauri::State<PendingOpen>) -> Option<PendingFile> {
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
            // 두 번째 실행(예: .md 더블클릭)마다 기존 창을 **확실히 앞으로** 올린다.
            // set_focus()만으로는 Windows에서 최소화/뒤에 있는 창이 올라오지 않으므로
            // unminimize → show → set_focus 순서로 복원·표시·포커스한다(파일 유무와 무관하게).
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
            // 에이전트 브리지의 `open_in_app(beside)` 이 이 플래그를 달아 우리 exe 를 다시 띄운다.
            // 콜드 스타트에는 옆 패널이라는 개념이 없으므로 여기(웜 스타트)에서만 의미가 있다.
            let beside = argv.iter().any(|a| a.eq_ignore_ascii_case("--beside"));
            let line = line_from_args(argv.iter().cloned());
            if let Some(path) = first_openable_arg(argv) {
                let _ = app.emit(if beside { "open-file-beside" } else { "open-file" }, path.clone());
                // 줄은 따로 알린다 — 프런트는 그 문서의 미리보기가 **그려진 뒤에** 스크롤해야 한다.
                if let Some(line) = line {
                    let _ = app.emit("reveal-line", PendingFile { path, line: Some(line) });
                }
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
            let pending = first_openable_arg(std::env::args())
                .map(|path| PendingFile { path, line: line_from_args(std::env::args()) });
            // .md 연결로 실행된 콜드 스타트 → 창을 명시적으로 표시·포커스(파일이 곧 열림을 사용자가 인지).
            if pending.is_some() {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            app.manage(PendingOpen(Mutex::new(pending)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            take_pending_open,
            commands::agent::agent_info,
            commands::history::history_list,
            commands::history::history_get,
            commands::history::history_restore,
            commands::inbox::inbox_list,
            commands::inbox::inbox_mark_seen,
            commands::inbox::inbox_mark_all_seen,
            commands::fs_ops::read_file,
            commands::fs_ops::read_file_base64,
            commands::fs_ops::write_file,
            commands::fs_ops::write_file_base64,
            commands::fs_ops::create_file,
            commands::fs_ops::path_exists,
            commands::fs_ops::path_is_dir,
            commands::fs_ops::read_dir_tree,
            commands::fs_ops::theme_file_path,
            commands::fs_ops::theme_dir_path,
            commands::fs_ops::read_theme_bundle,
            commands::shell_open::open_with_default,
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

#[cfg(test)]
mod tests {
    use super::line_from_args;

    fn argv(a: &[&str]) -> Vec<String> {
        std::iter::once("exe").chain(a.iter().copied()).map(String::from).collect()
    }

    #[test]
    fn line_flag_is_read_and_bad_values_are_ignored() {
        assert_eq!(line_from_args(argv(&["--line=40", "a.md"])), Some(40));
        assert_eq!(line_from_args(argv(&["a.md", "--LINE=3"])), Some(3));
        assert_eq!(line_from_args(argv(&["a.md"])), None);
        for bad in ["--line=0", "--line=-2", "--line=x", "--line=", "--line", "--lines=4"] {
            assert_eq!(line_from_args(argv(&[bad, "a.md"])), None, "{bad}");
        }
        // exe 자리(argv[0])는 보지 않는다.
        assert_eq!(line_from_args(vec!["--line=9".to_string()]), None);
    }
}
