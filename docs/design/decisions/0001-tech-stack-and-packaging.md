# ADR 0001 — 기술 스택 및 Store 패키징

- 상태: 채택(Accepted)
- 날짜: 2026-06-30 (패키징 결정 2026-06-30 갱신)

## 맥락
Windows용 경량 마크다운 리더/에디터를 Microsoft Store로 배포한다. 100% 오프라인, 대용량 md, 로컬 파일 편집, 향후 유료화(상업화)가 요건. 배포자는 과거 **무서명 MSIX를 Store에 제출한 경험**이 있다.

## 결정
- **셸로 Tauri v2 채택** (대안 Electron). UI는 **React + TypeScript + Vite**, 에디터 **CodeMirror 6**, 엔진 **markdown-it**.
- **Store 패키징 기본 경로: MSIX → Store.** Microsoft가 인증 후 재서명하므로 **유료 코드서명 인증서 불필요**. 매니페스트에 `runFullTrust` 선언으로 풀 파일 접근 유지.
- **대안: Win32(EXE/MSI) 직접 제출** — Tauri 기본 산출물이라 추가 패키징은 없지만 **신뢰 CA 인증서로 직접 서명 필수**. 비-Store 직접 배포를 겸할 때 채택.

## 근거
- **라이선스(상업화)**: Tauri(MIT/Apache), React/Vite/CodeMirror/markdown-it/KaTeX/mermaid/i18next/zustand/DOMPurify(MIT·Apache), highlight.js(BSD-3), PDF.js(Apache-2.0), SQLite(퍼블릭 도메인) — 전부 permissive. WebView2 런타임은 로열티 없는 자유 재배포. → 유료화·상업 배포 자유.
- **로컬 파일 접근**: Tauri는 Rust(`std::fs`) 커맨드로 임의 경로 풀 접근. 산출물은 풀 트러스트 Win32 앱이며, MSIX 포장 시에도 `runFullTrust`로 파일 접근 유지.
- **패키징**: MSIX는 Store 재서명으로 인증서 비용이 없고(배포자 경험과도 일치) 설치/업데이트 UX가 깔끔. 단 Tauri가 MSIX를 직접 출력하지 않아 **MSIX 래핑 1단계**(MSIX Packaging Tool 또는 `makeappx`)가 필요 — 이 비용이 인증서 구매보다 가볍다고 판단.
- **경량 vs Electron**: Electron은 Chromium 동봉(~100MB+)으로 과중. 리더 앱엔 Tauri가 적합.

## 영향
- **인증서**: Store(MSIX) 전용이면 **불필요**. Win32/직접 배포를 병행할 때만 OV/EV 인증서 발급. → [code-signing.md](../../deployment/code-signing.md)
- **MSIX 패키징 단계** 정립 필요(매니페스트=Partner Center ID, `runFullTrust`, makeappx 스크립트화). → [microsoft-store.md](../../deployment/microsoft-store.md)
- Win10 오프라인 첫 실행은 WebView2 전략 필요. → [webview2.md](../../deployment/webview2.md)
- 의존성 라이선스 화이트리스트 + THIRD-PARTY-NOTICES 자동 생성(CI).
