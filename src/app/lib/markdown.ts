// markdown-it 설정. GFM 확장 + 인라인/블록 플러그인 + 코드 하이라이트(highlight.js).
// 수식(KaTeX)은 별도 단계에서 추가한다. 렌더 결과는 반드시 lib/sanitize.ts 로 정화 후
// sandbox iframe 에 주입한다. 하이라이트는 워커/메인 어디서든 DOM 없이 정적 렌더된다.
import MarkdownIt from "markdown-it";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import mark from "markdown-it-mark";
import ins from "markdown-it-ins";
import abbr from "markdown-it-abbr";
import deflist from "markdown-it-deflist";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import container from "markdown-it-container";
import multimdTable from "markdown-it-multimd-table";
import frontMatter from "markdown-it-front-matter";
import anchor from "markdown-it-anchor";
import texmath from "markdown-it-texmath";
import katex from "katex";
import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import cssLang from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import markdownLang from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";
import { slugify } from "./slugify";
import { firstStrongDir, type StrongDir } from "./bidi";

// 코드블록 언어(지연 로드 대신 큐레이션 세트 번들 — 번들 크기 절제). 별칭(ts/js/sh/html…)은 각 언어가 등록.
const LANGS: Record<string, LanguageFn> = {
  typescript, javascript, python, rust, bash, json, xml, css: cssLang,
  go, java, c, cpp, yaml, sql, markdown: markdownLang, diff,
};
/** 코드펜스 언어 자동완성 후보 — 하이라이트가 실제로 되는 언어만 제안한다(별도 목록을 만들지 않는다).
 *  별칭(ts/js/sh/html…)은 hljs가 각 언어 정의에서 등록하므로 여기엔 정식 이름만 있다. */
export const FENCE_LANGS: string[] = Object.keys(LANGS).sort();

let registered = false;
function registerLanguages(): void {
  if (registered) return;
  for (const [name, fn] of Object.entries(LANGS)) hljs.registerLanguage(name, fn);
  registered = true;
}

const CALLOUTS = ["note", "warning", "tip"] as const;

// ── 글 방향(bidi) 속성 ──────────────────────────────────────────────────────
// 설정과 무관하게 **항상** 박는다 — 워커의 렌더 결과가 설정에 묶이지 않고, 자동/강제 전환은
// buildDoc 이 문서 루트에 적는 `dir`+`data-dir-mode` 와 CSS 만으로 된다(테마 바꾸듯 즉시).
//   · 잎 블록(p·h1~h6·td…) = `dir="auto"` — 브라우저가 첫 강한 글자로 방향을 정한다.
//   · 컨테이너(ul·ol·li·blockquote·table·dl·콜아웃) = `data-dir="ltr|rtl"` 을 **우리가 계산**한다.
//     dir="auto" 는 dir 속성을 가진 자식을 통째로 건너뛰므로 컨테이너에 auto 를 달면 볼 텍스트가
//     없어 항상 LTR 로 떨어진다(목록 여백·인용문 막대·표 열 순서가 왼쪽에 남는다). lib/bidi.ts.
const BIDI_LEAF = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "th", "td", "dt", "dd", "caption"]);
const BIDI_CONTAINER = new Set(["ul", "ol", "li", "blockquote", "table", "dl", "div"]);

interface Tok {
  type: string;
  tag: string;
  nesting: number;
  content: string;
  children: Tok[] | null;
  attrSet(name: string, value: string): void;
  attrGet(name: string): string | null;
}

/** 컨테이너 여는 토큰부터 짝이 되는 닫는 토큰까지 훑어 첫 강한 글자의 방향을 찾는다.
 *  브라우저의 dir=auto 가 보는 것과 같은 텍스트만 본다 — 원시 HTML 태그·이미지 alt 는 건너뛴다.
 *  첫 글자에서 멈추므로 중첩이 깊어도 비용은 사실상 상수다. */
function containerDir(toks: Tok[], open: number): StrongDir | null {
  let depth = 0;
  for (let j = open; j < toks.length; j++) {
    const t = toks[j];
    depth += t.nesting;
    if (depth <= 0 && j > open) break;
    if (t.type === "inline" && t.children) {
      for (const c of t.children) {
        if (c.type === "text" || c.type === "code_inline" || c.type === "math_inline") {
          const d = firstStrongDir(c.content);
          if (d) return d;
        }
      }
    } else if (t.type === "fence" || t.type === "code_block" || t.type === "math_block") {
      const d = firstStrongDir(t.content);
      if (d) return d;
    }
  }
  return null;
}

