import { describe, expect, it } from "vitest";
import { memoryRecentStore, normalizeRecent, RECENT_TEXT_MAX, sanitizeEntry, touchRecent, type RecentEntry } from "./recent";
import type { FileHandleLike } from "./files";

const handle = (name: string): FileHandleLike => ({ name, kind: "file", getFile: async () => ({ text: async () => "" }) });
const e = (path: string, at: number, extra: Partial<RecentEntry> = {}): RecentEntry => ({ path, name: path.split("/").pop()!, at, text: "x", ...extra });

describe("web recent files", () => {
  it("touch 는 맨 앞으로 올리고 같은 경로를 하나만 남긴다", () => {
    const list = [e("/web/a/a.md", 1), e("/web/b/b.md", 2)];
    const next = touchRecent(list, e("/web/b/b.md", 3));
    expect(next.map((x) => x.path)).toEqual(["/web/b/b.md", "/web/a/a.md"]);
    expect(next[0].at).toBe(3);
  });

  it("상한을 넘으면 오래된 것부터 떨어진다", () => {
    let list: RecentEntry[] = [];
    for (let i = 0; i < 5; i++) list = touchRecent(list, e(`/web/${i}/f.md`, i), 3);
    expect(list.map((x) => x.path)).toEqual(["/web/4/f.md", "/web/3/f.md", "/web/2/f.md"]);
  });

  it("핸들이 있으면 내용 사본을 두지 않는다(파일이 진실원)", () => {
    const h = handle("a.md");
    expect(sanitizeEntry(e("/web/a/a.md", 1, { handle: h, text: "big" }))).toEqual({ path: "/web/a/a.md", name: "a.md", handle: h, at: 1 });
  });

  it("핸들도 사본도 없거나 사본이 너무 크면 다시 못 여니 목록에서 뺀다", () => {
    expect(sanitizeEntry({ path: "/web/a/a.md", name: "a.md", at: 1 })).toBeNull();
    expect(sanitizeEntry(e("/web/a/a.md", 1, { text: "x".repeat(RECENT_TEXT_MAX + 1) }))).toBeNull();
    expect(touchRecent([e("/web/b/b.md", 1)], { path: "/web/a/a.md", name: "a.md", at: 2 }).map((x) => x.path)).toEqual(["/web/b/b.md"]);
  });

  it("불러온 값 정리 — 모양이 깨진 항목·중복을 버리고 최신 순", () => {
    const raw = [null, 3, { path: 1 }, e("/web/a/a.md", 1), e("/web/b/b.md", 5), e("/web/a/a.md", 9), { path: "/web/c/c.md", name: "c.md" }];
    expect(normalizeRecent(raw).map((x) => x.path)).toEqual(["/web/b/b.md", "/web/a/a.md"]);
    expect(normalizeRecent("garbage")).toEqual([]);
  });

  it("메모리 저장소는 넣은 그대로 돌려준다(사본 — 밖에서 고쳐도 안 바뀐다)", async () => {
    const s = memoryRecentStore();
    const list = [e("/web/a/a.md", 1)];
    await s.save(list);
    list.pop();
    expect((await s.load()).length).toBe(1);
  });
});
