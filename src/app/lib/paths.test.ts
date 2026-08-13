import { describe, expect, it } from "vitest";
import {
  anyUnderRoots,
  dirOf,
  isAbsolute,
  isUnderRoot,
  normalizeDocName,
  pickDefaultDir,
  resolvePath,
} from "./paths";

describe("normalizeDocName", () => {
  it.each([
    ["notes", "notes.md"],
    ["notes.md", "notes.md"],
    ["NOTES.MD", "NOTES.MD"], // 확장자 판정은 대소문자 무시, 이름은 그대로 보존
    ["a.markdown", "a.markdown"],
    ["a.mdx", "a.mdx"],
    ["a.txt", "a.txt"],
    ["v1.2", "v1.2.md"], // "점=확장자" 로 보면 확장자 .2 짜리 못 여는 파일이 된다
    ["회의록", "회의록.md"],
    ["2026-08-13 회고", "2026-08-13 회고.md"], // 공백·하이픈은 정상 문자
    ["  spaced  ", "spaced.md"],
    ["trailing...", "trailing.md"], // Windows 가 조용히 잘라내는 후행 점
    ["trailing   ", "trailing.md"],
    ["notes.png", "notes.png.md"], // 읽을 수 없는 확장자는 확장자로 안 친다
  ])("%s → %s", (raw, want) => {
    const r = normalizeDocName(raw);
    expect(r.ok, `${raw}: ${r.error ?? ""}`).toBe(true);
    expect(r.name).toBe(want);
  });

  it.each([
    ["a/b", "separator"],
    ["a\\b", "separator"],
    ["a:b", "illegal-chars"],
    ["a*b", "illegal-chars"],
    ["a?b", "illegal-chars"],
    ['a"b', "illegal-chars"],
    ["a<b", "illegal-chars"],
    ["a>b", "illegal-chars"],
    ["a|b", "illegal-chars"],
    ["a\u0001b", "illegal-chars"],
    ["CON", "reserved"],
    ["con.md", "reserved"],
    ["LPT9.txt", "reserved"],
    ["COM1", "reserved"],
    ["", "empty"],
    ["   ", "empty"],
    [".", "empty"],
    ["..", "empty"],
    ["...", "empty"],
    ["a".repeat(300), "too-long"],
  ])("%s → 오류 %s", (raw, want) => {
    const r = normalizeDocName(raw);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(want);
  });

  // 예약어 검사가 과잉 매칭하면 멀쩡한 이름이 막힌다 — 경계를 못박는다.
  it.each(["COM0", "COM10", "CONS", "CONTENTS.md", "AUXILIARY", "NULL.md"])(
    "%s 는 예약어가 아니다",
    (raw) => expect(normalizeDocName(raw).ok).toBe(true),
  );
});

describe("pickDefaultDir", () => {
  it("활성 문서 폴더 우선", () => expect(pickDefaultDir("C:/w/a.md", ["D:/x/b.md"])).toBe("C:/w"));
  it("활성 없으면 최근", () => expect(pickDefaultDir(null, ["C:/w/b.md"])).toBe("C:/w"));
  it("둘 다 없으면 빈 문자열", () => expect(pickDefaultDir(null, [])).toBe(""));
  it("구분자 없는 경로는 빈 문자열", () => expect(pickDefaultDir("a.md", [])).toBe(""));
});

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
