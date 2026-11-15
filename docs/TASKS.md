# TASKS — README.md

세션 간 진행 상황의 단일 진실원. 새 세션은 이것부터 읽는다. 긴 이력은 `CLAUDE.md` "현재 상태"와 [개발로그](개발로그/INDEX.md).

## 진행 중

### 웹 에디션 — W1 완료(검토 대기) · W2 설계 메모
- 브랜치 `develop-web-edition`(worktree `Workspace/.worktrees/md-reader/develop-web-edition/`) · 시작 2026-11-15 · 데브로그 [(02) web-edition](개발로그/2026-11-15-02-web-edition.md) · [(03) web-isolation](개발로그/2026-11-15-03-web-isolation.md)
- **데스크톱 불변(사용자 요구)**: 데스크톱 빌드 산출물이 main 과 **바이트 단위로 같다**(73개 파일 해시까지 · 엔트리 JS 1,138.49KB). 규칙 — 웹 전용 코드는 `__WEB__`(vite `define`) 뒤에, 그리고 **삼항의 앞가지**로(`__WEB__ && <X/>` 는 데스크톱에 `false` 자식을 남긴다). 웹 문구·스타일은 `app/platform/web/{locales,web.css,ui.ts}` — 데스크톱 로케일·App.css 무접촉. 검사: main 임시 worktree 와 데스크톱 빌드를 비교(데브로그 (03) 의 방법).
- **포지셔닝**: 웹 = 파일 하나를 브라우저에서 열고·읽고·고치는 무료판(업로드 없음). 데스크톱 = 워크스페이스·검색·기록·받은 문서함·에이전트 브리지. 웹에 없는 기능 자리는 "데스크톱 앱에서" + Store 링크.
- **W1(이 브랜치)**: 같은 저장소·포크 없음 — `@platform` 하나 + 구현 둘(`app/platform/tauri.ts` · `app/platform/web/`), vite alias 로 선택. `npm run build:web` → `src/web-dist/`. 웹 사이드바(목차·최근·사용법·300×250 안내 자리·앱 링크). `npm run probe:web` 28항목.
- **다음 단계**: ① 사용자 검토 → `main` 에 `--no-ff` 머지 · worktree 정리(머지·push 는 사용자 확인 뒤) ② 실제 Chromium 에서 손으로: 파일 열기(핸들)·제자리 저장 권한 프롬프트·Firefox 폴백(다운로드 저장) ③ W2 착수.

## W2 설계 메모(이번 범위 아님)

### 배포 — Cloudflare Pages(결정 2026-11-15)
- GitHub Pages 가 아니라 **Cloudflare Pages** — 광고를 붙이면 상업적 사용이라 GitHub Pages 약관과 맞지 않는다.
- 설정: 루트 디렉터리 `src` · 빌드 명령 `npm ci && npm run build:web` · 출력 `web-dist` · Node 버전 고정(환경변수 `NODE_VERSION`, 로컬은 24).
  base 는 기본 `/`(`vite.config.ts`), 하위 경로에 올릴 때만 `WEB_BASE=/sub/`.
- `web-dist/_headers`(빌드 때 `public/` 대신 웹 전용 위치에서 복사 — 데스크톱 번들에 섞이지 않게):
  - `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`(파일명에 해시)
  - `/index.html`·`/` → `Cache-Control: no-cache`(새 배포가 바로 보이게)
  - 보안 헤더: CSP(데스크톱 `tauri.conf.json` 의 하드닝 CSP 를 웹용으로 옮김 — 광고 스크립트 도메인은 그때 허용 목록), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- 404: 단일 페이지 앱이 아니라 정적 랜딩 여럿 + 앱 하나이므로 `404.html` 을 따로 둔다(Pages 는 `404.html` 이 있으면 그걸 쓰고, 없으면 SPA 처럼 `index.html` 로 떨어진다 — 랜딩 URL 오타가 앱으로 가면 안 된다).
- 실제 배포·계정 작업은 사용자 확인 게이트.

### 랜딩 페이지 · 언어 URL
- 랜딩 페이지(`/markdown-viewer`, `/mermaid-preview`, `/readme-preview` 등)와 ko/en 은 **별도 정적 URL**(`hreflang` 상호 링크)로 실제 페이지 이동.
- **단, 에디터 안 동작은 절대 새로고침하지 않는다** — 편집·파일 열기·모드 전환·언어 전환 중 편집 상태. 지금(W1) 언어 전환은 앱 내 전환이라 새로고침이 없다(`probe:web` 이 확인).
  편집 중 언어 링크(다른 URL)를 누르면: 미저장 내용을 IndexedDB 에 임시 보관 후 이동 / 또는 앱 내 전환으로 처리 — **W2 에서 결정**.
- **광고 새로고침·인위적 리로드 금지.** 안내 자리(300×250)는 크기 예약(`contain:strict`)이라 광고가 늦게 떠도 레이아웃이 밀리지 않는다 — 광고 코드는 그 상자 안에서만.

### 기능
- URL 로 열기(`?url=` — CORS·크기 제한·원격 이미지 정책) · 공유 링크(내용을 URL 해시에 압축? 서버 없이) · 내보내기(지금도 HTML/PDF/HTML 복사는 웹에서 동작 — 저장은 저장 위치 고르기/다운로드) · PWA(오프라인 캐시·파일 핸들러 `launchQueue` 로 .md 연결).
- 상대경로 이미지: 웹은 문서 옆 폴더에 못 닿는다 — 폴더 핸들(`showDirectoryPicker`)을 받으면 가능. 지금은 원본 src 그대로(깨진 이미지).
- 붙여넣은 이미지 저장(`writeFileBase64`)은 웹에서 거절된다 — 폴더 핸들과 같이 해결.
- 원격 이미지: 데스크톱은 CSP 로 막지만 웹은 아직 CSP 가 없다 → 위 `_headers` CSP 에서 정한다.

## 대기 · 결정 필요
- 표시 펜 무료/Pro(T7) 결정 — 게이팅 코드 없음(CLAUDE.md "다음 단계").
