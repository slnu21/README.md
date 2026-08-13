// mermaid 렌더 프로브 — 브라우저 쪽 하네스.
//
// 왜 있나: 미리보기 iframe은 스크립트가 차단돼(`sandbox="allow-same-origin"`) mermaid를 안에서
// 돌릴 수 없다. 그래서 **앱 문서에서 재고 미리보기 문서에서 보여준다.** 두 문서의 상속 CSS가
// 어긋나면 라벨 상자가 어긋나고, 라벨이 도형을 넘거나(v0.6.7) 글자 중간에서 잘린다(v0.6.8).
// 눈으로만 보면 다음 버전에서 또 샌다 — v0.6.7 때 쓴 프로브를 커밋하지 않아 실제로 그랬다.
//
// 이 파일은 **앱의 진짜 모듈**을 import 해서 `shell/Preview.tsx`와 같은 순서로 파이프라인을 돌리고,
// 결과를 실제와 같은 sandbox iframe에 넣은 뒤 **iframe 문서 안에서** 잰다. 그게 요점이다 —
// 하네스 문서에서 재면 측정=표시가 되어 버려 이 버그를 영원히 못 잡는다.
//
// 실행: `cd src; npm run probe:mermaid` (tools/mermaid-probe.mjs 가 이 페이지를 띄운다)
import { createMarkdown } from "../lib/markdown";
import { sanitizeHtml } from "../lib/sanitize";
import { renderMermaid } from "../lib/mermaid";
import { buildDoc, DIAGRAM_CTX_CSS, type FontOpts } from "../lib/renderDoc";
import { BASE_READER_PX, readStack, uiStack } from "../lib/fonts";
import { applyTheme } from "../themes/apply";
import { themes } from "../themes";
// 측정 스테이지는 **이 문서**에 붙는다. 그러니 이 문서가 앱 문서와 같은 상속 문맥이어야 프로브가
// 실제를 잰다 — App.css(body{font-family:var(--ui-font)}) + applyTheme + --ui-font 주입까지
// App.tsx:18-40 이 하는 일을 그대로 재현한다. 하네스 자체 스타일을 쓰면 측정 문맥이 가짜가 된다.
import "../App.css";

/** `<foreignObject>` 를 정당하게 쓰는 다이어그램. 나머지는 0개여야 한다.
 *  journey·timeline 은 `textPlacement:"fo"` 로 **고정 크기** 상자를 쓰고(측정값이 아니라 설정값),
 *  sequence 는 KaTeX 메시지에서만 쓴다. 셋 다 앱 문서에서 잰 폭을 얼려 넣지 않는다. */
const FO_ALLOWED = new Set(["journey", "timeline", "sequence"]);

/** `dominant-baseline` 최소 개수(v0.6.7 회귀 가드). 정화가 이 속성을 지우면 축·노트 글자가
 *  baseline 으로 내려앉아 상자 밖으로 밀린다. 0이 되면 실패 — 공허 통과를 막는 바닥값이다. */
const MIN_DOMINANT_BASELINE = 10;

/** 측정한 라벨 수 바닥값. 셀렉터가 깨지면 "위반 0건"으로 조용히 통과하므로 반드시 함께 본다. */
const MIN_LABELS_MEASURED = 30;

interface DiagramReport {
  n: number;
  title: string;
  role: string;
  foCount: number;
  labels: number;
  maxOverflowPx: number;
  worst: string;
}

export interface ProbeResult {
  ok: boolean;
  failures: string[];
  lines: string[];
  stats: Record<string, number>;
  /** `--shot` 실행일 때만. 첫 설정의 미리보기 문서 원문 — 드라이버가 파일로 떨궈 스크린샷을 찍는다. */
  srcdoc?: string;
}

const failures: string[] = [];
const lines: string[] = [];
const fail = (s: string) => failures.push(s);

const round = (n: number) => Math.round(n * 10) / 10;

