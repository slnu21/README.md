# 아키텍처

> 2026-10-11 실물 기준으로 다시 썼다(v0.10.0 + 성능 예산). 처음 문서는 설계 당시의 계획이라 PDF.js·지연
> 렌더(IntersectionObserver)·CSP null 같은, 실제로는 가지 않은 길이 섞여 있었다.

## 기술 스택
| 영역 | 선택 | 비고 |
|---|---|---|
| 셸 | **Tauri v2** (Rust) | 경량 번들, WebView2(Win11 기본 탑재) |
| UI | **React + TypeScript + Vite** | 프런트 소스는 `src/app/`(Tauri 기본 `src/` 아님) |
| 상태 | **Zustand** | `app/store/` — 일부 localStorage 영속 |
| i18n | **i18next / react-i18next** | ko/en, 로케일 번들 |
| 에디터 | **CodeMirror 6** | 뷰포트 렌더링 → 대용량 강함 |
| 마크다운 | **markdown-it** + 플러그인 | 워커에서 렌더 |
| 수식 / 하이라이트 | **KaTeX(MathML 출력) / highlight.js(큐레이션 16개 언어)** | 워커 청크에 포함 |
| 다이어그램 | **mermaid** | 첫 다이어그램 때 동적 import, 메인 스레드 렌더 |
| 정화 | **DOMPurify** | 렌더 HTML·SVG XSS 차단 |
| 영속화/검색 | **SQLite + FTS5** | `rusqlite`(bundled) — 스키마 [data-model.md](data-model.md) |
| 파일 감시 | Rust **notify** | |
| PDF 내보내기 | **OS 인쇄 대화상자** | 숨김 iframe 에 자기완결 HTML → `print()` |

## 프로세스 경계
- **프런트엔드(WebView2)**: UI·에디터·미리보기·테마·i18n. (`src/app/`)
- **Rust 백엔드**: 파일 I/O(풀 접근), SQLite, 파일 감시, 셸 열기, 내보내기 지원. (`src/src-tauri/`)
- 둘 사이는 Tauri **command/invoke** + **event**. 권한은 capability ACL — 빌드로는 안 잡히니 실행 중인 앱에
  직접 invoke 해 확인한다([notes/development.md](../notes/development.md)).
- **에이전트 브리지(MCP) — 같은 exe 의 다른 모드.** `md-reader.exe mcp`(MSIX 별칭 `readme-md mcp`)는
  `main()` 에서 `tauri::Builder` **이전에** 갈라져 창 없이 stdio 로 MCP 를 말한다. 마이그레이션·single-instance
  를 안 타고, 같은 SQLite 를 WAL 로 함께 연다. 네트워크 포트는 열지 않는다. 결정: [ADR 0002](decisions/0002-agent-bridge-mcp.md) ·
  도구 계약: [features/agent-bridge.md](features/agent-bridge.md).

## 모듈 맵 (프런트엔드 `src/app/`)
- `shell/` — **실제 화면 대부분**: `AppShell`(툴바·레이아웃·단축키·명령) · `Editor` · `Preview` · `Presentation` ·
  `WorkspaceTree` · `CommandPalette` · `SettingsPopover` · `ThemePicker` · `HistoryModal` · `InboxPopover` ·
  `AgentBridgePanel` · `OutlineOverlay` · `FindReplace` · `Toast` 등.
- `features/editor` — CodeMirror 확장(액션 단일 진실원 `actions.ts` · 자동완성 · 표 도구 · 글 방향).
- `features/export` — HTML(자기완결)·PDF·HTML 복사. `features/workspace/newDoc.ts` — 새 문서 이름 규칙.
- `features/{preview,search,tabs,viewers}` — **초기 뼈대만 남은 자리**(구현은 `shell/`·`lib/` 에 있다).
  `features/licensing` — 유료화 엔타이틀먼트 스텁(전 기능 활성).
- `workers/markdown.worker.ts` — 렌더 워커(`renderWithToc` — 파싱 한 번으로 HTML·목차).
- `lib/` — 순수 로직 대부분: `markdown`(렌더러 설정) · `markdownLazy`(메인 스레드는 이것으로만 렌더러에
  닿는다) · `sanitize` · `renderDoc`(iframe 문서 조립·`PREVIEW_CSS`) · `mermaid`/`mermaidText` · `links`/`previewLinks` ·
  `previewImages` · `bidi` · `toolbarFit` · `tauri`(커맨드 래퍼) 등. 대부분 vitest 로 지킨다.
