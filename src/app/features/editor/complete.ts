// 마크다운 자동완성 소스 — 링크/이미지 경로 · 문서 내 헤딩 앵커 · 코드펜스 언어.
//
// 지금까지 @codemirror/autocomplete 는 의존성에 있으면서 closeBrackets 만 쓰였고
// autocompletion() 확장이 없어, lang-markdown 이 등록해 둔 HTML 태그 완성 소스마저 죽어 있었다.
// 여기서 autocompletion() 을 설치하면 그 소스도 함께 살아난다.
//
// 앱 상태(워크스페이스 파일 목록·문서 경로·아웃라인)는 이 계층이 직접 참조하지 않는다
// (features/editor 는 순수 편집 로직 유지) → 호출자가 "지금 값을 읽어 주는 함수"로 주입한다.
// 데이터가 아니라 함수인 이유: 에디터는 파일마다 한 번 마운트되는데 워크스페이스는 그 뒤로도 바뀐다.
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import type { TocItem } from "../../lib/markdown";

export interface CompletionSources {
  /** 편집 중 문서의 절대 경로. 미저장 새 문서면 null(상대경로를 계산할 기준이 없다). */
  docPath: () => string | null;
  /** 워크스페이스에 등록된 파일들. */
  files: () => { path: string; name: string }[];
  /** 현재 문서의 헤딩(아웃라인) — 미리보기가 만든 것과 같은 id라 앵커가 정확히 맞는다. */
  headings: () => TocItem[];
}

/** `fromDir` 기준 상대 경로. 드라이브가 다르면 null(상대화 불가) → 호출자가 후보에서 제외. */
export function relativePath(fromDir: string, to: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const a = norm(fromDir).split("/");
  const b = norm(to).split("/");
  // Windows 드라이브 문자는 대소문자를 구분하지 않는다.
  if (a[0].toLowerCase() !== b[0].toLowerCase()) return null;
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  const up = a.length - i;
  const rel = [...Array(up).fill(".."), ...b.slice(i)].join("/");
  return rel === "" ? "." : up === 0 ? "./" + rel : rel;
}

/** 링크 대상에 공백이 있으면 `<...>`로 감싼다 — 감싸지 않으면 마크다운이 공백에서 끊긴다. */
function linkTarget(rel: string): string {
  return /\s/.test(rel) ? `<${rel}>` : rel;
}

/** 이 ``` 가 여는 펜스인가(닫는 펜스면 언어를 제안하지 않는다). 앞선 펜스 줄 수가 짝수면 여는 펜스. */
function isOpeningFence(state: EditorState, lineNumber: number): boolean {
  let count = 0;
  for (let n = 1; n < lineNumber; n++) {
    if (/^\s*(?:>\s?)*(?:```|~~~)/.test(state.doc.line(n).text)) count++;
  }
  return count % 2 === 0;
}

/** 커서 앞, 같은 줄의 텍스트. 모든 소스가 이걸 기준으로 문맥을 판정한다. */
function beforeCursor(cx: CompletionContext): { line: number; text: string } {
  const line = cx.state.doc.lineAt(cx.pos);
  return { line: line.number, text: cx.state.sliceDoc(line.from, cx.pos) };
}

/** 자동완성 소스 본체. 확장과 분리해 둔 이유: 문맥 판정(정규식)이 버그가 숨는 자리라 단독으로 돌려본다. */
export function markdownCompletionSource(
  src: CompletionSources,
  langs: string[],
): (cx: CompletionContext) => CompletionResult | null {
  return (cx: CompletionContext): CompletionResult | null => {
    const { line, text } = beforeCursor(cx);

    // ① 코드펜스 언어 — "```" 또는 "~~~" 뒤(여는 펜스일 때만)
    const fence = /^\s*(?:>\s?)*(?:```|~~~)([\w+#-]*)$/.exec(text);
    if (fence) {
      if (!isOpeningFence(cx.state, line)) return null;
      return {
        from: cx.pos - fence[1].length,
        options: langs.map((l) => ({ label: l, type: "type" })),
        validFor: /^[\w+#-]*$/,
      };
    }

    // ② 문서 내 헤딩 앵커 — "](#" 뒤
    const anchor = /\[[^\]]*\]\(#([^)\s]*)$/.exec(text);
    if (anchor) {
      const items = src.headings();
      if (!items.length) return null;
      return {
        from: cx.pos - anchor[1].length,
        options: items.map((h) => ({
          label: h.id,
          detail: "#".repeat(h.level) + " " + h.text,
          type: "keyword",
        })),
        validFor: /^[^)\s]*$/,
      };
    }

    // ③ 링크/이미지 경로 — "](" 뒤. "#"로 시작하면 ②가 처리한다.
    const link = /\[[^\]]*\]\(([^)\s]*)$/.exec(text);
    if (link && !link[1].startsWith("#")) {
      const doc = src.docPath();
      if (!doc) return null; // 미저장 문서 — 상대경로의 기준이 없다
      const dir = doc.replace(/[\\/][^\\/]*$/, "");
      const options = [];
      for (const f of src.files()) {
        if (f.path === doc) continue; // 자기 자신 제외
        const rel = relativePath(dir, f.path);
        if (rel === null) continue; // 다른 드라이브 — 상대화 불가
        options.push({ label: linkTarget(rel), detail: f.name, type: "file" });
      }
      if (!options.length) return null;
      return { from: cx.pos - link[1].length, options, validFor: /^[^)\s]*$/ };
    }

    return null;
  };
}

export function markdownCompletions(src: CompletionSources, langs: string[]): Extension {
  // ⚠ 소스 함수는 **여기서 한 번만** 만든다. languageData 제공 함수 안에서 만들면 상태를 읽을 때마다
  //   새 함수 객체가 나오고, CodeMirror 자동완성은 활성 소스를 **identity로 비교**하므로
  //   (Active.update 의 `this.source != source` → 비활성 리셋) 결과가 표시되기 전에 버려진다.
  //   실제로 이 실수로 우리 소스 3종이 전부 안 뜨고, identity가 고정인 상류 HTML 태그 완성만 됐다.
  const source = markdownCompletionSource(src, langs);
  return [
    autocompletion(),
    // languageData 로 등록해야 lang-markdown 이 넣어 둔 HTML 태그 완성 소스와 **함께** 동작한다
    // (autocompletion({override}) 를 쓰면 그 소스를 덮어써 버린다).
    Prec.highest(EditorState.languageData.of(() => [{ autocomplete: source }])),
  ];
}
