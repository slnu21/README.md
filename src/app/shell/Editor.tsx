// CodeMirror 6 에디터 마운트/생명주기(WBS 522).
// 부모에서 key={path}로 파일마다 재마운트. 편집 시 onChange → store 갱신 → 미리보기 라이브.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorExtensions, selStateOf, type SelState } from "../features/editor";
import { useAppStore } from "../store";

export interface EditorHandle {
  /** 소스 줄(0-based, onSyncLine과 동일 규약)을 에디터 상단으로 스크롤(양방향 동기화). */
  scrollToLine(line: number): void;
}

export const Editor = forwardRef<EditorHandle, {
  content: string;
  onChange: (doc: string) => void;
  onSyncLine?: (line: number) => void;
  onSelState?: (s: SelState) => void;
}>(function Editor({ content, onChange, onSyncLine, onSelState }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSyncLineRef = useRef(onSyncLine);
  onSyncLineRef.current = onSyncLine;
  const onSelStateRef = useRef(onSelState);
  onSelStateRef.current = onSelState;
  const initial = useRef(content); // 마운트 시 초기 문서
  // 글꼴/줌은 :root CSS 변수로 적용(App.tsx) → CM 높이 캐시 재측정 필요(커서/거터 정렬 유지).
  const fontMono = useAppStore((s) => s.fontMono);
  const editorZoom = useAppStore((s) => s.editorZoom);

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initial.current,
        extensions: editorExtensions(
          (doc) => onChangeRef.current(doc),
          (line) => onSyncLineRef.current?.(line),
          (s) => onSelStateRef.current?.(s),
        ),
      }),
      parent: host.current,
    });
    viewRef.current = view;
    onSelStateRef.current?.(selStateOf(view)); // 마운트 직후 초기 커서 상태 보고
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // 외부에서 content가 바뀌었고(예: 파일 리로드) 에디터 내용과 다르면 반영.
  // 타이핑으로 인한 변경은 이미 동일하므로 디스패치하지 않음(루프 없음).
  useEffect(() => {
    const view = viewRef.current;
    if (view && content !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    }
  }, [content]);

  // 글꼴/줌(CSS 변수) 변경 후 다음 프레임에 재측정 — 변수 적용 완료 시점 보장.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const id = requestAnimationFrame(() => view.requestMeasure());
    return () => cancelAnimationFrame(id);
  }, [fontMono, editorZoom]);

  // 양방향 스크롤 동기화(미리보기→에디터). 0-based 소스 줄을 상단으로.
  useImperativeHandle(ref, () => ({
    scrollToLine(line: number) {
      const view = viewRef.current;
      if (!view) return;
      const total = view.state.doc.lines;
      const n = Math.min(Math.max(1, Math.round(line) + 1), total); // 0-based → 1-based CM 줄
      const info = view.state.doc.line(n);
      view.dispatch({ effects: EditorView.scrollIntoView(info.from, { y: "start", yMargin: 0 }) });
    },
  }), []);

  return <div ref={host} className="cm-host" />;
});
