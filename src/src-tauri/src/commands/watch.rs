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
/// 트리(`fs_ops::read_dir_tree`)·인덱스(`search::index_folder`)가 애초에 무시하는 디렉터리.
/// 저 둘과 같은 목록이어야 한다(각자 자기 파일에 사본을 둔다 — 공용 모듈은 아직 만들지 않았다).
const SKIP_DIRS: [&str; 6] = ["node_modules", ".git", "target", "dist", ".vs", ".idea"];

fn is_indexable(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| INDEX_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// 트리 재파생이 필요한(= 구조가 바뀐) 이벤트인가.
///
/// `Modify(Name(_))` 이 반드시 들어가야 한다 — 탐색기의 이름 변경은 Create/Remove 가 아니라
/// 여기로 온다(Windows ReadDirectoryChangesW 의 FILE_ACTION_RENAMED_OLD/NEW_NAME →
/// `RenameMode::From`/`To`).
///
/// 반대로 **`Modify(Any)` 는 넣으면 안 된다.** 같은 백엔드가 FILE_ACTION_MODIFIED(= 내용 변경)
/// 를 바로 그 `Modify(Any)` 로 준다 — 앱 자신의 저장이 여기 해당해서, 넣으면 저장할 때마다
/// 워크스페이스 전체가 다시 스캔된다(실구동 검증에서 저장 1회에 재파생 2회로 잡혔다).
/// 배포 대상이 Windows 뿐이라 이 매핑을 전제해도 된다.
fn is_structural(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(notify::event::ModifyKind::Name(_))
    )
}

/// 감시 루트 기준으로 숨김(`.`)·무거운 디렉터리 아래인가.
///
/// 가져온 루트는 **재귀** 감시라 `node_modules/`·`.git/` 안의 변경까지 전부 이벤트로 온다.
/// 트리도 인덱스도 그 아래를 안 보는데 인덱싱과 재파생만 태우고 있었다 — 여기서 원천 차단한다.
/// 루트 **자신**의 경로에 점 폴더가 있어도(예: `C:\x\.config` 를 직접 가져온 경우) 유효하므로
/// 루트 아래 상대 경로만 본다. 어느 루트에도 안 속하면(열린 파일의 상위 dir) 거르지 않는다.
fn is_noisy_under(path: &str, roots: &[String]) -> bool {
    roots.iter().any(|r| {
        crate::commands::search::rel_under(path, r).is_some_and(|rel| {
            rel.split(['/', '\\'])
                .any(|c| c.starts_with('.') || SKIP_DIRS.contains(&c))
        })
    })
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
    let roots_ev = roots.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let kind = event.kind;
            if !matches!(
                kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            ) {
                return;
            }
            // 가져온 루트 아래 node_modules/.git 등은 트리도 인덱스도 안 보는 곳이다 — 여기서 뺀다.
            let paths: Vec<&std::path::PathBuf> = event
                .paths
                .iter()
                .filter(|p| !is_noisy_under(p.to_string_lossy().as_ref(), &roots_ev))
                .collect();
            if paths.is_empty() {
                return;
            }
            let changed: Vec<String> = paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect();

            // 검색 인덱스 증분 갱신(md/txt 대상).
            if let Some(db) = app_ev.try_state::<Db>() {
                if let Ok(conn) = db.0.lock() {
                    let mut touched = false;
                    for p in &paths {
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

            // 트리 재파생용 — 구조가 바뀐 것만, 그리고 가져온 루트 아래만.
            // file-changed 와 분리한 이유: 저 쪽은 "열린 탭 조용한 리로드"라는 검증된 경로라
            // 페이로드·빈도를 건드리지 않고, 이쪽만 프런트에서 따로 스로틀하기 위해서다.
            if is_structural(&kind) {
                let structural: Vec<String> = changed
                    .iter()
                    .filter(|p| roots_ev.iter().any(|r| crate::commands::search::under_root(p, r)))
                    .cloned()
                    .collect();
                if !structural.is_empty() {
                    let _ = app_ev.emit("fs-structural", structural);
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

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, ModifyKind, RemoveKind, RenameMode};

    #[test]
    fn structural_kinds() {
        assert!(is_structural(&EventKind::Create(CreateKind::File)));
        assert!(is_structural(&EventKind::Remove(RemoveKind::File)));
        // 탐색기 이름 변경 — 이게 빠지면 폴더/파일 이름 변경이 트리에 안 붙는다
        assert!(is_structural(&EventKind::Modify(ModifyKind::Name(RenameMode::Both))));
        assert!(is_structural(&EventKind::Modify(ModifyKind::Name(RenameMode::From))));
        assert!(is_structural(&EventKind::Modify(ModifyKind::Name(RenameMode::To))));
        // Windows 백엔드는 **내용 변경**을 Modify(Any) 로 준다 — 앱 자신의 저장이 여기다.
        // 이게 구조 변경으로 새면 저장할 때마다 워크스페이스 전체가 다시 스캔된다.
        assert!(!is_structural(&EventKind::Modify(ModifyKind::Any)));
        assert!(!is_structural(&EventKind::Modify(ModifyKind::Data(DataChange::Content))));
        assert!(!is_structural(&EventKind::Access(notify::event::AccessKind::Read)));
    }

    #[test]
    fn noisy_paths_are_filtered_relative_to_root() {
        let roots = vec![r"C:\w".to_string()];
        assert!(is_noisy_under(r"C:\w\node_modules\pkg\readme.md", &roots));
        assert!(is_noisy_under(r"C:\w\.git\COMMIT_EDITMSG", &roots));
        assert!(is_noisy_under(r"C:\w\sub\target\out.md", &roots));
        assert!(is_noisy_under(r"C:\w\.hidden.md", &roots));
        assert!(!is_noisy_under(r"C:\w\docs\a.md", &roots));
        assert!(!is_noisy_under(r"C:\w\a.md", &roots));
        // 루트 밖(열린 파일의 상위 dir)은 거르지 않는다
        assert!(!is_noisy_under(r"D:\other\.config\a.md", &roots));
        // 루트 자신에 점 폴더가 있어도 유효 — 사용자가 직접 가져온 폴더다
        let dotted = vec![r"C:\x\.config".to_string()];
        assert!(!is_noisy_under(r"C:\x\.config\a.md", &dotted));
        assert!(is_noisy_under(r"C:\x\.config\.git\a.md", &dotted));
    }
}
