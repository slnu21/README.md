// Preview: 마크다운 렌더 파이프라인.
// 흐름: 에디터 변경 → Web Worker(markdown-it 파싱·하이라이트) → DOMPurify 정화 → 샌드박스 iframe 주입.
// mermaid/katex 블록은 IntersectionObserver로 지연 렌더. 입력 디바운스 150–300ms.
// 참고: app/workers/markdown.worker.ts, app/lib/markdown.ts

export interface RenderResult {
  html: string;
}

// TODO(v0.1): 워커 연동 + DOMPurify 정화 + iframe 주입 구현
export async function renderMarkdown(_source: string): Promise<RenderResult> {
  throw new Error("preview: not implemented yet");
}
