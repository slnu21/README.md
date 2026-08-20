import { describe, expect, it } from "vitest";
import { classifyLink, howFromModifiers } from "./links";

describe("classifyLink", () => {
  it.each(["http://example.com", "https://example.com/a?b=1#c", "mailto:a@b.com", "tel:+8210"])(
    "외부 스킴은 URL 로 넘긴다: %s",
    (href) => expect(classifyLink(href)).toEqual({ kind: "url", url: href }),
  );

  it("스킴 대소문자를 가리지 않는다", () =>
    expect(classifyLink("HTTPS://Example.com")).toEqual({
      kind: "url",
      url: "HTTPS://Example.com",
    }));

  it("URL 은 원문 그대로 넘긴다 — 디코드하면 쿼리·프래그먼트가 망가진다", () =>
    expect(classifyLink("https://x.com/s?q=%2B%26")).toEqual({
      kind: "url",
      url: "https://x.com/s?q=%2B%26",
    }));

  it("앵커는 퍼센트 디코드해서 id 를 준다", () =>
    expect(classifyLink("#%EC%A0%9C%EB%AA%A9")).toEqual({ kind: "anchor", id: "제목" }));

  it("깨진 인코딩 앵커는 원문 그대로", () =>
    expect(classifyLink("#100%")).toEqual({ kind: "anchor", id: "100%" }));

  it("상대 경로는 경로다", () =>
    expect(classifyLink("./sub/other.md")).toEqual({ kind: "path", rel: "./sub/other.md" }));

  it("경로의 프래그먼트는 뗀다(대상 문서만 열린다)", () =>
    expect(classifyLink("other.md#section")).toEqual({ kind: "path", rel: "other.md" }));

  it("경로는 퍼센트 디코드한다", () =>
    expect(classifyLink("my%20notes/a.md")).toEqual({ kind: "path", rel: "my notes/a.md" }));

  // 한 글자 "스킴"은 드라이브 문자다. 이걸 스킴으로 보면 절대경로 링크가 전부 버려진다.
  it.each(["C:/notes/a.md", "d:\\notes\\a.md"])("드라이브 문자는 경로다: %s", (href) =>
    expect(classifyLink(href)).toEqual({ kind: "path", rel: href }),
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,<h1>x</h1>",
    "blob:https://x/y",
    "about:blank",
    "ftp://host/f",
    "obsidian://open?vault=v",
    "vscode://file/c:/x",
  ])("모르는/위험한 스킴은 무시한다: %s", (href) =>
    expect(classifyLink(href)).toEqual({ kind: "ignored", reason: "scheme" }),
  );

  // file: 은 로컬 파일을 가리키는 정당한 링크다. 여기서는 경로로만 옮기고,
  // 실제로 열지 말지는 확장자 허용 목록(Rust shell_open.rs)이 다시 판단한다.
  it("file:/// 는 로컬 경로가 된다", () =>
    expect(classifyLink("file:///C:/notes/a.md")).toEqual({ kind: "path", rel: "C:/notes/a.md" }));

  it("file:/// 경로도 퍼센트 디코드한다", () =>
    expect(classifyLink("file:///C:/my%20notes/a.md")).toEqual({
      kind: "path",
      rel: "C:/my notes/a.md",
    }));

  it("file:/// 의 프래그먼트·쿼리는 뗀다", () =>
    expect(classifyLink("file:///C:/a.md#h1")).toEqual({ kind: "path", rel: "C:/a.md" }));

  it("드라이브 문자가 없으면 루트 절대경로로 되돌린다", () =>
    expect(classifyLink("file:///home/u/a.md")).toEqual({ kind: "path", rel: "/home/u/a.md" }));

  it("호스트가 붙은 file:// 는 UNC 라 무시한다", () =>
    expect(classifyLink("file://server/share/a.md")).toEqual({ kind: "ignored", reason: "scheme" }));

  it("빈 file:/// 은 무시한다", () =>
    expect(classifyLink("file:///")).toEqual({ kind: "ignored", reason: "scheme" }));

  it("프로토콜 상대 URL 은 무시한다 — 스킴을 알 수 없다", () =>
    expect(classifyLink("//example.com/a")).toEqual({ kind: "ignored", reason: "scheme" }));

  it.each([null, undefined, "", "   "])("빈 href 는 무시한다: %s", (href) =>
    expect(classifyLink(href)).toEqual({ kind: "ignored", reason: "empty" }),
  );

  it("프래그먼트만 떼면 빈 경로가 되는 링크도 무시한다", () =>
    expect(classifyLink("#")).toEqual({ kind: "anchor", id: "" }));

  it("앞뒤 공백은 다듬는다", () =>
    expect(classifyLink("  https://x.com  ")).toEqual({ kind: "url", url: "https://x.com" }));
});

describe("howFromModifiers", () => {
  it("맨클릭은 여기서 연다 — 미리보기는 읽는 면이라 클릭에 다른 뜻이 없다", () =>
    expect(howFromModifiers({})).toBe("here"));

  it.each([{ ctrlKey: true }, { metaKey: true }])("Ctrl/⌘ 는 옆 패널: %o", (m) =>
    expect(howFromModifiers(m)).toBe("beside"),
  );

  it("Alt 는 탐색기에서 위치 열기", () => expect(howFromModifiers({ altKey: true })).toBe("reveal"));

  it("Ctrl+Alt 는 Ctrl 이 이긴다", () =>
    expect(howFromModifiers({ ctrlKey: true, altKey: true })).toBe("beside"));
});
