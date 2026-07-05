// 파일 종류 판별(확장자 기반) — 워크스페이스 트리 아이콘/열기 가능 여부·퀵오픈·드롭에서 공용.
// 이 앱은 마크다운 리더/에디터라 "열 수 있는" 문서는 마크다운 계열 + 일반 텍스트로 제한.
export const MARKDOWN_RE = /\.(md|markdown|mdx)$/i;
export const READABLE_RE = /\.(md|markdown|mdx|txt)$/i;

export function isMarkdown(name: string): boolean {
  return MARKDOWN_RE.test(name);
}

/** 텍스트로 열어 미리보기 가능한 파일(마크다운 계열 + .txt). 그 외(이미지·바이너리)는 열지 않음. */
export function isReadable(name: string): boolean {
  return READABLE_RE.test(name);
}
