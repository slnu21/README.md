// CodeMirror 6 에디터 마운트/생명주기(WBS 522).
// 부모에서 key={path}로 파일마다 재마운트. 편집 시 onChange → store 갱신 → 미리보기 라이브.
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorExtensions } from "../features/editor";

export function Editor({ content, onChange }: { content: string; onChange: (doc: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initial = useRef(content); // 마운트 시 초기 문서

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initial.current,
        extensions: editorExtensions((doc) => onChangeRef.current(doc)),
      }),
      parent: host.current,
    });
    viewRef.current = view;
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

  return <div ref={host} className="cm-host" />;
}
