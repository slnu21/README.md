// 분할 컨테이너(.split)의 grid 템플릿 계산(순수).
//
// 핵심: `display:none` 은 grid 배치에서 아이템을 아예 뺀다. DOM 순서를
//   editor · seam-main · pane-a · seam-reader · pane-b
// 로 고정해 두고 모드마다 셋씩 숨기면, **어느 모드에서든 보이는 아이템이 정확히 1개 아니면 3개**다.
// 그래서 템플릿이 세 줄로 끝나고, 주 미리보기(pane-a)는 어떤 전환에서도 언마운트되지 않는다
// (스크롤 위치·iframe 문서가 그대로 살아 있다 — 리딩 모드가 원래 지키려던 성질이다).

export type SplitMode = "edit" | "reader" | "readerSplit";

export interface SplitOpts {
  mode: SplitMode;
  vertical: boolean; // 좁은 화면(≤900px) — 좌우 대신 위아래로 쌓는다
  ratio: number; // 편집:미리보기
  readerRatio: number; // 리딩 분할의 좌:우
}

/** `0.7` → `"0.7fr 7px 0.3fr"`. 1-0.7 이 0.30000000000000004 라서 반드시 반올림한다. */
function track(r: number): string {
  const round = (n: number) => Math.round(n * 1e4) / 1e4;
  return `${round(r)}fr 7px ${round(1 - r)}fr`;
}

export function splitTemplate(o: SplitOpts): {
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
} {
  const tmpl =
    o.mode === "reader" ? "1fr" : track(o.mode === "readerSplit" ? o.readerRatio : o.ratio);
  return o.vertical && o.mode !== "reader"
    ? { gridTemplateRows: tmpl, gridTemplateColumns: "1fr" }
    : o.vertical
      ? { gridTemplateRows: "1fr", gridTemplateColumns: "1fr" }
      : { gridTemplateColumns: tmpl };
}
