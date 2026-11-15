import { describe, expect, it } from "vitest";
import { acceptOf, hasFsAccess, pickerTypesOf, suggestedNameOf } from "./pick";

const MD = [{ name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] }];

describe("web file pickers — 순수 변환", () => {
  it("File System Access API 는 열기·저장 둘 다 있어야 핸들 경로를 쓴다", () => {
    const f = () => Promise.resolve();
    expect(hasFsAccess({ showOpenFilePicker: f, showSaveFilePicker: f })).toBe(true);
    expect(hasFsAccess({ showOpenFilePicker: f })).toBe(false); // 반쪽이면 폴백
    expect(hasFsAccess({})).toBe(false); // Firefox·Safari
    expect(hasFsAccess(null)).toBe(false);
  });

  it("<input accept> — 점 붙이고 소문자·중복 제거", () => {
    expect(acceptOf(MD)).toBe(".md,.markdown,.mdx,.txt");
    expect(acceptOf([{ name: "A", extensions: [".MD", "md"] }, { name: "H", extensions: ["html"] }])).toBe(".md,.html");
  });

  it("picker types — 필터마다 MIME 별로 확장자를 묶는다", () => {
    expect(pickerTypesOf(MD)).toEqual([
      { description: "Markdown", accept: { "text/markdown": [".md", ".markdown", ".mdx"], "text/plain": [".txt"] } },
    ]);
    expect(pickerTypesOf([{ name: "HTML", extensions: ["html"] }, { name: "빈", extensions: [] }])).toEqual([
      { description: "HTML", accept: { "text/html": [".html"] } },
    ]);
  });

  it("데스크톱 기본 경로 → 제안 이름(폴더는 웹에 없다)", () => {
    expect(suggestedNameOf("C:\\docs\\새 문서.md")).toBe("새 문서.md");
    expect(suggestedNameOf("/web/ab12/노트.html")).toBe("노트.html");
    expect(suggestedNameOf("이름만.md")).toBe("이름만.md");
    expect(suggestedNameOf("")).toBe("untitled.md");
  });
});
