//! 파일 읽기/쓰기 · 디렉터리 나열 등 로컬 파일 I/O 커맨드.
//! Rust 백엔드는 일반 데스크톱 프로세스와 동일한 풀 파일시스템 접근 권한을 가진다
//! (JS측 fs 스코프/경로 탐색 제약을 우회). 임의 경로 읽기·쓰기·편집에 사용.
use serde::Serialize;
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// 워크스페이스 트리 노드(디스크 미러). 프론트의 WsNode 와 형태 일치(camelCase).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<DirEntryNode>,
}

/// 스캔에서 제외할 무거운/노이즈 디렉터리.
const SKIP_DIRS: [&str; 6] = ["node_modules", ".git", "target", "dist", ".vs", ".idea"];
/// 재귀 깊이 상한(과도한 스캔 방지). 초과 시 하위는 접힌 채 비움.
const MAX_DEPTH: usize = 8;

/// 폴더 가져오기: 경로를 재귀 스캔해 트리를 반환한다.
/// 숨김(.*)·무거운 디렉터리는 제외, 폴더 우선·이름순 정렬.
#[tauri::command]
pub fn read_dir_tree(path: String) -> Result<DirEntryNode, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err(format!("경로가 존재하지 않습니다: {path}"));
    }
    build_tree(root, 0)
}

fn build_tree(p: &Path, depth: usize) -> Result<DirEntryNode, String> {
    let name = p
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| p.to_string_lossy().into_owned());
    let is_dir = p.is_dir();
    let mut children = Vec::new();

    if is_dir && depth < MAX_DEPTH {
        let mut entries: Vec<_> = fs::read_dir(p)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|c| {
                let fname = c
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                if fname.starts_with('.') {
                    return false;
                }
                if c.is_dir() && SKIP_DIRS.contains(&fname.as_str()) {
                    return false;
                }
                true
            })
            .collect();

        // 폴더 우선, 그다음 이름순.
        entries.sort_by(|a, b| {
            let (ad, bd) = (a.is_dir(), b.is_dir());
            if ad != bd {
                bd.cmp(&ad)
            } else {
                a.file_name().cmp(&b.file_name())
            }
        });

        for c in entries {
            if let Ok(node) = build_tree(&c, depth + 1) {
                children.push(node);
            }
        }
    }

    Ok(DirEntryNode {
        name,
        path: p.to_string_lossy().into_owned(),
        is_dir,
        children,
    })
}

// TODO: rename/move/delete, 메타데이터 등
