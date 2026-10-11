// 성능 프로브 — 브라우저 쪽 하네스.
//
// 진짜 앱 셸을 마운트하고(main.tsx), 미리보기는 `&worker` 로 **진짜 경로**(워커 렌더 → 정화 →
// mermaid → iframe srcdoc)를 태운다 — 데모 경로는 메인 스레드 즉시 렌더라 비용 모양이 다르다.
// 드라이버(tools/perf-probe.mjs)가 **프로덕션 빌드**로 띄운다 — 개발 모드 React 는 몇 배 느려서
// 타자 지연 같은 숫자가 의미를 잃는다.
//
// 여기서는 재기만 하고 판정은 드라이버가 예산 파일(tools/perf-budget.json)로 한다.
// 숫자의 뜻과 근거: docs/design/performance.md
import { EditorView } from "@codemirror/view";
import { useAppStore } from "../store";
import { bigDoc } from "./perfFixture";
import { createMarkdown, extractToc, renderWithToc } from "../lib/markdown";
import { sanitizeHtml } from "../lib/sanitize";

interface Metrics {
  [k: string]: number;
}
interface ProbeResult {
  ok: boolean;
  failures: string[];
  lines: string[];
  metrics: Metrics;
}

const failures: string[] = [];
const lines: string[] = [];
const metrics: Metrics = {};
const fail = (s: string) => failures.push(s);
const r1 = (n: number) => Math.round(n * 10) / 10;
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
/** 다음 프레임이 실제로 그려진 뒤 — rAF 콜백은 그리기 *전*이라 그 뒤 태스크 하나를 더 기다린다. */
const painted = () =>
  new Promise<void>((r) =>
    requestAnimationFrame(() => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => r();
      ch.port2.postMessage(0);
    }),
  );
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const st = useAppStore.getState;

function previewDoc(): Document | null {
  return document.querySelector<HTMLIFrameElement>(".pane-a .preview-frame")?.contentDocument ?? null;
}
function editorView(): EditorView | null {
  const dom = document.querySelector<HTMLElement>(".cm-editor");
  return dom ? EditorView.findFromDOM(dom) : null;
}

/** 조건이 참이 될 때까지 프레임마다 보고, 걸린 시간(ms)을 돌려준다. 시간 초과면 null. */
async function until(pred: () => boolean, what: string, timeoutMs = 30_000): Promise<number | null> {
  const t0 = performance.now();
  while (!pred()) {
    if (performance.now() - t0 > timeoutMs) {
      fail(`[timeout] ${what} 을(를) ${timeoutMs / 1000}초 안에 못 봤다.`);
      return null;
    }
    await frame();
  }
  return performance.now() - t0;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];

/** 문서를 열고 편집기·미리보기가 각각 준비될 때까지. `marker` 는 미리보기 끝까지 그려졌는지의 표식. */
async function openAndWait(path: string, text: string, marker: (d: Document) => boolean) {
  const t0 = performance.now();
  st().openFile(path, text);
  const ed = await until(() => {
    const v = editorView();
    return !!v && st().activePath === path && v.state.doc.length === text.length;
  }, `${path} 편집기`);
  const editorMs = ed == null ? NaN : performance.now() - t0;
  await until(() => {
    const d = previewDoc();
    return !!d && marker(d);
  }, `${path} 미리보기`, 60_000);
  return { editorMs, previewMs: performance.now() - t0 };
}

