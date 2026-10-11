// 성능 프로브용 큰 문서 생성기 — 결정적(실행마다 같은 문서)이어야 숫자를 비교할 수 있다.
//
// 에이전트가 쏟아내는 보고서를 흉내 낸다: 헤딩 · 문단 · 목록 · 체크박스 · 코드 펜스(하이라이트 비용) ·
// 표 · 인라인 수식 가끔. 낱말 빈도는 지프(1/순위)를 따른다 — 고르게 뽑으면 실제 글과 비용 모양이
// 달라진다(Rust 쪽 perf.rs 에서 스니펫 비용이 그렇게 부풀었다).
//
// mermaid·블록 수식은 넣지 않는다 — 그 비용은 갤러리 측정이 따로 잰다(큰 문서에 섞으면 무엇이
// 느린지 갈라지지 않는다).

/** xorshift32 — 작고 결정적. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

const NAMED = [
  "agent", "report", "index", "render", "preview", "outline", "bridge", "inbox", "history",
  "문서", "에이전트", "보고서", "색인", "검색", "기록", "미리보기", "결정", "검증", "설계",
];
const VOCAB = 4000;

export interface FixtureOpts {
  /** 대략의 목표 바이트(UTF-8 이 아니라 JS 문자열 길이). */
  chars: number;
  seed?: number;
  /** 끝 헤딩 글자 — 문서마다 달라야 "직전 문서의 미리보기"를 끝으로 착각하지 않는다. */
  end?: string;
}

/** 큰 마크다운 문서. 마지막 헤딩은 `## {end}` — 렌더가 끝까지 됐는지의 표식. */
export function bigDoc({ chars, seed = 42, end = "END-OF-FIXTURE" }: FixtureOpts): string {
  const r = rng(seed);
  const word = () => {
    const k = Math.floor(Math.pow(VOCAB, r())); // 1..VOCAB, 로그 균등 = 지프
    return k >= 8 && k < 8 + NAMED.length ? NAMED[k - 8] : `w${k}`;
  };
  const sentence = (n: number) => Array.from({ length: n }, word).join(" ");
  const out: string[] = ["# Performance fixture", ""];
  let len = 0;
  let sec = 0;
  const push = (s: string) => {
    out.push(s);
    len += s.length + 1;
  };
  while (len < chars) {
    sec++;
    push(`## ${sentence(3)} ${sec}`);
    push("");
    for (let p = 0; p < 4; p++) {
      // 한 줄 = 한 문장 묶음(대략 80자) — 실제 에이전트 출력은 줄이 짧고 많다.
      const lines = 2 + Math.floor(r() * 4);
      for (let l = 0; l < lines; l++) push(sentence(8 + Math.floor(r() * 8)) + (r() < 0.1 ? ` $x_${l}^2$` : "") + ".");
      push("");
    }
    if (sec % 3 === 0) {
      push(`- [x] ${sentence(5)}`);
      push(`- [ ] ${sentence(6)}`);
      push(`- ${sentence(4)} \`${word()}\``);
      push("");
    }
    if (sec % 4 === 1) {
      push("```ts");
      push(`export function f${sec}(input: string): number {`);
      push(`  // ${sentence(6)}`);
      push(`  const parts = input.split(" ").filter((p) => p.length > ${sec % 7});`);
      push(`  return parts.reduce((acc, p) => acc + p.length, ${sec});`);
      push("}");
      push("```");
      push("");
    }
    if (sec % 5 === 2) {
      push(`| ${word()} | ${word()} | ${word()} |`);
      push("| --- | --- | --- |");
      for (let t = 0; t < 4; t++) push(`| ${word()} | ${sentence(2)} | ${Math.floor(r() * 1000)} |`);
      push("");
    }
  }
  push(`## ${end}`);
  push("");
  push("마지막 문단.");
  return out.join("\n");
}
