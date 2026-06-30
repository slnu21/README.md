# 워크스페이스 / 가상 폴더

가져온 파일만 사용자가 원하는 계층으로 구성하는 가상 트리.

- 노드 종류: `virtual_folder`(컨테이너), `file_ref`(임의 경로 파일 참조), `imported_folder`(디스크 폴더 미러).
- 디스크 폴더 **가져오기** + 사용자 **가상 폴더** 동시 지원. 드래그로 재배치, 즐겨찾기 토글.
- 영속화: SQLite. 정의는 JSON export/import.
- 외부 변경은 파일 감시로 자동 반영.

스키마: [data-model.md](../data-model.md). 구현: `src/app/features/workspace`, `src/src-tauri/src/commands/workspace.rs`.
