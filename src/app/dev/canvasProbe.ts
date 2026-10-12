// 캔버스 프로브 — 브라우저 쪽 하네스(tools/canvas-probe.mjs 가 띄운다).
//
// 사람처럼 포인터를 몬다 — 하네스가 문서 객체를 직접 고치면 히트 테스트·층 순서·변 고정이 검사에서 빠진다.
// 판정은 탭 내용(= 저장될 JSON)으로 한다: 화면이 맞아도 파일이 틀리면 의미가 없다.
import { useAppStore } from "../store";
import { setCardSource } from "../lib/canvas/cards";
import { parseCanvas } from "../lib/canvas/format";

interface ProbeResult {
  ok: boolean;
  failures: string[];
  lines: string[];
}

const failures: string[] = [];
const lines: string[] = [];
const fail = (s: string) => failures.push(s);
const settle = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const q = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const st = useAppStore.getState;

const DIR = "C:\\docs\\";
const CANVAS = DIR + "map.canvas";

async function waitFor(pred: () => boolean, what: string, tries = 300): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (pred()) return true;
    await settle();
  }
  fail(`[setup] ${what} 을(를) 기다리다 포기했다.`);
  return false;
}

const fixture = async (name: string) => (await (await fetch(`/probe-fixture?name=${name}`)).text()).replace(/\r\n?/g, "\n");
const nodeEl = (id: string) => q<HTMLElement>(`.cv-node[data-id="${id}"]`);
const center = (el: Element) => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2] as const;
};
const saved = () => parseCanvas(st().tabs.find((t) => t.path === CANVAS)!.content);

function pointer(type: string, x: number, y: number, target?: Element | null, extra: PointerEventInit = {}) {
  const el = target ?? document.elementFromPoint(x, y) ?? document.body;
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true, ...extra }));
}

/** (x0,y0) 에서 눌러 (x1,y1) 로 끌어 놓기 — 눌림은 그 자리 요소에서, 나머지는 뷰포트에서(포인터 캡처 흉내). */
async function dragFrom(x0: number, y0: number, x1: number, y1: number, steps = 6) {
  const vp = q(".canvas-view")!;
  pointer("pointerdown", x0, y0);
  for (let i = 1; i <= steps; i++) {
    pointer("pointermove", x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, vp);
    await settle();
  }
  pointer("pointerup", x1, y1, vp);
  await settle();
  await settle();
}

async function openCanvas() {
  const [map, report, rtl] = await Promise.all([fixture("map.canvas"), fixture("annot-review.md"), fixture("rtl-persian.md")]);
  setCardSource((p) => st().tabs.find((t) => t.path.toLowerCase() === p.toLowerCase())?.content);
  st().setReaderMode(false);
  st().openFile(DIR + "annot-review.md", report);
  st().openFile(DIR + "rtl-persian.md", rtl);
  st().openFile(CANVAS, map);
  return waitFor(() => !!nodeEl("f-report") && !!q(".cv-node[data-id='f-report'] .cv-title")?.textContent?.includes("세션"), "캔버스 카드가 그려지는 것");
}

