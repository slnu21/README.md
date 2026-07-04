// PDF 내보내기 = OS 인쇄 대화상자 경유('Microsoft Print to PDF' / 'PDF로 저장').
// 100% 오프라인·무엔진으로 확실히 동작. (후속: WebView2 PrintToPdfAsync 무대화상자 저장 — commands/export.rs)
// 정화된 자기완결 HTML을 숨김 iframe(same-origin srcdoc)에 로드 후 부모가 print() 호출.
// iframe 콘텐츠엔 스크립트 없음(DOMPurify 정화) — sandbox 없이도 정적 문서.

/** 자기완결 HTML을 숨김 iframe에 로드해 인쇄 대화상자를 띄운다. */
export function printHtmlToPdf(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  iframe.srcdoc = html;
  iframe.onload = () => {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) {
      iframe.remove();
      return;
    }
    const run = () => {
      win.focus();
      win.print(); // 대화상자 닫힐 때까지 블로킹
      window.setTimeout(() => iframe.remove(), 1000);
    };
    // 임베드 폰트/이미지(data URI) 반영 후 인쇄.
    if (doc.fonts?.ready) doc.fonts.ready.then(run, run);
    else run();
  };
  document.body.appendChild(iframe);
}
