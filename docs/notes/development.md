# 개발 노트 · 주의사항

## 사전 요건
- **Node.js + npm** (확인됨: Node 24, npm 11).
- **Rust 툴체인** — *현재 미설치*. 앱 실행·빌드(`npm run tauri dev/build`)에 필요.
  - 설치: <https://www.rust-lang.org/tools/install> 의 `rustup`(Windows: `rustup-init.exe`).
  - 설치 후 `cargo --version` 확인. Visual Studio C++ Build Tools(MSVC)도 필요.
  - 전체 사전 요건: <https://tauri.app/start/prerequisites/>

## 실행
```
cd src
npm install        # 최초 1회
npm run tauri dev  # 데스크톱 창 실행 (Rust 필요)
```
- 타입체크: `cd src && npx tsc --noEmit`
- 빌드: `cd src && npm run tauri build` → 산출물은 `src/src-tauri/target/release/bundle/...`

## 구조 메모
- 프론트 소스는 Tauri 기본 `src/`가 아니라 **`app/`** 로 배치(최상위 `src` 폴더와의 `src/src` 혼동 방지). `index.html`·`tsconfig.json`이 `app/`를 참조.
- 실제 파일 I/O는 **Rust 커맨드(`commands/fs_ops`)** 로 수행(풀 접근). 프론트는 `app/lib/tauri.ts` 래퍼 사용.

## 의존성 단계화
- 현재 설치: zustand, i18next/react-i18next, markdown-it(+types), dompurify, @tauri-apps/plugin-dialog.
- **구현 단계에서 추가**: CodeMirror 6(`@codemirror/*`), highlight.js, katex, mermaid(지연), pdfjs-dist(지연), markdown-it 플러그인 세트.
- Rust: rusqlite(SQLite/FTS5), notify(파일 감시)는 구현 단계에서 `Cargo.toml` 주석 해제.

## 보안 / CSP 주의
- `src/src-tauri/tauri.conf.json`의 `app.security.csp`는 현재 **`null`**(개발 편의 — Vite HMR/React Refresh 인라인 스크립트 허용).
- **릴리스 전** 오프라인·하드닝 CSP로 교체한다: 원격 `http(s)` 차단, `img-src`에 `asset:`/`data:` 허용, 인라인 스타일 허용 등. 적용 후 `tauri dev`에서 HMR 동작을 재확인할 것(필요 시 dev 전용 완화).

## 알려진 TODO
- 아이콘: `src/src-tauri/icons/`의 기본 아이콘을 교체(`npm run tauri icon <path>`).
- Win10 오프라인 지원 시 `webviewInstallMode`를 `offlineInstaller`/`fixedRuntime`로(번들 증가). [deployment/webview2.md](../deployment/webview2.md).
