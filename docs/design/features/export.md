# 내보내기

- **HTML**: 렌더 결과 + CSS, 이미지(data URI)를 인라인한 **자기완결 .html**.
- **PDF**: 미리보기 렌더를 **WebView2 인쇄(print-to-PDF)** 로 출력(별도 PDF 엔진 불필요, 고품질·오프라인). 인쇄 전용 CSS 적용.
  - MVP: 인쇄 대화상자(Microsoft Print to PDF). 이후: `PrintToPdfAsync` 자동화.

구현: `src/app/features/export`, `src/src-tauri/src/commands/export.rs`.
