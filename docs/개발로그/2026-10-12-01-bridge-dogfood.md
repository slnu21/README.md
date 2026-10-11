# 2026-10-12 (01) [v1.0 U2] 브리지 실사용 첫 기록 + 거기서 나온 작은 수정 다섯

브랜치 `develop-bridge-dogfood` · 기록 [notes/bridge-dogfood.md](../notes/bridge-dogfood.md)(1주 동안 계속 적는다)

## 무엇을 봤나

이 세션에 붙은 Store 0.10.0 브리지로 이 저장소 작업을 하려 했다. **대부분 못 썼다** — 사용자가 넣은 범위는 저장소마다
`docs\blog` 하나라 설계 문서·로드맵이 스코프 밖이다. 스코프는 설계대로다(사람이 고른 문서만). 그 안에서는 잘 됐다:
`outline` → `read_section` 으로 블로그 설치 절 9줄만 읽어 **README 에 비어 있던 Store 링크**를 찾았다.

걸린 것: 스니펫에 `\r\n` 이 그대로 · 스코프 밖 오류가 다음 수를 안 알려 줌 · 오류가 한국어 한 벌(설명은 영어) ·
저장소 `docs` 로 범위를 넓히면 그 안에 스코프 폴더가 있어도 통째로 거부.

## 고친 것

- `mcp/tools.rs` — `clean_snippet`(센티넬·줄바꿈·연속 공백) · `outside_scope`(사람에게 폴더를 넣어 달라 하거나 `place_doc`) ·
  오류 문구 전부 "한국어 / English" 두 벌(모듈 주석의 결정도 고침) · `search_docs` 의 `root` 는 스코프와 **겹치기만** 하면
  받고 결과는 `allows` 로 거른다.
- `scope.rs` — `Scope::overlaps`(스코프 안이거나, 스코프 루트·파일 참조를 품는 폴더). `allows` 는 그대로 — 범위가 넓어질 뿐
  스코프 밖 문서가 새지 않는다(테스트가 지킨다).
- **실구동에서 하나 더** — 릴리스 exe 를 진짜 MCP 파이프로(실사용 DB **사본**, `APPDATA` 로 격리) 돌리니 상위 폴더 `root` 가
  받아지고도 0건. `/` 로 준 `root` 를 LIKE 거친 필터에 그대로 넣어 `\` 경로가 하나도 안 걸렸다. **이전 판에서도 `/` 경로
  `root` 는 늘 0건**이었다는 뜻이다. 단위 테스트는 `\` 만 넣어 못 잡았다 → 구분자를 OS 모양으로 맞추고 `/` 경우를 테스트에.
- README(ko/en) Store 링크 `https://apps.microsoft.com/detail/9N9QMXQPND3H`(블로그 글 · `winget show` 로 게시자 SlnU 확인).
- 문서: features/agent-bridge.md(스코프 절 · 오류 언어) · CHANGELOG Unreleased(Changed 2 · Fixed 1) · roadmap U2 메모.

## 검증

`tsc` · vitest 749 · `cargo test --lib` 89 → **93**(스코프 상위 폴더 판정 · `search_docs` 상위·`/` root · 스코프 오류 · 스니펫) ·
clippy 0 · 새 테스트 둘은 고치기 전 코드로 돌려 FAIL 을 먼저 봤다 · **릴리스 exe MCP 실구동 7/7**(같은 스크립트로 Store
0.10.0 은 1/7 — 고치기 전 기준). 프로브는 해당 없음(앱 화면 무변경).

## 1.1 후보로 넘긴 것

`search_docs` 결과에 맞은 줄 번호 · 0건일 때 스코프 크기 힌트 · 스코프 밖 문서를 사람에게 묻고 들이는 흐름 · 업데이트 대기 알림.
