// 경량 퍼지 매칭(서브시퀀스 + 연속/단어경계 가산점). 오프라인 원칙 — 외부 라이브러리 없이.
// 명령 팔레트·파일 퀵오픈 공용. 매칭 실패 시 null, 성공 시 점수 + 하이라이트 구간.
export interface FuzzyResult {
  score: number;
  ranges: [number, number][]; // 매칭 문자 구간 [start,end) — 연속 구간은 병합됨(하이라이트용)
}

const BOUNDARY = /[\s/\\._-]/;

/** query가 target의 서브시퀀스면 점수/구간 반환, 아니면 null. 대소문자·공백 무시. */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return { score: 1, ranges: [] };
  const tl = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let prev = -2;
  const idxs: number[] = [];
  for (let ti = 0; ti < tl.length && qi < q.length; ti++) {
    if (tl[ti] === q[qi]) {
      idxs.push(ti);
      score += ti === prev + 1 ? 6 : 1; // 연속 매칭 가산
      if (ti === 0 || BOUNDARY.test(target[ti - 1])) score += 8; // 단어 경계 가산
      prev = ti;
      qi++;
    }
  }
  if (qi < q.length) return null; // 전부 매칭 못 함
  score -= idxs[0]; // 이른 시작 선호
  score -= (target.length - q.length) * 0.1; // 짧은 타깃 약하게 선호
  return { score, ranges: mergeRanges(idxs) };
}

function mergeRanges(idxs: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const i of idxs) {
    const last = out[out.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else out.push([i, i + 1]);
  }
  return out;
}
