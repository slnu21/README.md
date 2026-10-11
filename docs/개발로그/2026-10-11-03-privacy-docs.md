# 2026-10-11 (03) [v1.0 U3] 개인정보 처리방침 — 브리지 절 + 로컬 저장 실물화 · architecture/overview 재작성

브랜치 `develop-privacy-docs` · WBS #922

## 배경

1.0 계획을 쓰며 찾은 것: Store 에 걸린 방침이 에이전트 브리지를 모른다. 사용자 질문 "MCP 는 연결 안 하면 그만이라
오프라인·기존 틀에서 벗어나는 건 없지?" — 맞다(같은 exe 의 모드 · 연결해야만 실행 · stdio · 포트 없음 · 앱은 아무것도
안 보냄). 방침에 보탤 것은 하나, **사용자가 연결한 에이전트는 온라인일 수 있고 그 처리는 에이전트의 방침을 따른다**는 것.

## 변경

- `docs/legal/privacy.md`(ko/en) 개정, 시행일 2026-10-11(최초 2026-07-02 병기):
  - **4절 AI 에이전트 연결(선택) 신설** — 연결해야만 동작 · stdio, 포트 없음 · 읽는 범위는 워크스페이스뿐, 고치기·지우기
    없음 · 제어 도구 기본 꺼짐 · 에이전트가 받은 내용은 에이전트 제공자의 방침 · 끊는 법.
  - **2절 로컬 저장을 실물로** — "향후 로컬 SQLite" 대신 실제로 저장하는 것 일곱: 설정·편의 / 워크스페이스 배치 /
    **검색 색인(본문 사본)** / **문서 기록(본문 사본, 상한)** / 받은 문서함 / 에이전트 연결 기록(`agentLastConnectedAt`) /
    테마 파일. 지금까지 방침에 없던 것은 "본문 사본"을 두 곳에 갖고 있다는 사실이다.
  - "제거하면 함께 삭제" → 설치 방식에 따라 `%APPDATA%\com.readme.app`·`%LOCALAPPDATA%\com.readme.app` 이 남을 수
    있다고 정직하게(MSIX 쓰기 가상화는 이미 있던 폴더에 쓰면 실제 AppData 로 통과한다 — v0.9.0 에서 실측).
  - 3절 — 업데이트 확인·오류 보고·통계 없음, 링크는 기본 브라우저에 넘길 뿐.
- `docs/design/architecture.md` 실물 기준 재작성 — 빠졌던 것: 브리지(같은 exe 의 모드) · 받은 문서함·기록·scope·app_paths·
  perf 모듈 · 실제 미리보기 파이프라인(이미지 data URI 인라인 · mermaid 메인 스레드 렌더 · 렌더러 지연 import). 틀렸던 것:
  PDF.js · "rusqlite 또는 plugin-sql" · IntersectionObserver 지연 렌더 · 디바운스 150~300ms · **"csp 는 null — 릴리스 전
  하드닝 예정"**(이미 적용됨) · `features/{preview,search,tabs,viewers}` 가 구현인 것처럼 적힌 것(초기 뼈대뿐).
- `docs/design/overview.md` — 한 줄 정의를 정체성으로("에이전트가 쓴 문서를, 사람이 읽는 자리"), 에이전트와 한 짝인
  세 기능 · 범위 밖에 "문서를 고치는 에이전트 도구" · 다음 판 링크.
- roadmap — U3 완료, U4 에 "리스팅의 '당신의 글은 기기에만 머문다'에 에이전트 연결 예외 한 줄" 추가.

## 결정·함정

- 방침의 약속은 **앱이 하는 일**로 한정한다 — "데이터가 기기를 떠나지 않는다"를 무조건문으로 쓰면 사용자가 온라인
  에이전트를 붙이는 순간 거짓이 된다. 앱은 안 보낸다 / 사용자가 붙인 에이전트는 자기 방침으로.
- Store 방침 URL 은 `main` 의 파일을 가리키므로 **실제 반영은 1.0 push 때**다(그 전 push 를 하면 그때 반영).
- `features/` 의 뼈대 파일(정리 안 된 `renderMarkdown` 스텁 등)은 이번 단위에서 지우지 않았다 — 문서만.

## 검증

문서만(코드 무변경). 방침에 적은 저장 항목은 코드로 대조: `db.rs` 마이그레이션 v1~v4 표 · `mcp/mod.rs` 의
`agentLastConnectedAt` · `commands/history.rs` 상한 · `tauri.conf.json` CSP 문자열 · `features/export/pdf.ts` 의 `print()` ·
`lib/markdown.ts` KaTeX `output:"mathml"` · `LANGS` 16개.
