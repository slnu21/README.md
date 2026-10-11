// 마크다운 렌더러(markdown-it + KaTeX + highlight.js)를 **필요할 때** 싣는다.
//
// 미리보기 렌더는 워커가 한다(자기 청크에 이 라이브러리들을 따로 담는다). 메인 스레드에서 렌더러를
// 쓰는 곳은 내보내기·프레젠테이션·데모 미리보기뿐인데, 정적으로 import 하면 그 셋 때문에 첫 번들이
// 라이브러리를 **한 벌 더** 실어 기동이 그만큼 느려진다(첫 JS 의 약 40% — docs/design/performance.md).
// 그래서 메인 스레드는 이 함수로만 렌더러에 닿는다. 타입만 필요하면 `import type` 은 괜찮다(지워진다).
type MarkdownModule = typeof import("./markdown");

let mod: Promise<MarkdownModule> | null = null;

export function loadMarkdown(): Promise<MarkdownModule> {
  return (mod ??= import("./markdown"));
}
