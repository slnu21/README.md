import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalText, lineAt, Relocator } from "./relocate";

const NL = "\n";

/** 옛 글에서 `needle` 을 칠하고 새 글로 옮긴다. */
function mark(oldText: string, newText: string, needle: string) {
  const s = oldText.indexOf(needle);
  expect(s).toBeGreaterThanOrEqual(0);
  return new Relocator(oldText, newText).relocate(s, s + needle.length);
}

const REPORT = [
  "# 주간 보고",
  "",
  "## 1. 요약",
  "",
  "이번 주에 문서 6편이 바뀌었다. 막힌 것은 2건이다.",
  "",
  "## 2. 근거",
  "",
  "P95 지연은 91ms 까지 올랐다. 근거가 부족하다 — 측정은 한 번뿐이었다.",
  "",
  "- 파일 어댑터: 큐가 차면 기다린다",
  "- 소켓 어댑터: 오래된 항목부터 버린다",
  "",
  "## 3. 다음",
  "",
  "다음 주에 다시 잰다.",
  "",
].join("\n");

describe("Relocator — 에이전트식 수정", () => {
  it("그대로 — 아무것도 안 바뀜", () => {
    const r = mark(REPORT, REPORT, "근거가 부족하다");
    expect(r.state).toBe("same");
    expect(r.after).toBe("근거가 부족하다");
  });

  it("옮겨짐 — 위에 문단이 끼어듦", () => {
    const n = REPORT.replace("## 2. 근거\n", "## 2. 근거\n\n(에이전트가 덧붙임) 이 절은 10-12 에 다시 썼다.\n");
    const r = mark(REPORT, n, "근거가 부족하다");
    expect(r.state).toBe("moved");
    expect(n.slice(r.start, r.end)).toBe("근거가 부족하다");
  });

  it("옮겨짐 — 범위 바로 앞·뒤에 글이 붙어도 섞이지 않는다", () => {
    const n = REPORT.replace("근거가 부족하다", "(주) 근거가 부족하다(재확인)");
    const r = mark(REPORT, n, "근거가 부족하다");
    expect(r.state).toBe("moved");
    expect(r.after).toBe("근거가 부족하다");
  });

  it("바뀜 — 칠한 문장의 한 낱말을 고침", () => {
    const n = REPORT.replace("근거가 부족하다", "근거가 충분하다");
    const r = mark(REPORT, n, "근거가 부족하다");
    expect(r.state).toBe("changed");
    expect(r.before).toBe("근거가 부족하다");
    expect(r.after).toBe("근거가 충분하다");
  });

  it("바뀜 — 문장을 통째로 다시 씀", () => {
    const n = REPORT.replace("근거가 부족하다 — 측정은 한 번뿐이었다.", "세 번 다시 재서 확인했다.");
    const r = mark(REPORT, n, "근거가 부족하다");
    expect(r.state).toBe("changed");
    expect(r.after).toContain("세 번 다시 재서 확인했다");
    expect(r.after).not.toContain("P95");
  });

  it("바뀜 — 범위 안쪽에 낱말이 끼어듦", () => {
    const n = REPORT.replace("근거가 부족하다", "근거가 아직 부족하다");
    const r = mark(REPORT, n, "근거가 부족하다");
    expect(r.state).toBe("changed");
    expect(r.after).toBe("근거가 아직 부족하다");
  });

  it("사라짐 — 절을 통째로 지움", () => {
    const n = REPORT.replace(/## 2\. 근거[\s\S]*?(?=## 3)/, "");
    const r = mark(REPORT, n, "근거가 부족하다");
    expect(r.state).toBe("gone");
    expect(r.start).toBe(r.end);
    expect(n.slice(r.start).startsWith("## 3")).toBe(true);
  });

  it("문단을 끼우고 바로 아래 문단을 고쳐도 — 고친 문단을 따라간다(빈 줄이 짝을 잘못 맺던 것)", () => {
    // 줄 diff 가 두 문단 사이 빈 줄을 맞추면서 옛 문단을 *끼운* 문단과 짝지었다 — probe:annot 에서 찾음.
    // 짧은 문단으로는 재현이 안 된다(Myers 가 다른 길을 고른다) — probe:annot 의 픽스처·수정을 그대로 쓴다.
    const o = readFileSync(fileURLToPath(new URL("../../../../docs/samples/annot-review.md", import.meta.url).href), "utf8");
    const n = o
      .replace("## 무엇을 했나" + NL, "## 무엇을 했나" + NL + NL + "(에이전트가 덧붙임) 이 절은 10-12 에 다시 썼다." + NL)
      .replace("근거가 부족하다", "근거가 충분하다")
      .replace("- 지워진 파일은 walk 하며 본 경로 목록과 대조해 색인에서 뺀다." + NL, "");
    expect(mark(o, n, "근거가 부족하다")).toMatchObject({ state: "changed", after: "근거가 충분하다" });
    expect(mark(o, n, "부팅 때마다 색인 전체를")).toMatchObject({ state: "moved", after: "부팅 때마다 색인 전체를" });
    expect(mark(o, n, "성능 문서")).toMatchObject({ state: "moved", after: "성능 문서" });
  });

  it("목록 항목 하나가 지워지면 다른 항목 표시는 옮겨짐", () => {
    const n = REPORT.replace("- 파일 어댑터: 큐가 차면 기다린다\n", "");
    expect(mark(REPORT, n, "큐가 차면 기다린다").state).toBe("gone");
    const r = mark(REPORT, n, "오래된 항목부터 버린다");
    expect(r.state).toBe("moved");
    expect(r.after).toBe("오래된 항목부터 버린다");
  });

  it("표에 행이 붙어도 아래 셀 표시는 옮겨짐", () => {
    const o = "| 항목 | 값 |\n|---|---|\n| 지연 | 91ms |\n| 처리량 | 12k |\n";
    const n = "| 항목 | 값 |\n|---|---|\n| 시작 | 0.4s |\n| 지연 | 91ms |\n| 처리량 | 12k |\n";
    const r = mark(o, n, "12k");
    expect(r.state).toBe("moved");
    expect(r.after).toBe("12k");
  });

  it("같은 글이 위에도 새로 생겨도 원래 자리를 따라간다", () => {
    const n = REPORT.replace("## 1. 요약\n", "## 1. 요약\n\n근거가 부족하다는 지적이 있었다.\n");
    const s = REPORT.indexOf("근거가 부족하다");
    const r = new Relocator(REPORT, n).relocate(s, s + 8);
    expect(r.state).toBe("moved");
    expect(r.start).toBe(n.lastIndexOf("근거가 부족하다"));
  });

  it("오른쪽에서 왼쪽 글(페르시아어)도 같은 규칙", () => {
    const o = "این یک سند است.\n\nشواهد کافی نیست.\n";
    const n = "مقدمه\n\nاین یک سند است.\n\nشواهد کافی است.\n";
    const r = mark(o, n, "شواهد کافی نیست");
    expect(r.state).toBe("changed");
    expect(r.after).toBe("شواهد کافی است");
    expect(mark(o, n, "این یک سند").state).toBe("moved");
  });

  it("여러 표시를 한 Relocator 로", () => {
    const n = REPORT.replace("6편", "여섯 편").replace("다음 주에", "모레");
    const rel = new Relocator(REPORT, n);
    const at = (s: string) => REPORT.indexOf(s);
    expect(rel.relocate(at("6편"), at("6편") + 2).state).toBe("changed");
    expect(rel.relocate(at("P95"), at("P95") + 3).state).toBe("moved");
    expect(rel.relocate(at("다시 잰다"), at("다시 잰다") + 5).state).toBe("moved");
  });

  it("범위가 글 밖이면 잘라서 다룬다", () => {
    const r = new Relocator("abc", "abc").relocate(1, 99);
    expect(r).toMatchObject({ state: "same", start: 1, end: 3 });
  });
});

describe("canonicalText · lineAt", () => {
  it("CRLF·CR → LF, 앞 BOM 제거", () => {
    expect(canonicalText("﻿a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });

  it("CRLF 로 저장된 판과 LF 판 사이도 diff 가 줄끝에 흔들리지 않는다", () => {
    const o = canonicalText(REPORT.replace(/\n/g, "\r\n"));
    const r = mark(o, REPORT, "근거가 부족하다");
    expect(r.state).toBe("same");
  });

  it("줄 번호는 0 부터", () => {
    expect(lineAt("a\nb\nc", 0)).toBe(0);
    expect(lineAt("a\nb\nc", 2)).toBe(1);
    expect(lineAt("a\nb\nc", 4)).toBe(2);
  });
});

describe("Relocator — 큰 문서", () => {
  it("5천 줄 · 40곳 수정에서도 표시가 제자리를 찾는다(덩어리로 뭉개지지 않음)", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `${i}번 줄 — 문장 ${i % 97} 의 내용은 여기 있다.`);
    const o = lines.join("\n") + "\n";
    const nl = [...lines];
    for (let k = 0; k < 40; k++) nl.splice(k * 120 + 7, 1, `새로 쓴 ${k}번째 줄.`, `끼운 줄 ${k}.`);
    const n = nl.join("\n") + "\n";
    const t0 = performance.now();
    const rel = new Relocator(o, n);
    const target = "4999번 줄";
    const r = rel.relocate(o.indexOf(target), o.indexOf(target) + target.length);
    const ms = performance.now() - t0;
    expect(r.state).toBe("moved");
    expect(r.after).toBe(target);
    const gone = rel.relocate(o.indexOf("7번 줄"), o.indexOf("7번 줄") + 4);
    expect(gone.state).toBe("changed"); // 그 줄은 다른 글로 바뀌었다
    expect(ms).toBeLessThan(1000);
  });
});