/** 요소 안 **글자**가 실제로 차지하는 가로 폭(클라이언트 좌표).
 *  박스 폭(getBoundingClientRect·scrollWidth)으로는 안 된다 — mermaid 라벨 div 는
 *  `display:table-cell; white-space:nowrap; max-width:Wpx`(chunk-Q4XR5HBZ.mjs:224) 라서
 *  박스는 제약된 폭 그대로고 글자만 넘친다. 텍스트 노드마다 Range 를 잡아 좌우 끝을 모은다. */
function textWidth(root: Element): number {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let min = Infinity;
  let max = -Infinity;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const r = doc.createRange();
    r.selectNodeContents(n);
    for (const rect of Array.from(r.getClientRects())) {
      if (rect.width === 0) continue;
      min = Math.min(min, rect.left);
      max = Math.max(max, rect.right);
    }
    r.detach();
  }
  return max > min ? max - min : 0;
}

/** iframe 문서에서 요소의 SVG 사용자 좌표 bbox. 실패하면 null(측정 대상에서 제외). */
function bbox(el: Element): DOMRect | null {
  const g = el as SVGGraphicsElement;
  if (typeof g.getBBox !== "function") return null;
  try {
    const b = g.getBBox();
    return b.width > 0 || b.height > 0 ? b : null;
  } catch {
    return null;
  }
}

/** 한 다이어그램(.mermaid-rendered)을 iframe 문서 안에서 검사한다. */
function inspectDiagram(wrap: Element, n: number, cfgKey: string): DiagramReport {
  const svg = wrap.querySelector("svg");
  const title =
    (wrap.previousElementSibling?.closest("h2")?.textContent ??
      previousHeading(wrap) ??
      `(제목 없음)`).trim();
  const role = svg?.getAttribute("aria-roledescription") ?? "(unknown)";
  const rep: DiagramReport = { n, title, role, foCount: 0, labels: 0, maxOverflowPx: -Infinity, worst: "" };
  if (!svg) {
    fail(`[svg] ${cfgKey} #${n} ${title}: .mermaid-rendered 안에 <svg> 가 없다.`);
    return rep;
  }

  // (iii)(iv) mermaid 가 심는 스코프 스타일시트와 그 앵커가 되는 id — 둘 중 하나만 잃어도
  // 라벨이 글꼴·크기 고정을 잃고 미리보기 본문 글꼴(세리프!)로 떨어진다.
  const style = svg.querySelector("style");
  if (!style) {
    fail(
      `[iii] ${cfgKey} #${n} ${title}: <svg> 에 <style> 이 없다. sanitizeSvg 가 mermaid 의 ` +
        `스코프 스타일시트를 지웠다 — 라벨이 font-family/font-size 고정을 잃는다.`,
    );
  }
  const id = svg.getAttribute("id") ?? "";
  if (!id) {
    fail(
      `[iv] ${cfgKey} #${n} ${title}: <svg> 가 id 를 잃었다. mermaid 는 모든 규칙을 #<id> 로 ` +
        `네임스페이스하므로(mermaid.core.mjs:1301) id 가 없으면 스타일시트 전체가 무효다.`,
    );
  } else if (style && !style.textContent?.includes(`#${id}`)) {
    fail(`[iv] ${cfgKey} #${n} ${title}: <style> 이 #${id} 를 참조하지 않는다(id 가 바뀌었다).`);
  }

  // (i) 통합 렌더러 다이어그램에는 foreignObject 가 있으면 안 된다.
  const fos = Array.from(svg.querySelectorAll("foreignObject"));
  rep.foCount = fos.length;
  if (fos.length > 0 && !FO_ALLOWED.has(role)) {
    fail(
      `[i] ${cfgKey} #${n} ${title} (${role}): <foreignObject> ×${fos.length} (0개여야 한다). ` +
        `htmlLabels:false 가 labelHelper 에 닿지 않았다 — lib/mermaid.ts 의 diagramConfig() 를 ` +
        `chunk-ZGVPDNZ5.mjs:43(최상위 config.htmlLabels)와 대조할 것.`,
    );
  }

  // (ii-a) 남아 있는 foreignObject 는 얼린 상자 안에 들어가야 한다. 넘치면 글자 중간에서 잘린다.
  //
  // 재는 법: 안쪽 div 는 `display:table-cell; white-space:nowrap; max-width:Wpx`(chunk-Q4XR5HBZ.mjs:224)
  // 라서 **박스는 제약된 폭 그대로**고 글자만 넘친다 — scrollWidth·offsetWidth 로는 안 잡힌다.
  // 내용 전체를 Range 로 감싸 실제 조판 폭을 재고, 같은 좌표계(client rect)의 foreignObject 폭과
  // 견준다. 둘 다 SVG 스케일이 똑같이 걸리므로 확대/축소와 무관하게 성립한다.
  for (const fo of fos) {
    const inner = fo.firstElementChild as HTMLElement | null;
    if (!inner) continue;
    const box = fo.getBoundingClientRect().width;
    const text = textWidth(inner);
    if (box > 0 && text > box + 1) {
      const pct = Math.round((text / box) * 100);
      fail(
        `[ii-a] ${cfgKey} #${n} ${title}: foreignObject "${(inner.textContent ?? "").trim().slice(0, 24)}" ` +
          `얼린 상자 ${round(box)}px, 미리보기 문서에서 글자가 ${round(text)}px ` +
          `(+${round(text - box)}px, ${pct}%). 라벨이 글자 중간에서 잘린다 — 측정 문서 ≠ 표시 문서.`,
      );
    }
  }

  // (ii-b) SVG 텍스트 라벨은 자기 도형 bbox 안에 들어가야 한다.
  for (const node of Array.from(svg.querySelectorAll("g.node"))) {
    const shape = node.querySelector(":scope > rect, :scope > polygon, :scope > ellipse, :scope > circle, :scope > path");
    const label = node.querySelector("g.label, .label");
    if (!shape || !label) continue;
    const sb = bbox(shape);
    const lb = bbox(label);
    if (!sb || !lb) continue;
    rep.labels++;
    const overflow = lb.width - sb.width;
    if (overflow > rep.maxOverflowPx) {
      rep.maxOverflowPx = overflow;
      rep.worst = (label.textContent ?? "").trim().slice(0, 24);
    }
    if (overflow > 0.5) {
      fail(
        `[ii-b] ${cfgKey} #${n} ${title}: 노드 라벨 "${(label.textContent ?? "").trim().slice(0, 24)}" ` +
          `폭 ${round(lb.width)}px, 도형 폭 ${round(sb.width)}px (${round(overflow)}px 초과).`,
      );
    }
  }
  if (rep.maxOverflowPx === -Infinity) rep.maxOverflowPx = 0;
  return rep;
}

