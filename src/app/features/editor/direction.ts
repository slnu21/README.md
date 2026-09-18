// 편집기 글 방향(bidi) — 설정 auto/ltr/rtl 을 CodeMirror 확장으로 옮긴다.
//
// CodeMirror 는 글자 순서(bidi 재배열)·커서 이동·클릭 좌표를 **줄의 CSS direction** 으로 판단한다
// (`view.textDirectionAt` = `getComputedStyle(line).direction`). 그러니 우리가 할 일은 방향을 잴 것
// 이 아니라 **줄 요소에 dir 속성을 다는 것**뿐이다 — 첫 강한 글자 판정은 브라우저(dir="auto")가,
// 그에 맞춘 커서·선택은 CM 이 한다. `perLineTextDirection` 을 켜야 CM 이 줄마다 물어본다.
//
//   · auto = 줄마다 첫 강한 글자로 dir 을 정한다(lib/bidi.ts — 브라우저 dir="auto" 와 같은 규칙) +
//            perLineTextDirection. 페르시아어 줄은 오른쪽에서 시작하고 한국어·영어 줄은 지금 그대로.
//            **강한 글자가 없는 줄은 바로 위 줄을 따른다** — 표의 구분 행 `|---|---|` 이나 `---` 가
//            페르시아어 표 한가운데서 혼자 왼쪽으로 튀지 않는다(dir="auto" 를 그대로 달면 부모인
//            편집기의 LTR 로 떨어진다).
//   · rtl  = 편집기 전체 dir="rtl" — 거터가 오른쪽으로 옮겨가고(CM 이 inset-inline 으로 배치)
//            모든 줄이 오른쪽 정렬. 자동 판정이 어긋나는 문서(숫자·영어로 시작하는 문단)용 탈출구.
//   · ltr  = 오늘 그대로(확장 없음).
//
// 어느 모드에서든 **펜스 코드 안의 줄은 dir="ltr"** — 코드는 코드다(미리보기 pre{direction:ltr} 와
// 같은 약속). URL 은 LTR 로, 인라인 코드는 자기 첫 글자로 **격리**한다(bidiIsolate): RTL 줄 속
// `[라벨](https://…)` 의 주소가 조각나 뒤섞이지 않는다. 격리 마크는 outerDecorations 로 준다 —
// 문법 하이라이트 마크 안쪽에 들어가면 URL 이 하이라이트 경계마다 잘려 조각마다 따로 격리된다.
import { Compartment, RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, Direction, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { firstStrongDir, type StrongDir, type TextDirection } from "../../lib/bidi";

export type { TextDirection } from "../../lib/bidi";

const lineLtr = Decoration.line({ attributes: { dir: "ltr" } });
const lineRtl = Decoration.line({ attributes: { dir: "rtl" } });
const lineDeco: Record<StrongDir, Decoration> = { ltr: lineLtr, rtl: lineRtl };
/** 강한 글자가 없는 줄이 물려받을 방향을 찾기 위해 뷰포트 위로 거슬러 볼 줄 수. */
const LOOKBACK_LINES = 50;
const isoLtr = Decoration.mark({ attributes: { dir: "ltr" }, bidiIsolate: Direction.LTR });
const isoAuto = Decoration.mark({ attributes: { dir: "auto" }, bidiIsolate: null });

/** 문법 노드 이름 → 격리 방향. @lezer/markdown 의 노드 이름이다(NodeProp.isolate 를 쓰지 않는
 *  이유: @lezer/common 이 직접 의존성이 아니고, 이름 비교면 충분하다). */
const ISOLATE: Record<string, Decoration> = { URL: isoLtr, Autolink: isoLtr, InlineCode: isoAuto };
const CODE_BLOCKS = new Set(["FencedCode", "CodeBlock"]);

/** `from` 바로 위쪽에서 마지막으로 강한 글자를 가진 줄의 방향(없으면 null). */
function inheritedDir(view: EditorView, from: number): StrongDir | null {
  const doc = view.state.doc;
  let n = doc.lineAt(from).number - 1;
  for (let i = 0; i < LOOKBACK_LINES && n >= 1; i++, n--) {
    const d = firstStrongDir(doc.line(n).text);
    if (d) return d;
  }
  return null;
}

function buildLines(view: EditorView, auto: boolean): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let last: StrongDir | null = auto ? inheritedDir(view, from) : null;
    // 코드 블록이 덮는 줄 번호를 먼저 모은다(블록 하나가 여러 줄).
    const codeLines = new Set<number>();
    tree.iterate({
      from,
      to,
      enter: (n) => {
        if (!CODE_BLOCKS.has(n.name)) return;
        const a = doc.lineAt(n.from).number;
        const z = doc.lineAt(Math.max(n.from, n.to - 1)).number;
        for (let i = a; i <= z; i++) codeLines.add(i);
        return false;
      },
    });
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      if (codeLines.has(line.number)) b.add(line.from, line.from, lineLtr);
      else if (auto) {
        const d = firstStrongDir(line.text) ?? last;
        if (d) {
          b.add(line.from, line.from, lineDeco[d]);
          last = d;
        }
      }
      pos = line.to + 1;
    }
  }
  return b.finish();
}

function buildIsolates(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (n) => {
        const deco = ISOLATE[n.name];
        if (!deco) return;
        // 바깥 것 하나만(Autolink 안의 URL 까지 겹쳐 달면 RangeSetBuilder 정렬이 깨진다).
        if (n.to > n.from) b.add(n.from, n.to, deco);
        return false;
      },
    });
  }
  return b.finish();
}

/** 줄 방향 + 격리 마크. auto 면 줄마다 계산한 dir, 아니면(강제 rtl) 코드 줄만 dir="ltr". */
function directionPlugin(auto: boolean) {
  return ViewPlugin.fromClass(
    class {
      lines: DecorationSet;
      isolates: DecorationSet;
      constructor(view: EditorView) {
        this.lines = buildLines(view, auto);
        this.isolates = buildIsolates(view);
      }
      update(u: ViewUpdate) {
        // 트리가 자라거나(파싱 진행) 문서·뷰포트가 바뀌면 다시 — CM 의 bidiIsolates 와 같은 조건.
        if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.lines = buildLines(u.view, auto);
          this.isolates = buildIsolates(u.view);
        }
      }
    },
    {
      decorations: (v) => v.lines,
      provide: (plugin) => {
        const iso = (view: EditorView) => view.plugin(plugin)?.isolates ?? Decoration.none;
        return [EditorView.outerDecorations.of(iso), EditorView.bidiIsolatedRanges.of(iso)];
      },
    },
  );
}

function extensionFor(mode: TextDirection): Extension {
  switch (mode) {
    case "rtl":
      // perLineTextDirection 은 여기서도 켠다 — 코드 줄은 dir="ltr" 이라 편집기 전체 방향과
      // 다른데, CM 이 줄마다 묻지 않으면 그 줄의 커서 이동이 거꾸로 간다.
      return [
        EditorView.editorAttributes.of({ dir: "rtl" }),
        EditorView.perLineTextDirection.of(true),
        directionPlugin(false),
      ];
    case "auto":
      return [EditorView.perLineTextDirection.of(true), directionPlugin(true)];
    default:
      return [];
  }
}

const compartment = new Compartment();

/** 마운트 시 초기 확장. 이후 변경은 setTextDirection 으로(리컨피그 — 재마운트 없음). */
export function textDirection(mode: TextDirection): Extension {
  return compartment.of(extensionFor(mode));
}

export function setTextDirection(view: EditorView, mode: TextDirection): void {
  view.dispatch({ effects: compartment.reconfigure(extensionFor(mode)) });
}
