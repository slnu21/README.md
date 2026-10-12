/**
 * 저장된 표시 → 지금 판에서의 모습. 같은 판을 가리키는 표시들은 diff 를 한 번만 한다.
 * 그리고 요약(알약 "메모 3 · 바뀜 1 · 위치 잃음 1")과 메모 번호를 여기서 정한다 — 화면과 내보내기·
 * 요약 복사가 같은 번호를 써야 한다.
 */
import type { Annotation, AnnotationSet } from "./api";
import { canonicalText, lineAt, Relocator, type AnchorState } from "./relocate";

export interface Resolved {
  ann: Annotation;
  state: AnchorState;
  /** 지금 판(정규화한 글)의 범위. */
  start: number;
  end: number;
  before: string;
  after: string;
  /** 지금 판의 줄(0부터). */
  line: number;
  /** 메모 번호(1부터) — 메모가 있고 위치를 잃지 않은 것에만, 문서 순서대로. */
  badge?: number;
}

export function resolveAll(set: AnnotationSet, current: string): Resolved[] {
  const now = canonicalText(current);
  const bySnap = new Map<number, Relocator>();
  const snapText = new Map(set.snapshots.map((s) => [s.id, canonicalText(s.content)]));
  const out: Resolved[] = [];
  for (const ann of set.annotations) {
    const old = snapText.get(ann.snapshotId);
    if (old == null) {
      // 바탕 판이 없다(있어선 안 되는 일 — 정리 예외가 지킨다). 인용으로라도 찾는다.
      const i = now.indexOf(ann.quote);
      out.push(
        i >= 0 && ann.quote
          ? { ann, state: "moved", start: i, end: i + ann.quote.length, before: ann.quote, after: ann.quote, line: lineAt(now, i) }
          : { ann, state: "gone", start: 0, end: 0, before: ann.quote, after: "", line: 0 },
      );
      continue;
    }
    let rel = bySnap.get(ann.snapshotId);
    if (!rel) bySnap.set(ann.snapshotId, (rel = new Relocator(old, now)));
    const r = rel.relocate(ann.srcStart, ann.srcEnd);
    out.push({ ann, ...r, line: lineAt(now, r.start) });
  }
  out.sort((a, b) => a.start - b.start || a.ann.createdAt - b.ann.createdAt);
  let n = 0;
  for (const r of out) if (r.ann.note && r.state !== "gone") r.badge = ++n;
  return out;
}

export interface Summary {
  notes: number;
  changed: number;
  gone: number;
  total: number;
}

export function summarize(rs: readonly Resolved[]): Summary {
  return {
    notes: rs.filter((r) => r.ann.note).length,
    changed: rs.filter((r) => r.state === "changed" && !r.ann.resolved).length,
    gone: rs.filter((r) => r.state === "gone" && !r.ann.resolved).length,
    total: rs.length,
  };
}
