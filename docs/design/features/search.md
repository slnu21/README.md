# 검색

- **문서 내 검색**: CodeMirror 기본 검색(찾기/바꾸기).
- **워크스페이스 전역 검색**: SQLite **FTS5** 인덱스. 가져오기·파일 감시 변경 시 갱신. 100% 오프라인.

구현: `src/app/features/search`, `src/src-tauri/src/commands/search.rs`, `db.rs`(FTS5).
