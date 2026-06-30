// markdown-it 설정. "최대한 다양한 기능"을 위해 구현 단계에서 플러그인을 단계적으로 추가:
// footnote, task-lists, deflist, sub, sup, mark, ins, abbr, emoji, attrs, anchor, toc,
// container(admonition), multimd-table, front-matter. 코드 하이라이트는 highlight.js, 수식은 KaTeX.
import MarkdownIt from "markdown-it";

export function createMarkdown(): MarkdownIt {
  const md = new MarkdownIt({
    html: true, // 원시 HTML 허용 — 렌더 결과는 반드시 DOMPurify로 정화한다.
    linkify: true,
    typographer: true,
    breaks: false,
  });
  // TODO: md.use(plugin) 체인 (구현 단계)
  return md;
}
