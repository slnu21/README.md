import { describe, expect, it } from "vitest";
import { anyUnderRoots, dirOf, isAbsolute, isUnderRoot, resolvePath } from "./paths";

describe("isUnderRoot", () => {
  it.each([
    ["C:/w/a.md", "C:/w", true],
    ["C:/w", "C:/w", true], // 자기 자신
    ["C:/w/sub/a.md", "C:/w", true],
    ["C:/wx/a.md", "C:/w", false], // 형제 접두어 — startsWith 로는 틀린다
    ["C:/workspace/a.md", "C:/work", false],
    ["C:\\w\\a.md", "C:/w", true], // 구분자 혼용
    ["c:/W/a.md", "C:/w", true], // 대소문자
    ["C:/w/a.md", "C:/w/", true], // root 후행 구분자
    ["C:/작업/문서.md", "C:/작업", true],
    ["C:/작업실/문서.md", "C:/작업", false],
    ["C:/w/a.md", "", false], // 빈 root 는 전부 아님(모든 경로를 삼키지 않게)
    ["C:/w", "C:/w/sub", false],
    ["D:/w/a.md", "C:/w", false],
  ])("%s ⊂ %s → %s", (p, r, want) => expect(isUnderRoot(p, r)).toBe(want));
});

describe("anyUnderRoots", () => {
  it("하나라도 걸리면 true", () =>
    expect(anyUnderRoots(["D:/x", "C:/w/a.md"], ["C:/w"])).toBe(true));
  it("전부 밖이면 false", () => expect(anyUnderRoots(["D:/x"], ["C:/w"])).toBe(false));
  it("빈 배열", () => {
    expect(anyUnderRoots([], ["C:/w"])).toBe(false);
    expect(anyUnderRoots(["C:/w/a.md"], [])).toBe(false);
  });
});

describe("dirOf", () => {
  it("슬래시", () => expect(dirOf("C:/a/b.md")).toBe("C:/a"));
  it("역슬래시", () => expect(dirOf("C:\\a\\b.md")).toBe("C:\\a"));
  it("구분자 없음", () => expect(dirOf("b.md")).toBe(""));
});

describe("isAbsolute", () => {
  it.each([
    ["C:/a", true],
    ["c:\\a", true],
    ["/a", true],
    ["\\a", true],
    ["./a", false],
    ["a/b", false],
    ["../a", false],
  ])("%s → %s", (p, want) => expect(isAbsolute(p)).toBe(want));
});

describe("resolvePath", () => {
  it("같은 폴더", () => expect(resolvePath("C:/w/notes", "ref.md")).toBe("C:/w/notes/ref.md"));
  it("./ 접두어", () => expect(resolvePath("C:/w/notes", "./ref.md")).toBe("C:/w/notes/ref.md"));
  it("하위 폴더", () =>
    expect(resolvePath("C:/w/notes", "sub/deep.md")).toBe("C:/w/notes/sub/deep.md"));

  // 이전 구현이 못 하던 부분 — 자동완성이 "../other/spec.md" 를 만들어 내므로 필수.
  it("상위로 한 단계", () =>
    expect(resolvePath("C:/w/notes", "../other/spec.md")).toBe("C:/w/other/spec.md"));
  it("상위로 두 단계", () => expect(resolvePath("C:/w/a/b", "../../c.md")).toBe("C:/w/c.md"));
  it("중간의 ..", () => expect(resolvePath("C:/w", "a/../b.md")).toBe("C:/w/b.md"));
  it("드라이브 위로는 못 올라간다", () => expect(resolvePath("C:/", "../../x.md")).toBe("C:/x.md"));

  it("역슬래시 입력을 슬래시로 통일", () =>
    expect(resolvePath("C:\\w\\notes", "..\\other\\spec.md")).toBe("C:/w/other/spec.md"));

  it("rel이 절대경로면 그대로(정규화만)", () =>
    expect(resolvePath("C:/w/notes", "D:/x/./y.md")).toBe("D:/x/y.md"));
  it("루트 시작 절대경로", () => expect(resolvePath("C:/w", "/abs/x.md")).toBe("/abs/x.md"));

  it("dir이 비어 있으면 상대경로 유지", () => expect(resolvePath("", "a/b.md")).toBe("a/b.md"));
  it("dir이 없고 위로 올라가면 .. 를 남긴다", () =>
    expect(resolvePath("", "../a.md")).toBe("../a.md"));

  it("공백 있는 경로", () =>
    expect(resolvePath("C:/w/notes", "./my file.md")).toBe("C:/w/notes/my file.md"));
  it("한글 경로", () => expect(resolvePath("C:/작업/노트", "../그림.png")).toBe("C:/작업/그림.png"));
});
