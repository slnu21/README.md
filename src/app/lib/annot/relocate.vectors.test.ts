import { describe, expect, it } from "vitest";
import vectors from "./relocate.vectors.json";
import { Relocator } from "./relocate";

/** Rust(`annot_relocate.rs`)가 같은 파일을 돈다 — 브리지 `list_annotations` 의 상태가 화면과 같아야 한다. */
describe("relocate 공유 벡터", () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const nth = (c as { nth?: number }).nth ?? 0;
      let s = -1;
      for (let k = 0; k <= nth; k++) s = c.old.indexOf(c.needle, s + 1);
      const r = new Relocator(c.old, c.new).relocate(s, s + c.needle.length);
      expect(r.state).toBe(c.state);
      expect(r.after).toBe(c.after);
      const at = (c as { afterAt?: number }).afterAt;
      if (at != null) {
        let want = -1;
        for (let k = 0; k <= at; k++) want = c.new.indexOf(c.after, want + 1);
        expect(r.start).toBe(want);
      }
    });
  }
});
