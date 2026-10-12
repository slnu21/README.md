import { describe, expect, it } from "vitest";
import { memoryBackend, type NewAnnotation } from "./api";
import { resolveAll, summarize } from "./resolve";

const V1 = "# 보고\r\n\r\n근거가 부족하다.\r\n\r\n결론은 다음 주에.\r\n";

function ann(text: string, id: string, needle: string, note: string | null = null): NewAnnotation {
  const t = text.replace(/\r\n/g, "\n");
  const s = t.indexOf(needle);
  return { id, path: "C:/d.md", kind: "range", style: "highlight", color: "yellow", srcStart: s, srcEnd: s + needle.length, quote: needle, prefix: "", suffix: "", note };
}

describe("resolveAll", () => {
  it("판 둘을 가리키는 표시들 · 상태 · 메모 번호 · 요약", async () => {
    let disk = V1;
    const be = memoryBackend(() => disk);
    await be.add(ann(V1, "a", "근거가 부족하다", "출처?"));
    await be.add(ann(V1, "b", "다음 주", "언제?"));
    // 에이전트가 고쳐 쓴 판에 하나 더
    const V2 = "# 보고\n\n덧붙인 문단.\n\n근거가 충분하다.\n\n결론은 다음 주에.\n";
    disk = V2;
    await be.add(ann(V2, "c", "덧붙인 문단"));
    const set = await be.list("C:/d.md");
    expect(set.snapshots).toHaveLength(2);

    const rs = resolveAll(set, V2);
    const by = Object.fromEntries(rs.map((r) => [r.ann.id, r]));
    expect(by.a.state).toBe("changed");
    expect(by.a.after).toBe("근거가 충분하다");
    expect(by.b.state).toBe("moved");
    expect(by.c.state).toBe("same");
    // 번호는 문서 순서(지금 판 위치) — 메모 있는 것만
    expect(rs.map((r) => r.ann.id)).toEqual(["c", "a", "b"]);
    expect(by.a.badge).toBe(1);
    expect(by.b.badge).toBe(2);
    expect(by.c.badge).toBeUndefined();
    expect(by.b.line).toBe(6);
    expect(summarize(rs)).toEqual({ notes: 2, changed: 1, gone: 0, total: 3 });
  });

  it("사라진 표시는 번호가 없고 요약에 잡힌다 · 해결됨은 빠진다", async () => {
    const be = memoryBackend(() => V1);
    await be.add(ann(V1, "a", "근거가 부족하다", "출처?"));
    await be.add(ann(V1, "b", "결론은", null));
    const rs = resolveAll(await be.list("C:/d.md"), "# 보고\n\n결론은 다음 주에.\n");
    const a = rs.find((r) => r.ann.id === "a")!;
    expect(a.state).toBe("gone");
    expect(a.badge).toBeUndefined();
    expect(summarize(rs).gone).toBe(1);
    await be.update("a", { resolved: true });
    expect(summarize(resolveAll(await be.list("C:/d.md"), "# 보고\n")).gone).toBe(1); // b 가 사라짐
  });

  it("메모리 저장소도 낡은 오프셋을 거절한다(Rust 와 같은 계약)", async () => {
    const be = memoryBackend(() => V1);
    const bad = { ...ann(V1, "x", "근거가"), quote: "다른 글" };
    await expect(be.add(bad)).rejects.toThrow(/just changed/);
  });
});
