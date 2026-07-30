// CodeMirror 6 에디터 마운트/생명주기(WBS 522).
// 부모에서 key={path}로 파일마다 재마운트. 편집 시 onChange → store 갱신 → 미리보기 라이브.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EditorState } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";
import {
  editorExtensions,
  selStateOf,
  contentSync,
  type SelState,
  type CompletionSources,
} from "../features/editor";
import { editorActions, keyHint } from "../features/editor/actions";
import { useAppStore } from "../store";
import { ContextMenu, type MenuItem } from "./ContextMenu";

/** CM 폰트 메트릭 캐시(charWidth/lineHeight/textHeight)를 강제 재측정.
 *  plain requestMeasure()는 콘텐츠 높이가 바뀌어야만 메트릭을 다시 읽는다. 줄높이를 정수 px로
 *  고정한 뒤로는 글꼴이 바뀌어도(예: lazy woff2 swap) 높이가 안 변해 charWidth가 갱신되지 않으므로,
 *  CM이 document.fonts.ready 콜백에서 쓰는 것과 동일하게 mustMeasureContent="refresh"를 세워
 *  measureTextSize()로 캐시를 무조건 다시 읽게 한다(@codemirror/view v6.43.x).
 *  viewState는 .d.ts 미노출 내부 필드라 좁은 캐스트 — 필드가 사라져도 뒤의 requestMeasure()로 안전 저하. */
function remeasureFont(view: EditorView) {
  const vs = (view as unknown as { viewState?: { mustMeasureContent: boolean | "refresh" } }).viewState;
  if (vs) vs.mustMeasureContent = "refresh";
  view.requestMeasure();
}

export interface EditorHandle {
  /** 소스 줄(0-based, onSyncLine과 동일 규약)을 에디터 상단으로 스크롤(양방향 동기화). */
  scrollToLine(line: number): void;
  /** 편집 커맨드를 현재 뷰에 실행(명령 팔레트에서 서식 명령 호출). 실행 후 포커스를 에디터로 되돌린다. */
  runCommand(cmd: Command): void;
}

export const Editor = forwardRef<EditorHandle, {
  content: string;
  onChange: (doc: string) => void;
  onSyncLine?: (line: number) => void;
  onSelState?: (s: SelState) => void;
  /** 자동완성 데이터 조회자(경로·헤딩). 값이 아니라 함수라 워크스페이스·아웃라인 변화를 즉시 반영한다. */
  complete?: CompletionSources;
}>(function Editor({ content, onChange, onSyncLine, onSelState, complete }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSyncLineRef = useRef(onSyncLine);
  onSyncLineRef.current = onSyncLine;
  const onSelStateRef = useRef(onSelState);
  onSelStateRef.current = onSelState;
  const initial = useRef(content); // 마운트 시 초기 문서
  // 확장은 마운트 때 한 번만 만들어지므로 최신 조회자를 ref로 들고 간접 호출한다.
  const completeRef = useRef(complete);
  completeRef.current = complete;
  // 글꼴/줌은 :root CSS 변수로 적용(App.tsx) → CM 높이 캐시 재측정 필요(커서/거터 정렬 유지).
  const fontMono = useAppStore((s) => s.fontMono);
  const editorZoom = useAppStore((s) => s.editorZoom);
  const { t } = useTranslation();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initial.current,
        extensions: editorExtensions(
          (doc) => onChangeRef.current(doc),
          (line) => onSyncLineRef.current?.(line),
          (s) => onSelStateRef.current?.(s),
          {
            docPath: () => completeRef.current?.docPath() ?? null,
            files: () => completeRef.current?.files() ?? [],
            headings: () => completeRef.current?.headings() ?? [],
          },
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
      // contentSync 표식 → updateListener가 이 교체를 사용자 편집으로 오인해 dirty로 만들지 않게.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        annotations: contentSync.of(true),
      });
    }
  }, [content]);

  // 글꼴/줌(CSS 변수) 변경 후 다음 프레임에 재측정 — 변수 적용 완료 시점 보장 + 메트릭 강제 갱신.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const id = requestAnimationFrame(() => remeasureFont(view));
    return () => cancelAnimationFrame(id);
  }, [fontMono, editorZoom]);

  // 에디터 폰트가 마운트 이후 로드 완료되면(번들 lazy woff2, font-display:swap) 메트릭 캐시 갱신.
  // CM은 생성자에서 document.fonts.ready 를 한 번만 구독하므로, 그 뒤 로드되는 폰트는 스스로
  // 재측정하지 못한다(콜드스타트에서 클릭/커서 x좌표가 폴백 폰트 기준으로 어긋나는 것 방지).
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    let raf = 0;
    const onDone = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const view = viewRef.current;
        if (view) remeasureFont(view);
      });
    };
    fonts.addEventListener("loadingdone", onDone);
    void fonts.ready.then(onDone); // 이미 로드가 끝난 뒤(파일 재마운트 등)도 한 번 보장
    return () => {
      fonts.removeEventListener("loadingdone", onDone);
      cancelAnimationFrame(raf);
    };
  }, []);

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
    runCommand(cmd: Command) {
      runCmd(cmd);
    },
  }), []);

  // ── 커스텀 우클릭 메뉴(서식 + 클립보드) ──
  function runCmd(cmd: Command) {
    const v = viewRef.current;
    if (!v) return;
    cmd(v);
    v.focus();
  }
  function selectedText(): string {
    const v = viewRef.current;
    if (!v) return "";
    const r = v.state.selection.main;
    return v.state.sliceDoc(r.from, r.to);
  }
  async function copySel() {
    const s = selectedText();
    if (s) await navigator.clipboard.writeText(s);
  }
  async function cutSel() {
    const v = viewRef.current;
    if (!v) return;
    const r = v.state.selection.main;
    if (r.empty) return;
    await navigator.clipboard.writeText(v.state.sliceDoc(r.from, r.to));
    v.dispatch({ changes: { from: r.from, to: r.to, insert: "" }, userEvent: "delete.cut" });
    v.focus();
  }
  async function pasteAt() {
    const v = viewRef.current;
    if (!v) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!text) return;
    const r = v.state.selection.main;
    v.dispatch({
      changes: { from: r.from, to: r.to, insert: text },
      selection: { anchor: r.from + text.length },
      userEvent: "input.paste",
    });
    v.focus();
  }
  function selectAll() {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
    v.focus();
  }

  // 서식 항목은 actions.ts 레지스트리에서 파생 → 액션을 추가하면 우클릭 메뉴에도 자동으로 나타난다.
  const menuItems: MenuItem[] = [
    { label: t("ctx.cut"), onClick: () => void cutSel() },
    { label: t("ctx.copy"), onClick: () => void copySel() },
    { label: t("ctx.paste"), onClick: () => void pasteAt() },
    ...editorActions
      .filter((a) => a.inContextMenu)
      .map((a) => ({
        label: t(a.labelKey),
        hint: a.key ? keyHint(a.key) : undefined,
        onClick: () => runCmd(a.run),
      })),
    { label: t("ctx.selectAll"), onClick: () => selectAll() },
  ];

  return (
    <>
      <div
        ref={host}
        className="cm-host"
        onContextMenu={(e) => {
          e.preventDefault();
          setCtxMenu({ x: e.clientX, y: e.clientY });
        }}
      />
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={menuItems} onClose={() => setCtxMenu(null)} />
      )}
    </>
  );
});
