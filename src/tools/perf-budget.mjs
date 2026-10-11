// 성능 예산 판정 — 프런트 프로브(tools/perf-probe.mjs)가 쓴다. Rust 쪽(src-tauri/src/perf.rs)은 같은
// 예산 파일(perf-budget.json)을 같은 규칙으로 읽는다: `_` 로 시작하는 키는 주석, 예산에 있는데 안 잰
// 항목은 위반(재는 쪽이 조용히 빠지면 예산이 공허하게 통과한다), `_info` 로 끝나는 측정은 예산 밖.

/** 중앙값 — 짝수 개면 위쪽 가운데(Rust 쪽 median 과 같은 규칙). */
export function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 여러 번 잰 측정 묶음 → 항목별 중앙값. 한 번이라도 빠진 항목은 잰 것만으로. */
export function medianOfRuns(runs) {
  const keys = new Set(runs.flatMap((r) => Object.keys(r)));
  const out = {};
  for (const k of keys) {
    const xs = runs.map((r) => r[k]).filter((v) => typeof v === "number" && Number.isFinite(v));
    if (xs.length) out[k] = Math.round(median(xs) * 10) / 10;
  }
  return out;
}

/** 예산 한 절과 측정을 대조해 위반 문장 목록을 돌려준다(빈 목록 = 통과). */
export function checkBudget(budget, section, got) {
  const limits = budget?.[section];
  if (!limits || typeof limits !== "object") return [];
  const over = [];
  for (const [k, lim] of Object.entries(limits)) {
    if (k.startsWith("_") || typeof lim !== "number") continue;
    const v = got?.[k];
    if (typeof v !== "number" || !Number.isFinite(v)) over.push(`${section}.${k} 를 재지 않았다(예산에는 있다)`);
    else if (v > lim) over.push(`${section}.${k} = ${v} > 예산 ${lim}`);
  }
  return over;
}