- `themes/` — 내장 3종 + 파일 테마(`themes.jsonc`·`themes\` 폴더)·prose 토큰·시드. `locales/`, `store/`.
- `dev/` — 프로브 하네스(앱 번들에 안 들어간다).

## 모듈 맵 (Rust `src/src-tauri/src/`)
- `commands/fs_ops` — 읽기/쓰기/새 파일(`create_new`)
- `commands/workspace` — 가상 트리·즐겨찾기·최근·설정
- `commands/search` — FTS5 색인(묶음 커밋 · rowid 짝)·질의(`ORDER BY rank`)
- `commands/watch` — notify 감시 → `file-changed`·`fs-structural` emit(소음 필터)
- `commands/inbox` — 받은 문서함(`doc_seen`) · `commands/history` — 문서 기록(`doc_snapshot`)
- `commands/agent` — 에이전트 연결 패널용 설정 · `commands/shell_open` — 로컬 파일 열기(확장자 허용 목록)
- `commands/export` — 내보내기 지원
- `mcp/` — 에이전트 브리지(JSON-RPC · 도구 · 소스 근사 아웃라인 파서) · `scope.rs` — 워크스페이스 스코프(브리지·받은 문서함 공유)
- `db.rs` — 연결·PRAGMA(WAL)·마이그레이션(append-only, v1~v4) · `app_paths.rs` — 사용자 데이터 경로(MSIX 가상화 판정)
- `assets.rs` — asset 스코프 · `perf.rs` — 성능 측정·판올림 리허설(`#[ignore]` 테스트)

## 미리보기 파이프라인
1. 에디터 변경 → **디바운스**(설정 `previewDelay` 200/500/1000ms, 기본 500).
2. 소스를 **Web Worker** 로 → markdown-it 파싱 + KaTeX(MathML) + 하이라이트 → HTML·목차.
3. 메인 스레드에서 **DOMPurify 정화** → 로컬 이미지를 **data URI 로 인라인**(Rust 가 바이트를 읽는다 — asset
   프로토콜의 스코프·CSP·경로 문제를 피한다).
4. mermaid 블록이 있으면 라이브러리를 그때 싣고 **메인 스레드에서 SVG 로 렌더**(측정 스테이지 · 직렬화 잠금).
5. **샌드박스 iframe**(`sandbox="allow-same-origin"`, `allow-scripts` 없음)의 `srcdoc` 에 주입. 스크롤 위치는
   소스 줄로 저장·복원한다.
- 프레젠테이션·HTML 내보내기는 같은 함수들을 메인 스레드에서 부른다(렌더러는 지연 import).

## 워크스페이스 / 가상 폴더
- 노드: `virtual_folder` | `file_ref` | `imported_folder` (계층, 순서). 가져온 폴더의 하위는 저장하지 않고
  렌더마다 디스크에서 파생한다.
- SQLite 에 영속화. 워크스페이스 정의는 JSON 으로 **내보내기/가져오기**(백업·이동).
- 상세 스키마: [data-model.md](data-model.md).

## 검색
- **문서 내**: CodeMirror 검색 + 찾기·바꾸기 패널.
- **전역**: SQLite **FTS5**(가져오기·감시 변경·부팅 재색인 때 갱신). 오프라인.

## 로컬 파일 접근
- `dialog` 로 파일/폴더 선택 → 경로 → **Rust(`std::fs`)** 로 임의 경로 읽기/쓰기(JS fs 플러그인 안 씀).
- 문서 안 링크: 웹 주소는 기본 브라우저로(`opener` `open_url`), 로컬 파일은 우리 커맨드가 확장자를 보고 연다
  (실행 파일·스크립트·로컬 html 은 거절하고 탐색기에서 위치만).

## 성능(대용량)
- CodeMirror 뷰포트 렌더 + 렌더 워커 + 디바운스 + 무거운 의존성(mermaid 동적 import · 렌더러는 메인에서 지연
  import) **코드 스플리팅**.
- **기준선·예산·재는 법은 [performance.md](performance.md)** — Rust 측정(`perf.rs`) · `npm run probe:perf` ·
  실물(`tools/perf-app.mjs`)이 예산 파일 하나(`src/tools/perf-budget.json`)를 공유한다.

## 오프라인 / 보안
- **앱은 외부로 아무것도 보내지 않는다** — 업데이트 확인·오류 보고·통계 없음. 모든 자산(폰트·테마·mermaid·KaTeX) 번들.
- **하드닝 CSP 적용**(`tauri.conf.json` `app.security.csp`): `default-src 'self'` · `script-src 'self'`(인라인
  스크립트 불가) · `img-src` 에 `data:`/`asset:` · 인라인 스타일 허용 · `connect-src` 는 IPC 만 · `object-src 'none'`.
- 렌더 HTML 정화 + 스크립트 없는 샌드박스 iframe. 테마·스타일 팩 값은 hex·열거값만 받고 `</style>` 을 막는다.
- 에이전트 브리지: stdio 전용(포트 없음) · 읽기 도구만(쓰기·삭제 도구 없음, 목록을 테스트가 지킨다) ·
  워크스페이스 스코프 · 제어 도구 기본 꺼짐. 연결한 에이전트가 읽은 내용의 처리는 그 에이전트의 몫 —
  [개인정보 처리방침](../legal/privacy.md) 4절.

## 유료화 대비
- `features/licensing` 엔타이틀먼트 스텁(현재 전 기능 활성). 기능 모듈화로 추후 게이팅(Store 인앱결제/유료 등재
  또는 라이선스 키). 1.0 에는 넣지 않는다 — 무료로 나간 기능은 유료로 돌리지 않는다([roadmap-1.0.md](roadmap-1.0.md)).
