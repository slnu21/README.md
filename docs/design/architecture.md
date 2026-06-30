# 아키텍처

## 기술 스택
| 영역 | 선택 | 비고 |
|---|---|---|
| 셸 | **Tauri v2** (Rust) | 경량 번들, WebView2(Win11 기본 탑재) |
| UI | **React + TypeScript + Vite** | |
| 상태 | **Zustand** | |
| i18n | **i18next / react-i18next** | ko/en, 로케일 번들 |
| 에디터 | **CodeMirror 6** | 뷰포트 렌더링 → 대용량 강함 |
| 마크다운 | **markdown-it** + 플러그인 | "최대 기능", 동기·고속 |
| 수식/다이어그램/하이라이트 | **KaTeX / mermaid / highlight.js** | mermaid·언어는 지연 로드 |
| 정화 | **DOMPurify** | 렌더 HTML XSS 차단 |
| PDF 보기 | **PDF.js** | 코드 분할 로드 |
| 영속화/검색 | **SQLite + FTS5** | rusqlite 또는 tauri-plugin-sql |
| 파일 감시 | Rust **notify** | |
| PDF 내보내기 | **WebView2 인쇄(print-to-PDF)** | |

## 프로세스 경계
- **프론트엔드(WebView2)**: UI·에디터·미리보기·테마·i18n. (`src/app/`)
- **Rust 백엔드**: 파일 I/O(풀 접근), SQLite, 파일 감시, asset 리졸브, 내보내기 지원. (`src/src-tauri/`)
- 둘 사이는 Tauri **command/invoke** + **event**로 통신.

## 모듈 맵 (프론트엔드 `src/app/`)
- `features/editor` — CodeMirror 통합
- `features/preview` — 렌더 파이프라인(워커→정화→iframe)
- `features/workspace` — 가상 폴더 트리·즐겨찾기·최근
- `features/search` — 문서 내 / 전역(FTS5)
- `features/tabs` — 열린 파일 탭
- `features/export` — HTML/PDF 내보내기
- `features/viewers` — html/pdf 뷰어(후순위)
- `features/licensing` — 유료화 엔타이틀먼트 스텁
- `workers/markdown.worker.ts` — 렌더 워커
- `lib/` — Tauri 커맨드 래퍼, markdown 설정, i18n
- `themes/`, `locales/`, `store/`

## 모듈 맵 (Rust `src/src-tauri/src/`)
- `commands/fs_ops` — 읽기/쓰기 (구현됨: `read_file`, `write_file`)
- `commands/workspace` — 가상 트리·즐겨찾기·최근 (SQLite)
- `commands/search` — FTS5 인덱싱/질의
- `commands/watch` — notify 파일 감시 → 이벤트 emit
- `commands/export` — PDF(인쇄)/HTML 지원
- `db.rs` — SQLite 연결·마이그레이션·FTS5
- `assets.rs` — 로컬 리소스(상대경로 이미지) asset 스코프

## 미리보기 파이프라인
1. 에디터 변경 → **디바운스(150–300ms)**.
2. 소스를 **Web Worker**로 전달 → markdown-it 파싱 + 코드 하이라이트.
3. 메인 스레드에서 **DOMPurify 정화**.
4. **샌드박스 iframe**(`sandbox`, srcdoc)에 주입 — 스크립트 실행 격리.
5. mermaid/KaTeX 블록은 **IntersectionObserver**로 보일 때만 렌더(지연).

## 워크스페이스 / 가상 폴더
- 노드: `virtual_folder` | `file_ref` | `imported_folder` (계층, 순서, 즐겨찾기).
- 디스크 폴더 **가져오기(미러)** + 사용자 **가상 폴더**(임의 파일 참조) 동시 지원.
- SQLite에 영속화. 워크스페이스 정의는 JSON으로 **내보내기/가져오기**(백업·이동).
- 상세 스키마: [data-model.md](data-model.md).

## 검색
- **문서 내**: CodeMirror 검색.
- **전역**: SQLite **FTS5** 인덱스(가져오기·감시 변경 시 갱신). 오프라인.

## 로컬 파일 접근
- `dialog`로 파일/폴더 선택 → 경로 → **Rust(`std::fs`)** 로 임의 경로 읽기/쓰기.
- 상대경로 이미지/리소스는 **asset 프로토콜**(`convertFileSrc`)로 문서 디렉터리 스코프 한정 서빙.

## 성능(대용량)
- CodeMirror 뷰포트 렌더 + 파싱 워커 오프로딩 + 디바운스 + 임베드 지연 + 무거운 의존성(mermaid/pdf.js) **코드 스플리팅**.

## 오프라인 / 보안
- **CSP로 원격 네트워크 차단**, 모든 자산(폰트·테마·mermaid·KaTeX) 번들.
- 렌더 HTML 정화 + 샌드박스 iframe. asset 스코프는 열린 문서 디렉터리로 제한.
- (현재 `tauri.conf.json`의 `csp`는 `null` — 개발 편의. 릴리스 전 하드닝 CSP 적용 예정. [notes/development.md](../notes/development.md) 참고.)

## 유료화 대비
- `features/licensing` 엔타이틀먼트 스텁(현재 전 기능 활성). 기능 모듈화로 추후 게이팅(Store 인앱결제/유료 등재 또는 라이선스 키).
