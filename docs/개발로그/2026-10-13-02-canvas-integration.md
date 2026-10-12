# 2026-10-13 (02) [v1.1 C3] 캔버스 연동 — 검색 · 기록 · 받은 문서함 · 트리 · 새 캔버스 · 브리지

브랜치 `develop-canvas-integration` · [ADR 0004](../design/decisions/0004-canvas-document-map.md) 7·8절 · [features/canvas.md](../design/features/canvas.md) "다른 기능과"

## 변경

- Rust `search.rs` — `.canvas` 색인 대상 · **`canvas_text`**(text 노드 글 · 그룹·선 라벨 · file 경로 · link 주소만 — JSON 키·숫자는 안 넣는다) ·
  **캔버스 기록은 색인할 때마다 지금 원문(JSON)으로**(색인 내용이 뽑아낸 글이라 "덮기 직전 색인 내용"으로 뜨면 되돌릴 때 JSON 이 망가진다) ·
  지울 때도 색인 내용으로는 안 뜬다. `is_indexable` 을 `pub(crate)` 로.
- Rust `watch.rs` — **자기 사본 `INDEX_EXTS` 를 지우고 `search::is_indexable` 을 쓴다**(아래 함정).
- Rust `mcp/tools.rs` — `open_in_app`·`place_doc` 이 `.canvas` 를 받는다 · `search_docs` 는 캔버스 결과에 `line` 을 안 준다.
- 프런트 — 트리에서 끌어 캔버스에 놓으면 file 노드(`canvas-drop-file` 이벤트 · 캔버스 위에선 이동 불가 항목도 금지 칩이 안 뜬다) ·
  팔레트 [새 캔버스](ko/en) · 문서: features/canvas.md · agent-bridge.md · ADR 0004 상태.

## 검증

- cargo 110 → **111**(`a_canvas_indexes_only_its_words_and_its_history_holds_the_json` — 글로 찾고 키로 못 찾음 · 바뀌기 전 판이 원문 JSON ·
  지워도 뽑아낸 글로 판을 안 뜸) · clippy 0 · vitest 851 · `tsc` · `probe:canvas` PASS(+ 트리 → 캔버스 끌어 놓기) · `probe:layout` PASS.
- **릴리스 exe 실구동 7/7**(임시 식별자): 폴더를 가져오면 캔버스가 text 노드 글로 검색되고 `nodes` 로는 안 걸림 · **밖에서 고친 캔버스가 감시기로
  다시 색인** · 기록의 판이 전부 원문 JSON(바뀌기 전 판 포함) · 받은 문서함에 고쳐진 캔버스 · **브리지 `open_in_app(.canvas)` → 열린 창에 캔버스**.
  끝나고 임시 exe 프로세스·임시 데이터 폴더 정리(실사용 무접촉).

## 함정

- **감시기가 색인 대상 목록의 사본을 들고 있었다** — `search.rs` 에 `.canvas` 를 넣었는데 `watch.rs` 의 사본은 그대로라, 밖에서 고친 캔버스가 다시
  색인되지 않았다(받은 문서함·기록·검색이 전부 낡음). 단위 테스트는 `index_file` 을 직접 불러 못 잡았다 — 실구동에서 찾았다. 판정 하나로 합쳤다.
  (`SKIP_DIRS` 는 아직 세 곳에 사본이 있다 — 주석이 그렇다고 적고 있다.)
- 실구동 스크립트에서 IPC 로 폴더만 넣으면 앱이 모른다(감시기·부팅 재색인 없음) — 앱이 하는 대로 다시 불러와야 했다.