/** `.mermaid-rendered` 바로 앞의 h2 텍스트(문서 순서로 거슬러 올라간다). */
function previousHeading(el: Element): string | null {
  let cur: Element | null = el.previousElementSibling;
  while (cur) {
    if (cur.tagName === "H2") return cur.textContent;
    cur = cur.previousElementSibling;
  }
  return null;
}

/** srcdoc 을 iframe 에 넣고 load 를 기다린다(실제 미리보기와 같은 sandbox). */
function mount(iframe: HTMLIFrameElement, srcdoc: string): Promise<Document> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("iframe load timeout")), 20000);
    iframe.onload = () => {
      window.clearTimeout(t);
      const doc = iframe.contentDocument;
      doc ? resolve(doc) : reject(new Error("contentDocument 없음"));
    };
    iframe.srcdoc = srcdoc;
  });
}

async function run(): Promise<ProbeResult> {
  // 앱과 같은 lang·글꼴 변수. index.html 은 lang="en" 으로 나가고 App.tsx 가 런타임에 바꾼다.
  document.documentElement.lang = "ko";
  document.documentElement.style.setProperty("--ui-font", uiStack("pretendard")); // store 기본값
  document.documentElement.style.setProperty("--read-font", readStack("default"));

  const source = await (await fetch("/probe-fixture")).text();
  const md = createMarkdown();
  // 주의: 실제 파이프라인의 inlineImages 는 Tauri fs 가 필요해 건너뛴다(갤러리에 이미지가 없다).
  const clean = sanitizeHtml(md.render(source));

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin"); // allow-scripts 는 절대 넣지 않는다
  iframe.style.cssText = "width:1600px;height:2400px;border:0;position:absolute;left:0;top:0";
  document.body.appendChild(iframe);

  let totalLabels = 0;
  let totalDomBaseline = 0;
  let first = true;
  let shot: string | undefined;
  const wantShot = location.search.includes("shot");

  for (const themeId of ["light", "dark", "paper"]) {
    for (const diagramWidth of ["fit", "natural"] as const) {
      for (const zoom of [1, 1.8]) {
        const cfgKey = `${themeId}/${diagramWidth}/z${zoom}`;
        applyTheme(themeId); // 앱 문서 쪽 테마도 함께 바꾼다(측정 문맥 = 실제 앱 문맥)
        const font: FontOpts = { readStack: readStack("default"), readerPx: BASE_READER_PX * zoom };
        const body = await renderMermaid(clean, themeId);
        const srcdoc = buildDoc(body, themeId, font, {
          extraCss: "img{cursor:zoom-in}.md{max-width:860px;margin-left:auto;margin-right:auto}",
          diagramWidth,
        });

        if (wantShot && shot === undefined) shot = srcdoc; // 육안 확인용(첫 설정만)

        // (viii) 보안 회귀 가드 — 최종 문서에 스크립트 표면이 남으면 안 된다.
        if (/<script/i.test(srcdoc)) fail(`[viii] ${cfgKey}: 최종 srcdoc 에 <script> 가 있다.`);
        if (/\son[a-z]+\s*=/i.test(srcdoc)) fail(`[viii] ${cfgKey}: 최종 srcdoc 에 on* 핸들러가 있다.`);

        const doc = await mount(iframe, srcdoc);
        await doc.fonts?.ready;

        const wraps = Array.from(doc.querySelectorAll(".mermaid-rendered"));
        if (wraps.length === 0) fail(`[setup] ${cfgKey}: 렌더된 다이어그램이 하나도 없다.`);

        const reports = wraps.map((w, i) => inspectDiagram(w, i + 1, cfgKey));
        totalLabels += reports.reduce((a, r) => a + r.labels, 0);
        totalDomBaseline += doc.querySelectorAll("[dominant-baseline]").length;

        // (vii) 고의 오류 블록 정확히 1개.
        const errs = doc.querySelectorAll(".mermaid-error");
        if (errs.length !== 1) {
          fail(
            `[vii] ${cfgKey}: .mermaid-error 가 ${errs.length}개다(고의 오류 블록 1개여야 한다). ` +
              `1개보다 많으면 정상 다이어그램이 렌더에 실패하고 있다.`,
          );
        }

        // (vi) 측정 문맥 ↔ 표시 문맥 대조. 상속 속성이 어긋나면 라벨 상자가 어긋난다.
        if (first) {
          const stage = document.querySelector<HTMLElement>('div[style*="-99999px"]');
          const shown = doc.querySelector(".mermaid-rendered");
          if (!stage) {
            fail("[vi] 측정 스테이지를 찾지 못했다(lib/mermaid.ts measureStage 가 바뀌었나?).");
          } else if (shown) {
            const a = getComputedStyle(stage);
            const b = getComputedStyle(shown);
            for (const p of [
              "font-family",
              "font-size",
              "line-height",
              "letter-spacing",
              "word-spacing",
              "text-rendering",
            ] as const) {
              if (a.getPropertyValue(p) !== b.getPropertyValue(p)) {
                fail(
                  `[vi] 상속 문맥 불일치 ${p}: 측정 "${a.getPropertyValue(p)}" ↔ 표시 ` +
                    `"${b.getPropertyValue(p)}". DIAGRAM_CTX_CSS(renderDoc.ts:18)를 양쪽이 ` +
                    `더는 공유하지 않는다.`,
                );
              }
            }
          }
          // 언어 토글 후 측정 스테이지의 lang 이 따라오는가(메모된 스테이지가 낡는 문제).
          document.documentElement.lang = "en";
          await renderMermaid(clean, themeId);
          const st2 = document.querySelector<HTMLElement>('div[style*="-99999px"]');
          if (st2 && st2.lang !== "en") {
            fail(
              `[vi] 언어를 en 으로 바꿨는데 측정 스테이지 lang="${st2.lang}" 그대로다. ` +
                `measureStage() 의 메모 조기반환이 lang 을 갱신하지 않는다(lib/mermaid.ts).`,
            );
          }
          document.documentElement.lang = "ko";
          first = false;
        }

        const fo = reports.reduce((a, r) => a + r.foCount, 0);
        const over = Math.max(...reports.map((r) => r.maxOverflowPx));
        lines.push(
          `  ${cfgKey.padEnd(20)} ${String(wraps.length).padStart(2)} 다이어그램 · ` +
            `foreignObject ${String(fo).padStart(3)} · 최대 라벨 초과 ${round(over)}px`,
        );
        if (cfgKey === "light/fit/z1") {
          for (const r of reports) {
            lines.push(
              `    #${String(r.n).padStart(2)} ${r.role.padEnd(16)} ` +
                `fo ${String(r.foCount).padStart(2)} · 라벨 ${String(r.labels).padStart(2)} · ` +
                `최대 초과 ${String(round(r.maxOverflowPx)).padStart(7)}px  ${r.title}`,
            );
          }
        }
      }
    }
  }

  // (ix) 동시 렌더 — 미리보기 패널 둘(v0.7 리딩 분할)·프레젠테이션 오버레이·내보내기가 겹칠 때.
  //
  // renderMermaid 는 모듈 전역 자원 둘을 만진다: 공유 측정 스테이지(끝에서 innerHTML 을 비운다)와
  // mermaid.initialize(라이브러리 전역 설정). 락이 없으면 await 지점마다 교차해 한쪽이 재는 동안
  // 다른 쪽이 스테이지를 비우고, 나중 initialize 가 앞선 렌더의 테마까지 덮는다.
  // 위 루프는 전부 순차라 이 경로를 절대 밟지 않는다 — 그래서 한 번 따로 겹쳐 본다.
  {
    applyTheme("light");
    const serial = await renderMermaid(clean, "light");
    // 같은 입력·같은 테마를 겹쳐 돌린 결과는 혼자 돌린 결과와 **바이트까지 같아야 한다**
    // (mermaid 인스턴스 id만 매 호출 증가하므로 그것만 정규화한다). 측정이 어긋나면 라벨 좌표·
    // 도형 폭이 소수점 단위로 흔들려 바로 드러난다 — 개수 세기보다 훨씬 촘촘한 그물이다.
    const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
    const svgSerial = count(serial, /<svg/g);
    const errSerial = count(serial, /class="mermaid-error"/g);

    const [ca, cb] = await Promise.all([
      renderMermaid(clean, "light"),
      renderMermaid(clean, "dark"),
    ]);

    // (ix-a) 겹쳐 돌려도 다이어그램 수·실패 수가 혼자 돌릴 때와 같아야 한다.
    //   (바이트 비교는 못 쓴다 — mindmap 등 곡선 제어점이 순차 실행에서도 매번 미세하게 다르다.)
    for (const [tag, out] of [
      ["light", ca],
      ["dark", cb],
    ] as const) {
      const svgs = count(out, /<svg/g);
      if (svgs !== svgSerial) {
        fail(
          `[ix-a] 동시 렌더(${tag}): <svg> ${svgs}개(순차 실행은 ${svgSerial}개). 겹친 호출이 서로의 ` +
            `측정 스테이지를 비우고 있다 — lib/mermaid.ts 의 mermaidLock 을 확인할 것.`,
        );
      }
      const errs = count(out, /class="mermaid-error"/g);
      if (errs !== errSerial) {
        fail(
          `[ix-a] 동시 렌더(${tag}): .mermaid-error 가 ${errs}개다(순차 실행은 ${errSerial}개). ` +
            `겹친 호출이 서로의 렌더를 실패시키고 있다.`,
        );
      }
    }

    // (ix-b) **전역 설정 오염**이 이 경로의 진짜 실패 모드다. mermaid.initialize() 는 라이브러리
    //   전역이라, 겹친 호출 B가 initialize(dark)를 하는 순간 아직 진행 중인 A의 **남은**
    //   다이어그램들이 dark 로 그려진다(앞쪽 몇 개만 light — 그래서 전체 비교로는 안 잡힌다).
    //   테마가 정한 노드 채움색(--surface)을 표식으로 쓴다: light 결과에 dark 색이 한 톨도
    //   섞이면 안 되고, 그 반대도 마찬가지다.
    const surface = (id: string) => themes[id].tokens["--surface"].toLowerCase();
    for (const [tag, out, own, foreign] of [
      ["light", ca, surface("light"), surface("dark")],
      ["dark", cb, surface("dark"), surface("light")],
    ] as const) {
      const lower = out.toLowerCase();
      const bad = count(lower, new RegExp(foreign, "g"));
      if (bad > 0) {
        fail(
          `[ix-b] 동시 렌더(${tag}) 결과에 다른 테마의 노드 색 ${foreign} 이 ${bad}곳 섞였다 ` +
            `(자기 색 ${own}). mermaid.initialize() 가 경합해 렌더 도중 테마가 갈렸다 — mermaidLock 확인.`,
        );
      }
      if (count(lower, new RegExp(own, "g")) === 0) {
        fail(`[ix-b] 동시 렌더(${tag}) 결과에 자기 테마 색 ${own} 이 없다(표식 셀렉터가 낡았다).`);
      }
    }

    // 겹쳐 렌더한 결과물도 실제 미리보기 문맥에서 라벨이 도형 안에 있어야 한다(핵심 실패 모드).
    const font: FontOpts = { readStack: readStack("default"), readerPx: BASE_READER_PX };
    const doc = await mount(
      iframe,
      buildDoc(ca, "light", font, {
        extraCss: "img{cursor:zoom-in}.md{max-width:860px;margin-left:auto;margin-right:auto}",
        diagramWidth: "fit",
      }),
    );
    await doc.fonts?.ready;
    const wraps = Array.from(doc.querySelectorAll(".mermaid-rendered"));
    if (wraps.length === 0) fail("[ix] 동시 렌더 결과에 렌더된 다이어그램이 하나도 없다.");
    const reports = wraps.map((w, i) => inspectDiagram(w, i + 1, "concurrent"));
    const labels = reports.reduce((a, r) => a + r.labels, 0);
    totalLabels += labels;
    lines.push(
      `  ${"concurrent".padEnd(20)} ${String(wraps.length).padStart(2)} 다이어그램 · ` +
        `foreignObject ${String(reports.reduce((a, r) => a + r.foCount, 0)).padStart(3)} · ` +
        `최대 라벨 초과 ${round(Math.max(...reports.map((r) => r.maxOverflowPx)))}px`,
    );
  }

  // (v) dominant-baseline 회귀 가드 + 공허 통과 방지 바닥값.
  if (totalDomBaseline < MIN_DOMINANT_BASELINE) {
    fail(
      `[v] dominant-baseline 을 가진 요소가 ${totalDomBaseline}개뿐이다(최소 ${MIN_DOMINANT_BASELINE}). ` +
        `sanitize.ts ADD_ATTR 에서 빠졌을 수 있다 — 축·ER·노트 글자가 baseline 으로 내려앉는다(v0.6.7 회귀).`,
    );
  }
  if (totalLabels < MIN_LABELS_MEASURED) {
    fail(
      `[ii-b] 측정한 라벨이 ${totalLabels}개뿐이다(최소 ${MIN_LABELS_MEASURED}). ` +
        `셀렉터가 깨져 검사가 공허하게 통과하고 있다.`,
    );
  }

  iframe.remove();
  return {
    ok: failures.length === 0,
    failures,
    lines,
    stats: { labels: totalLabels, dominantBaseline: totalDomBaseline, ctxProps: DIAGRAM_CTX_CSS.split(";").length },
    srcdoc: shot,
  };
}

void run()
  .then((r) => fetch("/probe-result", { method: "POST", body: JSON.stringify(r) }))
  .catch((e: unknown) =>
    fetch("/probe-result", {
      method: "POST",
      body: JSON.stringify({
        ok: false,
        failures: [`[harness] 프로브 자체가 던졌다: ${e instanceof Error ? e.stack : String(e)}`],
        lines: [],
        stats: {},
      }),
    }),
  );
