/**
 * [리뷰 요약 복사](ADR 0003 8절) — 브리지 없는 사용자를 위한 같은 리뷰 고리. 칠한 문장 + 뜻 + 메모를 마크다운
 * 목록으로 만들어 채팅창에 붙여 넣게 한다. 에이전트가 `list_annotations` 로 받는 것과 같은 내용(뜻·상태·줄)이다.
 */
import type { Resolved } from "./resolve";
import type { AnnotStyle } from "./pens";

export interface SummaryText {
  title: (path: string) => string;
  meaning: (style: AnnotStyle) => string;
  state: (s: Resolved["state"]) => string;
  line: (n: number) => string;
  /** 사라진 표시 머리말(예: "지금 판에 없음"). */
  goneNote: string;
}

const clip = (s: string, n = 160) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
};

/** 해결됨은 뺀다. 순서는 지금 판 위치, 사라진 것은 끝. */
export function reviewSummary(path: string, rs: readonly Resolved[], tx: SummaryText): string {
  const open = rs.filter((r) => !r.ann.resolved);
  const live = open.filter((r) => r.state !== "gone");
  const gone = open.filter((r) => r.state === "gone");
  const out = [`## ${tx.title(path)}`, ""];
  for (const r of live) {
    const quote = r.state === "changed" ? `“${clip(r.before)}” → “${clip(r.after)}”` : `“${clip(r.after)}”`;
    const tag = r.state === "changed" ? ` · ${tx.state("changed")}` : "";
    out.push(`- **${tx.meaning(r.ann.style)}**${tag} (${tx.line(r.line + 1)}) — ${quote}${r.ann.note ? `\n  - ${clip(r.ann.note, 2000)}` : ""}`);
  }
  for (const r of gone) {
    out.push(`- **${tx.meaning(r.ann.style)}** · ${tx.state("gone")} — “${clip(r.before)}” (${tx.goneNote})${r.ann.note ? `\n  - ${clip(r.ann.note, 2000)}` : ""}`);
  }
  return out.join("\n") + "\n";
}
