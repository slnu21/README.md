# 워크스페이스 / 가상 폴더

가져온 파일만 사용자가 원하는 계층으로 구성하는 가상 트리.

- 노드 종류: `virtual_folder`(컨테이너), `file_ref`(임의 경로 파일 참조), `imported_folder`(디스크 폴더 미러).
- 디스크 폴더 **가져오기** + 사용자 **가상 폴더** 동시 지원. 드래그로 재배치, 즐겨찾기 토글.
- 영속화: SQLite. 정의는 JSON export/import.
- 외부 변경은 파일 감시로 자동 반영 — 감시기가 **구조 변경**(생성·삭제·이름변경)만 골라
  `fs-structural` 을 emit 하고, 프런트가 스로틀(선두 즉시 + 2s 바닥)해 `refreshWorkspace()` 로
  트리를 재파생한다. 내용만 바뀐 저장은 제외한다(앱 자신의 저장마다 전체 재스캔이 도는 것을 막는다).
- 수동 재동기화: 사이드바 새로고침 버튼 · `imported_folder` 우클릭 "다시 스캔" · 명령 팔레트 · `F5`.
  트리 재파생 + 가져온 루트별 재색인(추가·수정 반영 + 사라진 파일 정리)을 함께 한다.
- 원본 폴더를 읽지 못하면 `TreeNode.missing` 으로 표시한다(조용히 빈 폴더로 두지 않는다).
- 새 문서 만들기: `features/workspace/newDoc.ts` — 이름 정규화(`lib/paths.ts normalizeDocName`)
  → Rust `create_file`(`create_new` 라 덮어쓰지 않는다) → 탭 열기 → 트리·색인 갱신.

스키마: [data-model.md](../data-model.md). 구현: `src/app/features/workspace`, `src/src-tauri/src/commands/workspace.rs`.
