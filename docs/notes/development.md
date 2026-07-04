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

## 알려진 TODO
- 아이콘: `src/src-tauri/icons/`의 기본 아이콘을 교체(`npm run tauri icon <path>`).
- Win10 오프라인 지원 시 `webviewInstallMode`를 `offlineInstaller`/`fixedRuntime`로(번들 증가). [deployment/webview2.md](../deployment/webview2.md).
