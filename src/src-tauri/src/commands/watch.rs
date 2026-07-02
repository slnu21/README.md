//! 파일 감시(`notify`) → 외부 변경을 프런트로 `file-changed` emit + 검색 인덱스 증분 갱신.
//! 감시 대상: 열린 파일의 상위 디렉터리(NonRecursive, 리로드용) ∪ imported 루트(Recursive, 재인덱싱용).
use crate::db::Db;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// 현재 활성 워처(교체 시 이전 워처는 drop → 감시 해제).
#[derive(Default)]
pub struct WatchState(pub Mutex<Option<RecommendedWatcher>>);

const INDEX_EXTS: [&str; 4] = ["md", "markdown", "mdx", "txt"];

fn is_indexable(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| INDEX_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// 감시 대상을 (재)설정한다. open_paths=열린 파일(상위 dir 감시), imported_roots=가져온 폴더(재귀 감시).
#[tauri::command]
pub fn watch_files(
    app: AppHandle,
    state: State<WatchState>,
    open_paths: Vec<String>,
    imported_roots: Vec<String>,
) -> Result<(), String> {
    let mut dirs: HashSet<String> = HashSet::new();
    for p in &open_paths {
        if let Some(parent) = Path::new(p).parent() {
            if parent.exists() {
                dirs.insert(parent.to_string_lossy().into_owned());
            }
        }
    }
    let roots: Vec<String> = imported_roots
        .iter()
        .filter(|r| Path::new(r).exists())
        .cloned()
        .collect();

    // 감시 대상이 없으면 기존 워처 해제.
    if dirs.is_empty() && roots.is_empty() {
        *state.0.lock().map_err(|e| e.to_string())? = None;
        return Ok(());
    }

    let app_ev = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let kind = event.kind;
            if !matches!(
                kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            ) {
                return;
            }
            let changed: Vec<String> = event
                .paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            if changed.is_empty() {
                return;
            }

            // 검색 인덱스 증분 갱신(md/txt 대상).
            if let Some(db) = app_ev.try_state::<Db>() {
                if let Ok(conn) = db.0.lock() {
                    let mut touched = false;
                    for p in &event.paths {
                        let ps = p.to_string_lossy();
                        if matches!(kind, EventKind::Remove(_)) {
                            let _ = crate::commands::search::remove_path(&conn, ps.as_ref());
                            touched = true;
                        } else if is_indexable(p) {
                            let _ = crate::commands::search::index_file(&conn, ps.as_ref());
                            touched = true;
                        }
                    }
                    if touched {
                        let _ = app_ev.emit("index-updated", ());
                    }
                }
            }

            // 에디터 조용한 리로드용(기존 동작 유지).
            let _ = app_ev.emit("file-changed", changed);
        }
    })
    .map_err(|e| e.to_string())?;

    for d in &dirs {
        let _ = watcher.watch(Path::new(d), RecursiveMode::NonRecursive);
    }
    for r in &roots {
        let _ = watcher.watch(Path::new(r), RecursiveMode::Recursive);
    }

    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}
