// 클립보드 이미지 붙여넣기 — 이미지를 파일로 저장하고 `![](상대경로)` 를 삽입한다.
//
// 계층: 저장(파일 I/O·경로 결정)은 호출자가 주입한다. 이 파일은 "클립보드에서 이미지를 꺼내
// 마크다운으로 넣는 것"까지만 안다(features/editor 는 앱 상태·IPC를 직접 참조하지 않는다).
import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** 이미지를 저장하고 문서에 넣을 경로(문서 기준 상대경로)를 돌려준다. null이면 삽입하지 않는다. */
export type SaveImage = (data: Uint8Array, ext: string) => Promise<string | null>;

/** MIME → 확장자. 목록에 없는 이미지 타입은 다루지 않는다(무엇으로 저장할지 알 수 없다). */
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

/** 링크 대상에 공백이 있으면 `<...>`로 감싼다 — 감싸지 않으면 마크다운이 공백에서 끊긴다. */
function target(rel: string): string {
  return /\s/.test(rel) ? `<${rel}>` : rel;
}

export function imagePaste(save: SaveImage): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const dt = event.clipboardData;
      if (!dt) return false;
      // 이미지 편집기·브라우저에서 복사하면 이미지와 텍스트가 함께 오는 경우가 있다(엑셀 등).
      // 텍스트가 있으면 텍스트 붙여넣기가 사용자 의도일 가능성이 높다 → 이미지 전용일 때만 가로챈다.
      if (dt.getData("text/plain")) return false;
      const item = Array.from(dt.items).find((i) => i.kind === "file" && EXT[i.type]);
      if (!item) return false;
      const file = item.getAsFile();
      if (!file) return false;
      const ext = EXT[item.type];

      event.preventDefault(); // 비동기로 처리하므로 기본 붙여넣기를 먼저 막는다
      void (async () => {
        let rel: string | null = null;
        try {
          rel = await save(new Uint8Array(await file.arrayBuffer()), ext);
        } catch (e) {
          console.error("[imagePaste] 저장 실패:", e);
          return;
        }
        if (!rel) return; // 호출자가 취소(미저장 문서 등)
        // 비동기 사이에 파일이 바뀌어 뷰가 사라졌을 수 있다.
        if (!view.dom.isConnected) return;
        const insert = `![](${target(rel)})`;
        const range = view.state.selection.main;
        view.dispatch({
          changes: { from: range.from, to: range.to, insert },
          selection: EditorSelection.cursor(range.from + insert.length),
          scrollIntoView: true,
          userEvent: "input.paste",
        });
        view.focus();
      })();
      return true;
    },
  });
}
