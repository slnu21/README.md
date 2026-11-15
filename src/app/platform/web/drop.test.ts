import { describe, expect, it } from "vitest";
import { collectDropped, createDropHub, isFileDrag } from "./drop";
import type { FileHandleLike } from "./files";

const file = (name: string, text: string) => ({ name, text: async () => text });
const fh = (name: string, kind = "file"): FileHandleLike => ({ name, kind, getFile: async () => ({ text: async () => "" }) });

describe("web drop — 항목 꺼내기", () => {
  it("파일 드래그만 잡는다(글자·링크 드래그는 앱 다른 동작에 맡긴다)", () => {
    expect(isFileDrag(["Files"])).toBe(true);
    expect(isFileDrag(["text/plain"])).toBe(false);
    expect(isFileDrag(null)).toBe(false);
  });

  it("핸들이 있으면 핸들(제자리 저장), 없으면 내용 · 폴더와 글자 항목은 건너뛴다", async () => {
    const h = fh("a.md");
    const out = await collectDropped([
      { kind: "file", getAsFile: () => file("a.md", "A"), getAsFileSystemHandle: async () => h },
      { kind: "file", getAsFile: () => file("b.md", "B") }, // Firefox — 핸들 API 없음
      { kind: "file", getAsFile: () => file("c.md", "C"), getAsFileSystemHandle: async () => null }, // 합성 드롭
      { kind: "file", getAsFile: () => null, getAsFileSystemHandle: async () => fh("dir", "directory") },
      { kind: "string", getAsFile: () => null },
    ]);
    expect(out).toEqual([{ name: "a.md", handle: h }, { name: "b.md", text: "B" }, { name: "c.md", text: "C" }]);
  });

  it("핸들 요청이 실패해도 파일 내용으로 떨어진다", async () => {
    const out = await collectDropped([
      { kind: "file", getAsFile: () => file("a.md", "A"), getAsFileSystemHandle: () => Promise.reject(new Error("x")) },
    ]);
    expect(out).toEqual([{ name: "a.md", text: "A" }]);
  });
});

/** window 대신 EventTarget — DragEvent 가 없는 node 에서 dataTransfer 만 붙인 Event 로 흉내 낸다. */
function dragEvent(type: string, items: unknown[] = [], types = ["Files"]) {
  const ev = new Event(type, { cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: { types, items, dropEffect: "none" } });
  return ev;
}

describe("web drop hub", () => {
  it("enter → over(기본 동작 막음) → drop: 등록된 경로를 구독자에게", async () => {
    const hub = createDropHub(async (d) => d.map((x) => `/web/x/${x.name}`));
    const win = new EventTarget() as unknown as Window;
    const seen: string[] = [];
    let resolveDrop: (p: string[]) => void;
    const dropped = new Promise<string[]>((r) => (resolveDrop = r));
    // subscribe 는 진짜 window 에 단다(node 에는 없다) — attach 로 가짜 창에 달고 구독은 sink 로만 쓴다.
    hub.subscribe(({ phase, paths }) => {
      seen.push(phase);
      if (phase === "drop") resolveDrop(paths);
    });
    const detach = hub.attach(win);
    win.dispatchEvent(dragEvent("dragenter"));
    const over = dragEvent("dragover");
    win.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true); // 이게 없으면 브라우저가 파일을 열어 버린다
    const drop = dragEvent("drop", [{ kind: "file", getAsFile: () => file("n.md", "N") }]);
    win.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(await dropped).toEqual(["/web/x/n.md"]);
    expect(seen).toEqual(["enter", "over", "drop"]);
    detach();
  });

  it("파일이 아닌 드래그는 건드리지 않는다", () => {
    const hub = createDropHub(async () => []);
    const win = new EventTarget() as unknown as Window;
    hub.attach(win);
    const over = dragEvent("dragover", [], ["text/plain"]);
    win.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
  });
});
