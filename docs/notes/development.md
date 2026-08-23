# 개발 노트 · 주의사항

## 사전 요건
- **Node.js + npm** (확인됨: Node 24, npm 11).
- **Rust 툴체인** — *설치 완료*(`cargo check`/`tauri dev/build` 동작).
  - (재설치 시) <https://www.rust-lang.org/tools/install> 의 `rustup`(Windows: `rustup-init.exe`) + Visual Studio C++ Build Tools(MSVC).
  - 전체 사전 요건: <https://tauri.app/start/prerequisites/>

## 실행
```
cd src
npm install        # 최초 1회
npm run tauri dev  # 데스크톱 창 실행 (Rust 필요)
```
- 타입체크: `cd src && npx tsc --noEmit`
- 단위 테스트: `cd src && npm test` (vitest, **node 환경 — DOM 없음**) · Rust `cd src/src-tauri && cargo test --lib`
- 렌더 프로브: `npm run probe:mermaid` — 미리보기 **문서 안**(라벨↔도형, 정화, 동시 렌더).
- 레이아웃 프로브: `npm run probe:layout` — **앱 셸**(편집/리딩/리딩분할 3배치의 패널 폭·넘침·
  전환 후 미리보기 iframe 보존). 두 프로브는 보는 곳이 겹치지 않는다 — mermaid 프로브는 자기
  iframe 을 직접 만들어 앱 셸을 아예 로드하지 않으므로 패널 기하는 그쪽으로 안 잡힌다.
  둘 다 앱을 띄우지 않아 사용자 DB·WebView2 프로필을 건드리지 않는다.
- 빌드: `cd src && npm run tauri build` → 산출물은 `src/src-tauri/target/release/bundle/...`

## 구조 메모
- 프론트 소스는 Tauri 기본 `src/`가 아니라 **`app/`** 로 배치(최상위 `src` 폴더와의 `src/src` 혼동 방지). `index.html`·`tsconfig.json`이 `app/`를 참조.
- 실제 파일 I/O는 **Rust 커맨드(`commands/fs_ops`)** 로 수행(풀 접근). 프론트는 `app/lib/tauri.ts` 래퍼 사용.

## 의존성 단계화
- 현재 설치: zustand, i18next/react-i18next, markdown-it(+types), dompurify, @tauri-apps/plugin-dialog.
- **구현 단계에서 추가**: CodeMirror 6(`@codemirror/*`), highlight.js, katex, mermaid(지연), pdfjs-dist(지연), markdown-it 플러그인 세트.
- Rust: rusqlite(SQLite/FTS5), notify(파일 감시)는 구현 단계에서 `Cargo.toml` 주석 해제.

## 보안 / CSP
- `src/src-tauri/tauri.conf.json`의 `app.security.csp`에 **하드닝 CSP 적용됨**: `default-src 'self'`, 원격 `http(s)` 차단, `img-src 'self' data: asset:`, `style-src 'unsafe-inline'`(테마·렌더 인라인 스타일), `script-src 'self'`(인라인 스크립트 불가), `worker-src 'self' blob:`. `assetProtocol` scope `**`로 로컬 이미지 미리보기 허용.
- 내보내기 자기완결 HTML은 이미지/폰트를 **data URI로 임베드**한다(asset URL은 `connect-src 'self'`상 fetch 불가 → 이미지는 Rust `read_file_base64`, 폰트는 same-origin fetch). CSP 변경 시 미리보기 렌더·이미지·검색·내보내기를 재확인할 것.

## IPC 권한(ACL)은 빌드로 안 잡힌다
- Tauri capability(`src-tauri/capabilities/default.json`)에 없는 커맨드는 **런타임에 거부**된다. `tsc`·vitest·`cargo`·프로브 어느 것도 못 잡는다 — 프런트는 그냥 reject 되는 Promise를 받을 뿐이다.
- 그래서 **`.catch(() => {})` 를 쓰지 않는다.** v0.6.8의 외부 링크 열기가 두 릴리스 동안 죽어 있던 이유가 정확히 이것이다(`open_path`가 ACL에 거부 → 빈 catch가 삼킴 → 화면·콘솔 어디에도 흔적 없음).
- 확인은 **실행 중인 앱에 CDP로 붙어 직접 invoke** 하는 수밖에 없다:
  ```js
  __TAURI_INTERNALS__.invoke('plugin:opener|open_url', { url: 'https://example.com' })
  ```
  거부되면 `Command ... not allowed by ACL` 이 그대로 온다. 고치기 전에 먼저 이걸 눈으로 본다.
- 앱 자신의 커맨드(`#[tauri::command]`)는 ACL 대상이 아니다. 넓은 플러그인 스코프를 여는 대신 **우리 커맨드에서 검사**하는 쪽을 택한다(`commands/shell_open.rs`).
- **IPC 는 JS 에서 가로챌 수 없다** — `window.__TAURI_INTERNALS__` 의 `invoke`·`ipc` 는 둘 다
  `writable:false, configurable:false` 다(실측). 감싸는 대입은 sloppy 모드라 **조용히 실패**하고,
  같은 객체에 `__orig` 같은 표식만 남아 "스파이가 걸렸다"고 착각하게 만든다. v0.7.1 실검증에서
  실제로 한 번 속았다 — 스파이가 죽은 채로 "호출 안 됨"으로 읽혀 6항목이 거짓 FAIL 이 났고,
  그동안 클릭은 전부 진짜로 브라우저·탐색기를 띄우고 있었다.
- 그래서 실검증은 **결과를 본다**: 외부 링크는 브라우저 프로세스가 새로 뜨는지, 탐색기에서 위치는
  `Shell.Application.Windows()` 에 그 폴더 창이 생기는지. 탐색기는 **같은 폴더 창이 이미 있으면
  재사용**하므로 케이스마다 먼저 닫고 봐야 한다.

## 알려진 TODO
- 아이콘: `src/src-tauri/icons/`의 기본 아이콘을 교체(`npm run tauri icon <path>`).
- Win10 오프라인 지원 시 `webviewInstallMode`를 `offlineInstaller`/`fixedRuntime`로(번들 증가). [deployment/webview2.md](../deployment/webview2.md).
