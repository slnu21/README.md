import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import {
  markdownCompletionSource,
  markdownCompletions,
  relativePath,
  type CompletionSources,
} from "./complete";

const LANGS = ["bash", "json", "python", "rust", "typescript"];
const DOC = "C:/w/notes/today.md";
const FILES = [
  { path: "C:/w/notes/today.md", name: "today.md" }, // 자기 자신
  { path: "C:/w/notes/ref.md", name: "ref.md" },
  { path: "C:/w/notes/sub/deep.md", name: "deep.md" },
  { path: "C:/w/other/spec.md", name: "spec.md" },
  { path: "C:/w/notes/my file.md", name: "my file.md" }, // 공백 포함
  { path: "D:/elsewhere/x.md", name: "x.md" }, // 다른 드라이브
];
const HEADINGS = [
  { level: 1, text: "시작하기", id: "시작하기" },
  { level: 2, text: "설치", id: "설치" },
];
const src: CompletionSources = {
  docPath: () => DOC,
  files: () => FILES,
  headings: () => HEADINGS,
};

/** 문서 끝에 커서를 두고 소스를 실행 → { from, labels } 또는 null. */
function complete(doc: string, sources: CompletionSources = src) {
  const cx = new CompletionContext(EditorState.create({ doc }), doc.length, false);
  const r = markdownCompletionSource(sources, LANGS)(cx);
  return r ? { from: r.from, labels: r.options.map((o) => o.label) } : null;
}

describe("relativePath", () => {
  it("같은 폴더", () => expect(relativePath("C:/w/notes", "C:/w/notes/ref.md")).toBe("./ref.md"));
  it("하위 폴더", () =>
    expect(relativePath("C:/w/notes", "C:/w/notes/sub/deep.md")).toBe("./sub/deep.md"));
  it("상위로 올라가기", () =>
    expect(relativePath("C:/w/notes", "C:/w/other/spec.md")).toBe("../other/spec.md"));
  it("역슬래시 경로", () =>
    expect(relativePath("C:\\w\\notes", "C:\\w\\notes\\ref.md")).toBe("./ref.md"));
  it("드라이브 문자 대소문자 무시", () =>
    expect(relativePath("c:/w/notes", "C:/w/notes/ref.md")).toBe("./ref.md"));
  it("다른 드라이브면 null(상대화 불가)", () =>
    expect(relativePath("C:/w/notes", "D:/x/y.md")).toBeNull());
});

describe("코드펜스 언어", () => {
  it("``` 뒤 → 언어 목록", () => expect(complete("```")?.labels).toEqual(LANGS));
  it("```py 뒤 → 목록 유지(필터는 CM이 한다)", () =>
    expect(complete("```py")?.labels).toEqual(LANGS));
  it("from = 언어 시작 위치", () => expect(complete("```py")?.from).toBe(3));
  it("인용 안의 펜스도 인식", () => expect(complete("> ```")?.labels).toEqual(LANGS));
  it("닫는 펜스에서는 제안하지 않는다", () => expect(complete("```js\ncode\n```")).toBeNull());
  it("본문 중간 백틱은 펜스가 아니다", () => expect(complete("see ```")).toBeNull());
});

describe("헤딩 앵커", () => {
  it("](# 뒤 → 헤딩 id", () => expect(complete("[가기](#")?.labels).toEqual(["시작하기", "설치"]));
  it("부분 입력에도 목록 유지", () =>
    expect(complete("[가기](#설")?.labels).toEqual(["시작하기", "설치"]));
  // "[가기](#설" → 0[ 1가 2기 3] 4( 5# 6설, 커서=7 → from=6(# 바로 뒤).
  // 한글도 UTF-16 코드유닛 1개다(BMP) — 2개로 세면 안 된다.
  it("from = # 바로 뒤", () => expect(complete("[가기](#설")?.from).toBe(6));
  it("헤딩이 없으면 null", () =>
    expect(complete("[가기](#", { ...src, headings: () => [] })).toBeNull());
});

describe("링크 경로", () => {
  it("]( 뒤 → 상대경로 (자기 자신·타 드라이브 제외)", () =>
    expect(complete("[문서](")?.labels).toEqual([
      "./ref.md",
      "./sub/deep.md",
      "../other/spec.md",
      "<./my file.md>",
    ]));
  // 감싸지 않으면 마크다운 링크가 공백에서 끊긴다.
  it("공백 있는 경로는 <>로 감싼다", () =>
    expect(complete("[문서](")?.labels).toContain("<./my file.md>"));
  it("이미지 문법도 동일", () => expect(complete("![그림](")?.labels).toHaveLength(4));
  it("미저장 문서면 제안하지 않는다(기준 폴더 없음)", () =>
    expect(complete("[문서](", { ...src, docPath: () => null })).toBeNull());
  it("#으로 시작하면 경로 소스가 가로채지 않는다", () =>
    expect(complete("[문서](#")?.labels).toEqual(["시작하기", "설치"]));
  it("이미 닫힌 링크 뒤에서는 제안하지 않는다", () =>
    expect(complete("[문서](./ref.md) 그리고")).toBeNull());
});

describe("문맥 아님", () => {
  it("평문", () => expect(complete("그냥 문장")).toBeNull());
  it("대괄호만", () => expect(complete("[문서]")).toBeNull());
});

// 회귀: CodeMirror 자동완성은 활성 소스를 **함수 identity로 비교**한다
// (Active.update 의 `this.source != source` → 비활성 리셋). languageData 제공 함수 안에서
// 소스를 만들면 상태를 읽을 때마다 새 객체가 나와 결과가 표시되기 전에 버려진다.
// 실제로 이 실수 때문에 우리 소스 3종이 전부 안 뜨고 상류 HTML 태그 완성만 동작했다.
describe("소스 identity 안정성 (회귀)", () => {
  const state = EditorState.create({
    doc: "hello world",
    extensions: [markdownCompletions(src, LANGS)],
  });

  it("autocomplete 소스가 등록된다", () =>
    expect(state.languageDataAt("autocomplete", 1).length).toBeGreaterThan(0));

  it("두 번 읽어도 같은 함수", () =>
    expect(state.languageDataAt("autocomplete", 1)).toEqual(
      state.languageDataAt("autocomplete", 1),
    ));

  it("같은 함수 객체다(identity)", () => {
    const a = state.languageDataAt("autocomplete", 1);
    const b = state.languageDataAt("autocomplete", 1);
    expect(a.every((f, i) => f === b[i])).toBe(true);
  });

  it("다른 위치·상태 갱신 후에도 같은 함수 객체", () => {
    const a = state.languageDataAt("autocomplete", 1);
    const far = state.languageDataAt("autocomplete", 8);
    const next = state.update({ changes: { from: 11, insert: "!" } }).state;
    const after = next.languageDataAt("autocomplete", 1);
    expect(a.every((f) => far.includes(f) && after.includes(f))).toBe(true);
  });
});
