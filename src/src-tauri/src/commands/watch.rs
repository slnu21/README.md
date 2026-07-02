//! 파일 감시(`notify`) → 외부 변경을 프런트로 `file-changed` 이벤트 emit.
//! 열린 파일들의 상위 디렉터리를 감시(원자적 저장 rename 대응). 워처는 Tauri state로 보관.
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// 현재 활성 워처(교체 시 이전 워처는 drop → 감시 해제).
#[derive(Default)]
pub struct WatchState(pub Mutex<Option<RecommendedWatcher>>);

/// 주어진 파일들의 상위 디렉터리를 감시하도록 워처를 (재)설정한다.
#[tauri::command]
pub fn watch_files(app: AppHandle, state: State<WatchState>, paths: Vec<String>) -> Result<(), String> {
    // 감시할 상위 디렉터리 집합(중복 제거).
    let mut dirs: HashSet<String> = HashSet::new();
    for p in &paths {
        if let Some(parent) = Path::new(p).parent() {
            if parent.exists() {
                dirs.insert(parent.to_string_lossy().into_owned());
            }
        }
    }

    // 열린 파일이 없으면 기존 워처 해제.
    if dirs.is_empty() {
        *state.0.lock().map_err(|e| e.to_string())? = None;
        return Ok(());
    }

    let app_ev = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            ) {
                let changed: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if !changed.is_empty() {
                    let _ = app_ev.emit("file-changed", changed);
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;

    for d in &dirs {
        // 개별 디렉터리 감시 실패는 무시(다른 디렉터리 감시는 유지).
        let _ = watcher.watch(Path::new(d), RecursiveMode::NonRecursive);
    }

    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}
