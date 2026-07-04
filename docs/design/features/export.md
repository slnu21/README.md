# 내보내기

v0.5 구현 완료. 툴바 **내보내기** 버튼 → 드롭다운(HTML / PDF).

- **HTML** — 렌더 결과 + CSS를 인라인한 **자기완결 `.html`**. 앱 밖(다른 PC·일반 브라우저)에서도 미리보기와 동일하게 열리도록:
  - 로컬 이미지 → **data URI 내장**(asset URL은 CSP `connect-src`상 fetch 불가 → Rust `read_file_base64`로 바이트 읽어 base64).
  - 선택한 읽기 폰트 → **data URI `@font-face` 내장**(same-origin fetch+base64; 시스템 폰트면 스택 폴백).
  - 코드 하이라이트(highlight.js)·수식(KaTeX MathML)·mermaid(SVG)는 `lib/renderDoc.ts`의 `buildDoc`이 인라인.
  - 저장 대화상자(`saveFile`) → `writeFile`.
- **PDF** — 미리보기 렌더를 **OS 인쇄 대화상자**(Microsoft Print to PDF / 'PDF로 저장')로 출력(별도 PDF 엔진 불필요, 오프라인). 정화된 자기완결 HTML을 same-origin 숨김 iframe(`srcdoc`)에 로드 후 `print()`. 인쇄 전용 CSS(`@page` 여백·`@media print`로 카드 테두리 제거) 적용.
  - 후속: WebView2 `PrintToPdfAsync`로 **무대화상자 직접 저장**(현재 빈 스캐폴드 `src/src-tauri/src/commands/export.rs`에 구현 예정).

구현: `src/app/features/export/`(`index.ts`·`html.ts`·`pdf.ts`), 공유 렌더 `src/app/lib/renderDoc.ts`, 폰트 임베드 `src/app/lib/fonts.ts`(`bundledWoff2For`), Rust `read_file_base64`(`commands/fs_ops.rs`).
