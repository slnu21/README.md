// 상류 truth 가드. lib/mermaid.ts 의 `htmlLabels: false`(최상위)가 왜 필요한지를 상류 코드로 확인한다.
//
// mermaid 11.16.0 의 labelHelper(모든 노드 셰이프 공용)는 **최상위** config.htmlLabels 만 읽고
// flowchart.htmlLabels 는 보지 않는다 — 그래서 `flowchart:{htmlLabels:false}` 만으로는 노드 라벨을
// SVG 텍스트로 바꿀 수 없었다(v0.6.8 라벨 잘림). 상류가 이걸 고치거나 구조를 바꾸면 이 테스트가
// 깨진다. **깨지는 것이 신호다** — 설정을 다시 검토하고 `npm run probe:mermaid` 로 실측할 것.
//
// 선례: features/editor/actions.test.ts 도 실제 CodeMirror 키맵을 읽어 대조한다.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "../../node_modules/mermaid");
const CHUNKS = join(PKG, "dist/chunks/mermaid.core");

/** 선언부터 esbuild 가 남긴 `__name(fn, "labelHelper")` 마커까지를 정의 본문으로 잘라낸다.
 *  청크 파일명은 릴리스마다 바뀌므로 **디렉터리를 훑는다**(파일명 하드코딩 금지). */
const DEF = /(?:var|async function|function)\s+labelHelper[\s\S]*?"labelHelper"\)/g;

function labelHelperBodies(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(CHUNKS).filter((n: string) => n.endsWith(".mjs"))) {
    const src = readFileSync(join(CHUNKS, f), "utf8");
    out.push(...(src.match(DEF) ?? []));
  }
  return out;
}

describe("상류 mermaid — htmlLabels 해석 경로", () => {
  it("설치된 mermaid가 11.x다(메이저가 바뀌면 의도적으로 실패)", () => {
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as { version: string };
    expect(pkg.version, "mermaid 메이저 변경 — 라벨 경로를 다시 확인할 것").toMatch(/^11\./);
  });

  it("labelHelper 정의를 찾는다(못 찾으면 이 테스트가 공허해진다)", () => {
    expect(labelHelperBodies().length).toBeGreaterThan(0);
  });

  it("최상위 htmlLabels만 읽는 labelHelper가 아직 있다 — 이게 최상위 키를 박는 이유다", () => {
    // 이 패키지엔 labelHelper 가 둘이다: 통합 렌더러용(chunk-ZGVPDNZ5)과 블록 다이어그램 자체 사본.
    // 뒤쪽은 getEffectiveHtmlLabels 로 flowchart.htmlLabels 까지 보지만, **앞쪽은 안 본다** —
    // flowchart 키만으로 노드 라벨을 SVG 텍스트로 못 바꾸는 원인이 정확히 그것이다.
    const heads = labelHelperBodies().map((b) => b.slice(0, 400));
    const rawOnly = heads.filter((h) => /htmlLabels/.test(h) && !/getEffectiveHtmlLabels/.test(h));
    expect(
      rawOnly.length,
      "labelHelper 가 전부 getEffectiveHtmlLabels 로 통일됐다 — 상류가 고쳤을 수 있다. " +
        "lib/mermaid.ts 의 최상위 htmlLabels 가 아직 필요한지 재검토하고 npm run probe:mermaid 로 확인할 것.",
    ).toBeGreaterThan(0);
  });
});
