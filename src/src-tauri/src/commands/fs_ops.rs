//! 파일 읽기/쓰기 · 디렉터리 나열 등 로컬 파일 I/O 커맨드.
//! Rust 백엔드는 일반 데스크톱 프로세스와 동일한 풀 파일시스템 접근 권한을 가진다
//! (JS측 fs 스코프/경로 탐색 제약을 우회). 임의 경로 읽기·쓰기·편집에 사용.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 파일 바이트를 base64로 반환(내보내기 시 로컬 이미지 data URI 내장용).
/// 프론트에서 asset URL은 CSP connect-src로 fetch가 막혀 IPC(Rust)로 읽는다.
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(bytes))
}

#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// base64 바이트를 파일로 저장(클립보드 이미지 붙여넣기). read_file_base64 의 대칭.
/// write_file 은 String 만 받아 바이너리를 쓸 수 없다(무손실 왕복 불가).
/// 부모 폴더가 없으면 만든다 — 문서 옆 `assets/` 는 대개 처음엔 존재하지 않는다.
#[tauri::command]
pub fn write_file_base64(path: String, b64: String) -> Result<(), String> {
    let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
    if let Some(dir) = Path::new(&path).parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// 새 문서 생성. 부모 폴더가 없으면 만들고, **이미 있으면 실패**한다.
///
/// `write_file` 을 쓰지 않는 이유: 그건 조용히 덮어쓴다. "새 문서 만들기"가 남의 문서를
/// 날리면 안 된다. 프런트에서 path_exists 로 먼저 확인하는 방법도 있지만 확인과 쓰기 사이가
/// 벌어져(TOCTOU) 완전하지 않다 — `create_new(true)` 는 OS 가 원자적으로 보장한다.
/// 이미 있을 때만 "EEXIST" 를 돌려준다(프런트가 이 문자열로 분기해 지역화 메시지를 낸다).
#[tauri::command]
pub fn create_file(path: String, contents: Option<String>) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(dir) = p.parent() {
        if !dir.as_os_str().is_empty() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
    }
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(p)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                "EEXIST".to_string()
            } else {
                e.to_string()
            }
        })?;
    use std::io::Write;
    f.write_all(contents.unwrap_or_default().as_bytes())
        .map_err(|e| e.to_string())
}

/// 경로 존재 여부 — 이미지 저장 시 파일명 충돌을 피해 뒤 번호를 올리는 데 쓴다.
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// 드롭된 경로가 폴더인지 판별(파일 열기 vs 폴더 가져오기 분기용).
#[tauri::command]
pub fn path_is_dir(path: String) -> bool {
    Path::new(&path).is_dir()
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
