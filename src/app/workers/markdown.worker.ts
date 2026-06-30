// Markdown 렌더 Web Worker: 메인 스레드 차단 없이 파싱·하이라이트 수행(대용량 md 대비).
// 입력 소스 → markdown-it 렌더 → HTML 반환(정화는 메인 스레드에서 DOMPurify로).
// 참고: app/lib/markdown.ts, app/features/preview
// TODO(v0.1): onmessage 핸들러 + createMarkdown() 연동

export {};