/** mermaid 소스 → base64(UTF-8). data-src 속성에 안전하게 싣기 위함(lib/mermaid.ts decodeMermaidSrc 와 짝).
 *  원문의 `-->`·`->>`·`<|--` 등 `<`/`>` 포함 시 DOMPurify의 mXSS 방지 스크러빙이 data-src를 통째로
 *  제거해 다이어그램이 렌더되지 않는 문제가 있었다 → base64([A-Za-z0-9+/=])는 절대 스크럽되지 않는다. */
function encodeMermaidSrc(src: string): string {
  const bytes = new TextEncoder().encode(src);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function createMarkdown(): MarkdownIt {
  registerLanguages();

  const md = new MarkdownIt({
    html: true, // 원시 HTML 허용 — 렌더 결과는 반드시 DOMPurify로 정화한다.
    linkify: true,
    typographer: true,
    breaks: false,
  });

  // 코드 하이라이트(hljs). mermaid 언어는 하이라이트하지 않고 메인스레드 렌더용 placeholder로 통과.
  md.set({
    highlight: (str: string, lang: string): string => {
      if (lang === "mermaid") {
        // 소스는 base64로 실어 나른다(속성값 안전) — DOMPurify가 `-->` 등 포함 data-src를 지우는 문제 회피.
        return `<pre class="mermaid" data-src="${encodeMermaidSrc(str)}"></pre>`;
      }
      const language = lang && hljs.getLanguage(lang) ? lang : "";
      const code = language
        ? hljs.highlight(str, { language, ignoreIllegals: true }).value
        : md.utils.escapeHtml(str);
      return `<pre class="hljs"><code class="hljs${language ? " language-" + language : ""}">${code}</code></pre>`;
    },
  });

  md.use(frontMatter, () => {}) // YAML front-matter는 소비만(렌더하지 않음)
    .use(sub)
    .use(sup)
    .use(mark)
    .use(ins)
    .use(abbr)
    .use(deflist)
    .use(footnote)
    .use(taskLists, { label: true }) // 체크박스는 disabled(표시 전용)
    .use(multimdTable, { multiline: true, rowspan: true, headerless: true });

  // 콜아웃(admonition) 컨테이너 — ::: note / warning / tip
  for (const name of CALLOUTS) {
    md.use(container, name, {
      render(tokens: Tok[], idx: number) {
        if (tokens[idx].nesting !== 1) return "</div>\n";
        // 방향은 bidi_dir 코어 룰이 토큰에 적어 둔 것(아래) — 커스텀 렌더라 여기서 직접 찍는다.
        const dir = tokens[idx].attrGet("data-dir");
        return `<div class="callout ${name}"${dir ? ` data-dir="${dir}"` : ""}>\n`;
      },
    });
  }

  // 헤딩 id(아웃라인/TOC 앵커의 진실원본) — 유니코드 보존 slugify 공유
  md.use(anchor, { slugify, permalink: false });

  // 수식(KaTeX) — MathML 출력이라 폰트 번들·CSP 변경 불필요, sandbox 유지
  md.use(texmath, {
    engine: katex,
    delimiters: "dollars",
    katexOptions: { output: "mathml", throwOnError: false },
  });

  // 소스라인 스탬프(기능 8: 스크롤 동기화) — 블록 여는 토큰에 data-line(0-based 시작줄) 부착.
  // renderToken 경로로 렌더되는 요소(heading/para/list/blockquote/table/hr…)에 나타난다.
  // DOMPurify는 data-* 를 보존(lib/sanitize.ts 에서 명시 허용).
  md.core.ruler.push("source_line", (state) => {
    for (const token of state.tokens) {
      if (token.map && token.nesting >= 0 && token.type !== "inline") {
        token.attrSet("data-line", String(token.map[0]));
      }
    }
  });

  // 글 방향 속성(위 BIDI_* 주석). 인라인 파싱이 끝난 뒤라 children 이 있다.
  md.core.ruler.push("bidi_dir", (state) => {
    const toks = state.tokens as unknown as Tok[];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.nesting !== 1) continue;
      if (BIDI_LEAF.has(t.tag)) t.attrSet("dir", "auto");
      else if (BIDI_CONTAINER.has(t.tag)) {
        const d = containerDir(toks, i);
        if (d) t.attrSet("data-dir", d);
      }
    }
  });

  return md;
}

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

/** md.parse 토큰에서 헤딩 아웃라인 추출. anchor 코어 룰이 부여한 실제 id(dedup 포함)를 사용. */
export function extractToc(md: MarkdownIt, src: string): TocItem[] {
  const tokens = md.parse(src, {});
  const toc: TocItem[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type !== "heading_open") continue;
    const id = tok.attrGet("id");
    if (!id) continue;
    toc.push({ level: Number(tok.tag.slice(1)), text: tokens[i + 1]?.content ?? "", id });
  }
  return toc;
}