async function run(): Promise<ProbeResult> {
  await waitFor(() => !!q(".split") || !!q(".app"), "앱 마운트");
  if (!(await openCanvas())) return { ok: false, failures, lines };
  await sleep(200);

  // ── 그려졌나: 형식이 맞는 노드 6개(그룹 1 · 파일 3 · 글 1 · 링크 1), 각 카드가 그 자리에서 맞는다 ──
  const ids = ["g-area", "f-report", "f-rtl", "t-note", "f-gone", "l-spec"];
  for (const id of ids) {
    const el = nodeEl(id);
    if (!el) {
      fail(`[render] ${id} 가 없다.`);
      continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) fail(`[render] ${id} 크기가 ${r.width}x${r.height} 다.`);
  }
  lines.push(`  ${"[render]".padEnd(22)} 노드 ${document.querySelectorAll(".cv-node").length} · 선 ${document.querySelectorAll("[data-edge-id] .cv-e").length}`);

  // ── 파일 없음 · 카드 내용(색인 → 여기서는 탭) ──
  if (!nodeEl("f-gone")?.classList.contains("missing")) fail("[missing] 없는 파일 카드가 '파일 없음' 이 아니다.");
  const outline = nodeEl("f-report")?.querySelectorAll(".cv-outline li").length ?? 0;
  if (outline < 2) fail(`[card] 보고서 카드 아웃라인이 ${outline}줄이다.`);

  // ── text 노드 정화: 원시 HTML 은 글자로, 마크다운은 서식으로 ──
  {
    const body = q(".cv-node[data-id='t-note'] .cv-textbody");
    if (!body || body.querySelector("img, script")) fail("[xss] text 노드에서 img/script 요소가 만들어졌다.");
    if (!body?.querySelector("strong")) fail("[xss] text 노드의 **굵게**가 서식이 안 됐다.");
    if (!body?.textContent?.includes("<script>")) fail("[xss] 원시 HTML 이 글자로 보이지 않는다.");
    lines.push(`  ${"[text 정화]".padEnd(22)} img/script 0 · <strong> 있음 · 원시 HTML 은 글자`);
  }

  // ── 층 순서: 그룹 안의 선을 누를 수 있다(선이 그룹 위) ──
  {
    const path = q<SVGPathElement>("[data-edge-id='e-1'] .cv-hit")!;
    const len = path.getTotalLength();
    const mid = path.getPointAtLength(len / 2);
    const m = path.getScreenCTM()!;
    const x = mid.x * m.a + m.e;
    const y = mid.y * m.d + m.f;
    const top = document.elementFromPoint(x, y);
    if (!top?.closest("[data-edge-id='e-1']") && !top?.closest(".cv-elabel")) fail(`[층] 그룹 안 선 가운데를 눌렀는데 ${top?.className} 이(가) 잡힌다.`);
    pointer("pointerdown", x, y);
    pointer("pointerup", x, y, q(".canvas-view"));
    await settle();
    // 선을 고르면 양 끝 손잡이 — 카드 연결점과 같은 자리지만 **손잡이가 위**
    const knob = q<SVGCircleElement>(".cv-knob[data-knob='to']");
    if (!knob) fail("[층] 선을 골랐는데 끝 손잡이가 없다.");
    else {
      const [kx, ky] = center(knob);
      const hit = document.elementFromPoint(kx, ky);
      if (!hit?.classList.contains("cv-knob")) fail(`[층] 선 끝 손잡이 자리에서 ${hit?.className} 이(가) 잡힌다 — 새 선이 생긴다(ADR 5절).`);
      else lines.push(`  ${"[층]".padEnd(22)} 그룹 안 선 누름 · 손잡이가 카드 연결점 위(circle.cv-knob)`);
      // 끝 손잡이를 끌어 다른 카드(글 노드)로 — 선 수 그대로, 반대쪽(출발) 변 고정
      const before = saved().edges.length;
      const t = nodeEl("t-note")!.getBoundingClientRect();
      await dragFrom(kx, ky, t.left + t.width / 2, t.top + 4);
      const e1 = saved().edges.find((e) => e.id === "e-1")!;
      if (saved().edges.length !== before) fail(`[relink] 선 끝을 옮겼는데 선 수가 ${before} → ${saved().edges.length}.`);
      if (e1.toNode !== "t-note" || e1.toSide !== "top" || e1.fromSide !== "right") fail(`[relink] e-1 이 ${JSON.stringify(e1)} 다(to=t-note/top, from=right 고정 기대).`);
      else lines.push(`  ${"[relink]".padEnd(22)} e-1 → t-note(top) · 출발 변 right 고정 · 선 수 그대로`);
    }
  }

  // ── 변 없는 선(e-2)을 옮기면 반대쪽 변이 고정 저장된다 ──
  {
    const path = q<SVGPathElement>("[data-edge-id='e-2'] .cv-hit")!;
    const m = path.getScreenCTM()!;
    const mid = path.getPointAtLength(path.getTotalLength() / 2);
    const x = mid.x * m.a + m.e;
    const y = mid.y * m.d + m.f;
    pointer("pointerdown", x, y);
    pointer("pointerup", x, y, q(".canvas-view"));
    await settle();
    const knob = q<SVGCircleElement>(".cv-knob[data-knob='to']");
    if (knob) {
      const [kx, ky] = center(knob);
      const g = nodeEl("f-gone")!.getBoundingClientRect();
      await dragFrom(kx, ky, g.left + 4, g.top + g.height / 2);
      const e2 = saved().edges.find((e) => e.id === "e-2")!;
      if (e2.toNode !== "f-gone" || e2.toSide !== "left" || !e2.fromSide) fail(`[relink-auto] e-2 가 ${JSON.stringify(e2)} 다(from 변이 고정돼야 한다).`);
      if (e2["x-future"] !== "keep me") fail("[보존] 선을 고쳤더니 모르는 필드(x-future)가 사라졌다.");
    } else fail("[relink-auto] e-2 손잡이가 없다.");
  }

  // ── 연결점에서 끌어 새 선 ──
  {
    const before = saved().edges.length;
    const a = nodeEl("f-rtl")!;
    a.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    const h = a.querySelector<HTMLElement>(".cv-h.bottom")!;
    const [hx, hy] = center(h);
    const b = nodeEl("l-spec")!.getBoundingClientRect();
    await dragFrom(hx, hy, b.left + 3, b.top + b.height / 2);
    const added = saved().edges.slice(before);
    if (added.length !== 1 || added[0].fromNode !== "f-rtl" || added[0].fromSide !== "bottom" || added[0].toNode !== "l-spec" || added[0].toSide !== "left") {
      fail(`[connect] 새 선이 ${JSON.stringify(added)} 다.`);
    } else lines.push(`  ${"[connect]".padEnd(22)} f-rtl(bottom) → l-spec(left) · 양 끝 변 저장`);
  }

  // ── 옮기기: 10 단위 맞춤 · 모르는 필드 보존 ──
  {
    const el = nodeEl("f-report")!;
    const r = el.getBoundingClientRect();
    const k = Number(getComputedStyle(q(".canvas-view")!).getPropertyValue("--k")) || 1;
    await dragFrom(r.left + 30, r.top + 40, r.left + 30 + 37 * k, r.top + 40 + 23 * k);
    const n = saved().nodes.find((x) => x.id === "f-report")!;
    if (n.x % 10 || n.y % 10 || n.x === 0) fail(`[move] f-report 가 (${n.x},${n.y}) — 10 단위로 옮겨지지 않았다.`);
    const doc = saved();
    if (!(n as { styleAttributes?: unknown }).styleAttributes || (doc as { metadata?: unknown }).metadata === undefined) fail("[보존] 노드를 옮겼더니 styleAttributes/metadata 가 사라졌다.");
    else lines.push(`  ${"[move·보존]".padEnd(22)} (${n.x},${n.y}) 10 단위 · styleAttributes·metadata·x-future 그대로`);
  }

  // ── 확대 단계: 72% 밑이면 제목만(크게) ──
  {
    const vp = q(".canvas-view")!;
    const [cx, cy] = center(vp);
    for (let i = 0; i < 6; i++) vp.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 120, clientX: cx, clientY: cy }));
    await settle();
    const world = q(".canvas-world")!;
    const far = q<HTMLElement>(".cv-node[data-id='f-report'] .cv-far")!;
    const outlineEl = q<HTMLElement>(".cv-node[data-id='f-report'] .cv-lod1")!;
    if (!world.classList.contains("lod0") || getComputedStyle(far).display === "none" || getComputedStyle(outlineEl).display !== "none") fail("[LOD] 멀리서 제목만 보이지 않는다.");
    const farPx = parseFloat(getComputedStyle(far).fontSize);
    for (let i = 0; i < 6; i++) vp.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -120, clientX: cx, clientY: cy }));
    await settle();
    if (!world.classList.contains("lod1") || getComputedStyle(outlineEl).display === "none") fail("[LOD] 다시 가까이 왔는데 아웃라인이 안 보인다.");
    lines.push(`  ${"[LOD]".padEnd(22)} 멀리 → 제목만(글자 ${farPx.toFixed(0)}px · 확대율에 반비례) · 가까이 → 아웃라인`);
  }

  // ── 빈 곳 더블클릭 → 새 글 → 적고 떠나면 저장, 빈 글은 버린다 ──
  {
    const vp = q(".canvas-view")!.getBoundingClientRect();
    const before = saved().nodes.length;
    const x = vp.left + vp.width - 120;
    const y = vp.top + vp.height - 90;
    document.elementFromPoint(x, y)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
    await settle();
    const ta = q<HTMLTextAreaElement>(".cv-textedit");
    if (!ta) fail("[text] 빈 곳 더블클릭에 글 상자가 안 열렸다.");
    else {
      ta.value = "# 새 메모\n지도에 적은 글";
      ta.dispatchEvent(new FocusEvent("blur"));
      ta.blur();
      await settle();
      const nodes = saved().nodes;
      const nn = nodes.find((n) => n.type === "text" && n.text === "# 새 메모\n지도에 적은 글");
      if (nodes.length !== before + 1 || !nn) fail(`[text] 새 글 노드가 저장되지 않았다(${before} → ${nodes.length}).`);
      else lines.push(`  ${"[text]".padEnd(22)} 빈 곳 더블클릭 → 새 글 저장`);
    }
  }

  // ── 지우기: 노드를 지우면 붙은 선도 ──
  {
    const r = nodeEl("l-spec")!.getBoundingClientRect();
    pointer("pointerdown", r.left + 20, r.top + 20);
    pointer("pointerup", r.left + 20, r.top + 20, q(".canvas-view"));
    await settle();
    q<HTMLElement>(".canvas-view")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    await settle();
    const doc = saved();
    if (doc.nodes.some((n) => n.id === "l-spec") || doc.edges.some((e) => e.toNode === "l-spec" || e.fromNode === "l-spec")) fail("[delete] 노드나 붙은 선이 남았다.");
  }

  // ── 더블클릭으로 문서 열기 ──
  {
    const r = nodeEl("f-report")!.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height - 20;
    document.elementFromPoint(x, y)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
    const opened = await waitFor(() => st().activePath === DIR + "annot-review.md", "더블클릭한 문서가 탭으로 열리는 것", 120);
    if (opened) lines.push(`  ${"[open]".padEnd(22)} file 카드 더블클릭 → 그 문서 탭`);
    st().openFile(CANVAS, st().tabs.find((t) => t.path === CANVAS)!.content);
  }

  return { ok: failures.length === 0, failures, lines };
}

