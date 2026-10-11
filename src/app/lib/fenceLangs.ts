// 코드펜스 언어 자동완성 후보 — 하이라이트가 실제로 되는 언어(lib/markdown.ts 의 LANGS)만 제안한다.
//
// 따로 둔 이유: 편집기가 이 목록 하나 때문에 lib/markdown.ts 를 import 하면 렌더러 전체(KaTeX·
// highlight.js·markdown-it)가 첫 번들에 딸려 온다(lib/markdownLazy.ts). 목록이 LANGS 와 어긋나지
// 않는지는 테스트가 지킨다(markdown.toc.test.ts). 별칭(ts/js/sh/html…)은 hljs 가 각 언어 정의에서
// 등록하므로 여기엔 정식 이름만 있다.
export const FENCE_LANGS: string[] = [
  "bash", "c", "cpp", "css", "diff", "go", "java", "javascript", "json",
  "markdown", "python", "rust", "sql", "typescript", "xml", "yaml",
];
