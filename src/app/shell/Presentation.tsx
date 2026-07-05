// 프레젠테이션 모드(T4) — 문서를 슬라이드로 전체화면 표시. 단독 '---' 줄로 분할.
// 렌더 파이프라인은 미리보기와 동일(createMarkdown→DOMPurify→same-origin iframe). 스크립트 미주입.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createMarkdown } from "../lib/markdown";
import { sanitizeHtml } from "../lib/sanitize";
import { renderMermaid } from "../lib/mermaid";
import { buildDoc } from "../lib/renderDoc";
import { readStack, BASE_READER_PX } from "../lib/fonts";
import { useAppStore } from "../store";
import { dirOf, inlineImages } from "../lib/previewImages";
import { Icon } from "./Icon";

// 슬라이드 분리: 단독 '---' 줄(수평선/구분자). 없으면 문서 전체를 1장으로.
function splitSlides(src: string): string[] {
  const parts = src.split(/^\s*---\s*$/m).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length ? parts : [src];
}

// 슬라이드용 추가 CSS: 카드 테두리 제거·중앙 정렬·큰 여백.
const SLIDE_CSS =
  "body{display:flex;align-items:center;min-height:100vh;padding:4vh 5vw}" +
  ".md{border:none;box-shadow:none;background:transparent;max-width:1000px;margin:0 auto;padding:0;width:100%}";

export function Presentation({
  content,
  path,
  themeId,
  onClose,
}: {
  content: string;
  path: string;
  themeId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fontRead = useAppStore((s) => s.fontRead);
  const slides = useMemo(() => splitSlides(content), [content]);
  const [idx, setIdx] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cur = Math.min(idx, slides.length - 1);

  // 현재 슬라이드 렌더 → iframe(레이스 가드).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let cancelled = false;
    void (async () => {
      const md = createMarkdown();
      const body0 = await inlineImages(sanitizeHtml(md.render(slides[cur])), dirOf(path));
      const body = await renderMermaid(body0, themeId);
      if (cancelled) return;
      const font = { readStack: readStack(fontRead), readerPx: BASE_READER_PX * 1.35 };
      iframe.srcdoc = buildDoc(body, themeId, font, { extraCss: SLIDE_CSS });
    })();
    return () => {
      cancelled = true;
    };
  }, [slides, cur, themeId, fontRead, path]);

  // 키보드 내비게이션: ←/→ ·Space·PageUp/Down·Home/End·Esc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        setIdx((i) => Math.min(i + 1, slides.length - 1));
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        setIdx((i) => Math.max(i - 1, 0));
        e.preventDefault();
      } else if (e.key === "Home") setIdx(0);
      else if (e.key === "End") setIdx(slides.length - 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);

  // 슬라이드 iframe 우클릭(브라우저 기본 메뉴) 억제.
  function onFrameLoad() {
    iframeRef.current?.contentDocument?.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  return (
    <div className="present" role="dialog" aria-label="presentation">
      <iframe
        ref={iframeRef}
        className="present-frame"
        sandbox="allow-same-origin"
        title="presentation"
        onLoad={onFrameLoad}
      />
      <div className="present-bar">
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(i - 1, 0))}
          disabled={cur === 0}
          aria-label={t("view.prevSlide")}
        >
          <Icon name="chev" className="flip" />
        </button>
        <span className="present-count">
          {cur + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(i + 1, slides.length - 1))}
          disabled={cur === slides.length - 1}
          aria-label={t("view.nextSlide")}
        >
          <Icon name="chev" />
        </button>
        <button type="button" className="present-exit" onClick={onClose}>
          {t("view.exitPresent")}
        </button>
      </div>
    </div>
  );
}
