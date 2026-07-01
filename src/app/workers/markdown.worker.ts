// Markdown 렌더 Web Worker: 메인 스레드 차단 없이 markdown-it 파싱(대용량 md 대비).
// 입력 소스 → HTML 반환. 정화(DOMPurify)·iframe 주입은 메인 스레드(shell/Preview.tsx).
import { createMarkdown } from "../lib/markdown";

const md = createMarkdown();

// 워커 전역(self)을 최소 인터페이스로 캐스팅(webworker lib 참조로 인한 DOM 충돌 회피).
const ctx = self as unknown as {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: MessageEvent) => void): void;
};

ctx.addEventListener("message", (e: MessageEvent) => {
  const { id, source } = e.data as { id: number; source: string };
  ctx.postMessage({ id, html: md.render(source ?? "") });
});

export {};
