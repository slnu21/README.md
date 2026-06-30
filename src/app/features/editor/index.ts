// Editor: CodeMirror 6 통합 (대용량 md 뷰포트 렌더링).
// 구현 단계에서 @codemirror/* + @codemirror/lang-markdown + search 확장을 연결한다.
// 참고: docs/design/architecture.md, docs/design/features/file-system.md

export interface EditorApi {
  getValue(): string;
  setValue(value: string): void;
}

// TODO(v0.1): CodeMirror EditorView 생성/마운트 구현
export function createEditor(): EditorApi {
  throw new Error("editor: not implemented yet");
}