async function run(): Promise<ProbeResult> {
  if ((await until(() => !!document.querySelector(".split"), "앱 마운트")) == null)
    return { ok: false, failures, lines, metrics };
  st().setReaderMode(false);
  // 디바운스 0 — 미리보기 시간이 곧 렌더 경로 비용이다(설정값 200/500/1000 은 그 위에 더해질 뿐).
  st().setPreviewDelay(0);
  await sleep(300); // 데모 시드 문서의 첫 렌더가 가라앉게

  // ① 작은 문서(데모 README) — 기준점. 다른 문서를 갔다 오게 해 캐시 아닌 재렌더를 본다.
  {
    const text = "# Small\n\n" + "Short agent note with `code` and a [link](https://example.com).\n\n".repeat(20) + "## SMALL-END\n";
    const { previewMs } = await openAndWait("C:/perf/small.md", text, (d) => !!d.getElementById("small-end") || !!Array.from(d.querySelectorAll("h2")).find((h) => h.textContent === "SMALL-END"));
    metrics.small_preview_ms = r1(previewMs);
  }

  // ② 보통 큰 문서 100KB — 에이전트 보고서로 흔한 크기의 위쪽. 열기 + 재렌더.
  {
    const mid = bigDoc({ chars: 100_000, seed: 7, end: "END-MID" });
    const { previewMs } = await openAndWait("C:/perf/mid.md", mid, (d) =>
      Array.from(d.querySelectorAll("h2")).some((h) => h.textContent === "END-MID"),
    );
    metrics.mid_preview_ms = r1(previewMs);
    const view = editorView()!;
    const t0 = performance.now();
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\n\nMID-MARK\n" }, userEvent: "input.type" });
    await until(() => !!previewDoc()?.body?.textContent?.includes("MID-MARK"), "100KB 재렌더 표식");
    metrics.mid_rerender_ms = r1(performance.now() - t0);
  }

  // ③ 큰 문서 1MB — 열기(편집기 · 미리보기 끝까지).
  const big = bigDoc({ chars: 1_000_000, end: "END-BIG" });
  const bigLines = big.split("\n").length;
  {
    const { editorMs, previewMs } = await openAndWait("C:/perf/big.md", big, (d) =>
      Array.from(d.querySelectorAll("h2")).some((h) => h.textContent === "END-BIG"),
    );
    metrics.big_editor_ms = r1(editorMs);
    metrics.big_preview_ms = r1(previewMs);
    lines.push(`  big doc       ${(big.length / 1e6).toFixed(2)}M chars · ${bigLines} lines`);
  }

  // ④ 큰 문서에서 타자 — 키 하나 → 그 프레임이 그려질 때까지. 실제 설정(디바운스 500)으로 두어
  // 타자 중에는 미리보기가 안 돈다(사람이 겪는 그대로). 가운데 줄에 친다(끝보다 불리하다).
  {
    st().setPreviewDelay(500);
    const view = editorView()!;
    const mid = view.state.doc.line(Math.floor(view.state.doc.lines / 2));
    view.dispatch({ selection: { anchor: mid.to }, scrollIntoView: true });
    await painted();
    const xs: number[] = [];
    for (let i = 0; i < 40; i++) {
      const at = view.state.selection.main.head;
      const t0 = performance.now();
      view.dispatch({ changes: { from: at, insert: "x" }, selection: { anchor: at + 1 }, userEvent: "input.type" });
      await painted();
      xs.push(performance.now() - t0);
      await sleep(60); // 빠른 타자(초당 10타 안팎)
    }
    metrics.type_median_ms = r1(median(xs));
    metrics.type_p95_ms = r1(p95(xs));
    if (st().tabs.find((t) => t.path === "C:/perf/big.md")?.content.length !== big.length + 40)
      fail("[type] 친 글자가 store 에 다 반영되지 않았다.");
  }

  // ⑤ 큰 문서 재렌더 — 편집 하나가 미리보기에 닿기까지(디바운스 0).
  {
    st().setPreviewDelay(0);
    await sleep(800); // ③의 마지막 디바운스 렌더가 끝나게
    const view = editorView()!;
    const end = view.state.doc.length;
    const t0 = performance.now();
    view.dispatch({ changes: { from: end, insert: "\n\nRERENDER-MARK\n" }, userEvent: "input.type" });
    await until(() => !!previewDoc()?.body?.textContent?.includes("RERENDER-MARK"), "재렌더 표식", 60_000);
    metrics.big_rerender_ms = r1(performance.now() - t0);
  }

  // ⑥ 다이어그램 갤러리(21종 + 고의 오류 1) — 열어서 전부 그려질 때까지. mermaid 청크 첫 적재 포함.
  {
    // 디스크 원본은 CRLF 일 수 있다 — 앱의 readFile 처럼 LF 로 맞춘다(안 그러면 편집기 길이가 안 맞는다).
    const gallery = (await (await fetch("/probe-fixture?name=mermaid-gallery")).text()).replace(/\r\n?/g, "\n");
    const fences = gallery.split("\n").filter((l) => l.trim() === "```mermaid").length;
    let got = 0;
    const { previewMs } = await openAndWait("C:/perf/mermaid-gallery.md", gallery, (d) => {
      got = d.querySelectorAll(".mermaid-rendered, .mermaid-error").length;
      return got >= fences;
    });
    metrics.gallery_ms = r1(previewMs);
    lines.push(`  gallery       ${got}/${fences} diagrams`);
  }

  // ⑦ 1MB 렌더 경로를 단계별로(정보용 — 예산 없음). 워커가 하는 일을 메인 스레드에서 같은 함수로
  // 다시 돌려 어디에 시간이 드는지 가른다. 나머지(= big_rerender_ms − 합)는 iframe 파싱·배치다.
  {
    const md = createMarkdown();
    const time = <T>(f: () => T): [T, number] => {
      const t0 = performance.now();
      const v = f();
      return [v, r1(performance.now() - t0)];
    };
    const [, parse] = time(() => md.parse(big, {}));
    const [html, render] = time(() => md.render(big));
    const [, toc] = time(() => extractToc(md, big));
    const [, worker] = time(() => renderWithToc(md, big)); // 워커가 실제로 하는 일(파싱 한 번)
    const [, sanitize] = time(() => sanitizeHtml(html));
    metrics.big_parse_info = parse;
    metrics.big_render_info = render;
    metrics.big_toc_info = toc;
    metrics.big_worker_info = worker;
    metrics.big_sanitize_info = sanitize;
  }

  // ⑧ JS 힙(정보용 — 예산 없음). Chromium 전용 비표준 API.
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (mem) metrics.heap_mb_info = r1(mem.usedJSHeapSize / 1_048_576);

  return { ok: failures.length === 0, failures, lines, metrics };
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
        metrics: {},
      }),
    }),
  );
