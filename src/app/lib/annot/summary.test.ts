import { describe, expect, it } from "vitest";
import { memoryBackend } from "./api";
import { resolveAll } from "./resolve";
import { reviewSummary } from "./summary";

const tx = {
  title: (p: string) => `리뷰 — ${p}`,
  meaning: (s: string) => ({ highlight: "중요", wavy: "확인 필요", strike: "빼도 됨" })[s] ?? s,
  state: (s: string) => ({ changed: "바뀜", gone: "사라짐" })[s] ?? s,
  line: (n: number) => `${n}줄`,
  goneNote: "지금 판에 없음",
};

describe("reviewSummary", () => {
  it("뜻 · 상태 · 줄 · 메모, 해결됨은 빼고 사라진 것은 끝에", async () => {
    const v1 = "# 보고\n\n근거가 부족하다.\n\n이 문장은 지워질 것.\n\n결론.\n";
    const be = memoryBackend(() => v1);
    const add = (id: string, needle: string, style: string, note: string | null) => {
      const s = v1.indexOf(needle);
      return be.add({ id, path: "C:/d.md", kind: "range", style: style as never, color: "yellow", srcStart: s, srcEnd: s + needle.length, quote: needle, prefix: "", suffix: "", note });
    };
    await add("a", "근거가 부족하다", "wavy", "출처?");
    await add("b", "이 문장은 지워질 것", "strike", null);
    await add("c", "결론", "highlight", null);
    await add("d", "보고", "highlight", "이건 해결");
    await be.update("d", { resolved: true });
    const v2 = "# 보고\n\n근거가 충분하다.\n\n결론.\n";
    const md = reviewSummary("C:/d.md", resolveAll(await be.list("C:/d.md"), v2), tx);
    expect(md).toBe(
      [
        "## 리뷰 — C:/d.md",
        "",
        "- **확인 필요** · 바뀜 (3줄) — “근거가 부족하다” → “근거가 충분하다”",
        "  - 출처?",
        "- **중요** (5줄) — “결론”",
        "- **빼도 됨** · 사라짐 — “이 문장은 지워질 것” (지금 판에 없음)",
        "",
      ].join("\n"),
    );
  });
});