/** 촬영 모드 — 열어 두고 카드 자리를 드라이버에 알린다(드라이버가 PNG 픽셀로 칠해졌는지 본다). */
async function shot() {
  await waitFor(() => !!q(".app"), "앱 마운트");
  await openCanvas();
  await sleep(400);
  // 카드 안쪽 구석(글자 없는 자리)의 **기대 색 = 카드 배경**. 안 그려졌으면 그 자리는 캔버스 바탕·그룹 색이다.
  // getComputedStyle 은 color-mix 결과를 `color(srgb 0~1 …)` 로 준다 — 0~255 로 맞춘다.
  const rgb = (s: string) => {
    const v = (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    return s.startsWith("color(") ? v.map((x) => Math.round(x * 255)) : v;
  };
  const cards = ["f-report", "f-rtl", "t-note", "f-gone", "l-spec"].map((id) => {
    const card = nodeEl(id)!.querySelector<HTMLElement>(".cv-card")!;
    const r = card.getBoundingClientRect();
    return { id, x: r.right - 14, y: r.bottom - 14, want: rgb(getComputedStyle(card).backgroundColor), alpha: Number(getComputedStyle(card).opacity) };
  });
  const canvasBg = rgb(getComputedStyle(q(".canvas-view")!).backgroundColor);
  // 바탕: 뷰포트 오른쪽 위 구석 근처(노드 없는 곳)
  // 드라이버가 CDP 로 읽어 간다(가상 시간 촬영은 fetch 회신이 안 와서 CDP 로 바꿨다).
  (window as unknown as { __canvasGeom: unknown }).__canvasGeom = { cards, canvasBg };
}

if (location.search.includes("shot")) void shot();
else
  void run()
    .then((r) => fetch("/probe-result", { method: "POST", body: JSON.stringify(r) }))
    .catch((e: unknown) =>
      fetch("/probe-result", {
        method: "POST",
        body: JSON.stringify({ ok: false, failures: [...failures, `[harness] 프로브 자체가 던졌다: ${e instanceof Error ? e.stack : String(e)}`], lines }),
      }),
    );
