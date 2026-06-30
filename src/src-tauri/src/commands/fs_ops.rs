//! 파일 읽기/쓰기 등 로컬 파일 I/O 커맨드.
//! Rust 백엔드는 일반 데스크톱 프로세스와 동일한 풀 파일시스템 접근 권한을 가진다
//! (JS측 fs 스코프/경로 탐색 제약을 우회). 임의 경로 읽기·쓰기·편집에 사용.
use std::fs;

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

// TODO: rename/move/delete, 메타데이터, 디렉터리 나열 등
