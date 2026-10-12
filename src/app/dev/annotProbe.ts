// 표시 펜 프로브 — 브라우저 쪽 하네스.
//
// 왜 있나: 표시가 맞는지는 **기하**로 판정한다 — 칠한 SVG 그룹의 상자가 그 글자의 Range 상자와 겹치는가.
// 저장된 것이 좌표가 아니라 글자 범위라서, 폭·리딩 폭·줌·테마·글 방향을 바꿔도, 에이전트가 문서를 고쳐도
// 따라가야 한다(ADR 0003). 순수 로직(diff·글자 지도·도형)은 vitest 가 지키고, 여기서는 진짜 앱 셸 ·
// 진짜 렌더러 · 진짜 iframe 에서 그 셋이 맞물리는지를 본다. 사람이 하듯 글자를 골라(Selection + mouseup)
// 펜 트레이의 버튼을 누른다 — 하네스가 저장소를 직접 부르면 트레이·선택 변환이 검사에서 빠진다.
//
// 실행: `cd src; npm run probe:annot`
import { useAppStore } from "../store";
import { themes } from "../themes";
import { memoryBackend, setAnnotBackend, annotBackend } from "../lib/annot/api";
import { markPalette } from "../lib/annot/palette";
import { domRange } from "../lib/annot/dom";
import { annotPerf, lastSummary } from "../shell/AnnotLayer";
import { buildExportHtml } from "../features/export/html";

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

const PATH = "C:/docs/annot-review.md";

async function waitFor(pred: () => boolean, what: string, tries = 300): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (pred()) return true;
    await settle();
  }
  fail(`[setup] ${what} 을(를) 기다리다 포기했다.`);
  return false;
}

const frame = () => q<HTMLIFrameElement>(".pane-a .preview-frame");
const doc = () => frame()?.contentDocument ?? null;
const marks = () => Array.from(doc()?.querySelectorAll<SVGGElement>("svg.annot-layer g.annot-m") ?? []);
const markIds = () => new Set(marks().map((g) => g.getAttribute("data-id")));

/** 블록(sel) 중 needle 을 품은 것에서 needle 의 Range. nth = 같은 블록 안 몇 번째. */
function textRange(sel: string, needle: string): Range | null {
  const d = doc();
  if (!d) return null;
  for (const el of Array.from(d.querySelectorAll<HTMLElement>(`.md ${sel}`))) {
    const text = el.textContent ?? "";
    const i = text.indexOf(needle);
    if (i >= 0) return domRange(el, i, i + needle.length);
  }
  return null;
}

function union(rects: DOMRect[] | DOMRectList): { l: number; t: number; r: number; b: number } | null {
  let out: { l: number; t: number; r: number; b: number } | null = null;
  for (const c of Array.from(rects)) {
    if (c.width < 0.5) continue;
    out = out ? { l: Math.min(out.l, c.left), t: Math.min(out.t, c.top), r: Math.max(out.r, c.right), b: Math.max(out.b, c.bottom) } : { l: c.left, t: c.top, r: c.right, b: c.bottom };
  }
  return out;
}

/** 사람처럼 고른다: 선택을 걸고 mouseup. 트레이가 뜨면 true. */
async function select(sel: string, needle: string): Promise<boolean> {
  const d = doc();
  const r = textRange(sel, needle);
  if (!d || !r) {
    fail(`[select] "${needle}" 을(를) ${sel} 에서 못 찾았다.`);
    return false;
  }
  const s = d.getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
  const b = r.getBoundingClientRect();
  d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: b.right, clientY: b.bottom }));
  await settle();
  return !!q(".annot-tray");
}

/** 트레이의 n 번째 펜 버튼(범위: highlight·underline·wavy·strike·circle / 점: star·question·exclaim·check·bar). */
async function pickPen(n: number): Promise<string | null> {
  const before = markIds();
  const pens = Array.from(document.querySelectorAll<HTMLButtonElement>(".annot-tray .annot-pen"));
  if (!pens[n]) {
    fail(`[tray] 펜 ${n} 번 버튼이 없다(${pens.length}개).`);
    return null;
  }
  pens[n].click();
  const ok = await waitFor(() => marks().some((g) => !before.has(g.getAttribute("data-id"))), `펜 ${n} 표시가 그려지는 것`, 120);
  if (!ok) return null;
  return marks().find((g) => !before.has(g.getAttribute("data-id")))!.getAttribute("data-id");
}

/** React 가 관리하는 입력칸에 값 넣기 — 네이티브 setter + input 이벤트. */
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

interface Target {
  id: string;
  sel: string;
  needle: string;
  style: string;
}
const targets: Target[] = [];

/** 표시 하나가 그 글자를 따라가는가. */
function checkAligned(tag: string, tg: Target) {
  // 메모 번호(①)는 끝에 따로 붙는다 — 글자 정렬은 번호를 빼고 잰다.
  const gs = marks()
    .filter((g) => g.getAttribute("data-id") === tg.id)
    .flatMap((g) => Array.from(g.querySelectorAll("path, text")).filter((c) => !c.closest(".annot-badge")));
  if (!gs.length) {
    fail(`${tag} ${tg.style} "${tg.needle}" — 그려진 표시가 없다.`);
    return;
  }
  const mb = union(gs.map((g) => g.getBoundingClientRect()));
  const r = textRange(tg.sel, tg.needle);
  const tb = r ? union(r.getClientRects()) : null;
  if (!mb || !tb) {
    fail(`${tag} ${tg.style} "${tg.needle}" — 상자를 못 쟀다(mark ${!!mb} text ${!!tb}).`);
    return;
  }
  const point = ["star", "question", "exclaim", "check", "bar"].includes(tg.style);
  if (point) {
    const block = r!.startContainer.parentElement!.closest("[data-line]")!.getBoundingClientRect();
    if (!(mb.r <= block.left + 2)) fail(`${tag} ${tg.style} — 여백 표시가 블록 왼쪽 밖이 아니다(mark.r ${mb.r.toFixed(1)} · block.l ${block.left.toFixed(1)}).`);
    if (!(mb.b >= block.top && mb.t <= block.top + 40)) fail(`${tag} ${tg.style} — 여백 표시가 블록 첫 줄 높이에 없다(mark ${mb.t.toFixed(0)}~${mb.b.toFixed(0)} · block.top ${block.top.toFixed(0)}).`);
    return;
  }
  const slackX = tg.style === "circle" ? 22 : 12;
  const okX = mb.l <= tb.l + 5 && mb.r >= tb.r - 5 && mb.l >= tb.l - slackX && mb.r <= tb.r + slackX;
  const okY = mb.b >= tb.t + 2 && mb.t <= tb.b + 6 && mb.t >= tb.t - 14 && mb.b <= tb.b + 14;
  if (!okX || !okY) {
    fail(
      `${tag} ${tg.style} "${tg.needle}" — 글자와 어긋났다: mark [${mb.l.toFixed(1)},${mb.t.toFixed(1)}~${mb.r.toFixed(1)},${mb.b.toFixed(1)}] · text [${tb.l.toFixed(1)},${tb.t.toFixed(1)}~${tb.r.toFixed(1)},${tb.b.toFixed(1)}]`,
    );
  }
}

function checkAll(tag: string) {
  for (const tg of targets) checkAligned(tag, tg);
  lines.push(`  ${tag.padEnd(22)} 표시 ${targets.length}개 — 글자 위치 확인`);
}

/** 문서를 다시 그리게 하는 변경 뒤 표시가 다시 붙을 때까지. */
async function redrawn(change: () => void, what: string) {
  const before = annotPerf.draws;
  change();
  await waitFor(() => annotPerf.draws > before && marks().length > 0, `${what} 뒤 다시 그리기`, 200);
  await settle();
  await settle();
}

async function run(): Promise<ProbeResult> {
  await waitFor(() => !!q(".split"), "앱 마운트");
  // 앱의 readFile 처럼 줄끝을 LF 로 — git(autocrlf)이 픽스처를 CRLF 로 바꿔 두면 아래 수정(replace)이 조용히 안 먹는다.
  const fixture = (await (await fetch("/probe-fixture")).text()).replace(/\r\n?/g, "\n");
  // 메모리 저장소 — "디스크"는 열린 탭의 내용이다(앱 저장 경로 대신).
  setAnnotBackend(memoryBackend((p) => st().tabs.find((t) => t.path === p)?.content));
  st().setTextDirection("auto");
  st().setTheme("paper");
  st().setReadingWidth("normal");
  st().setAnnotRail(false);
  st().setAnnotTexture(true);
  st().openFile(PATH, fixture);
  st().setReaderMode(true);
  const ready = await waitFor(() => st().activePath === PATH && !!doc()?.querySelector(".md h1"), "픽스처가 미리보기에 뜨는 것");
  if (!ready) return { ok: false, failures, lines };
  await sleep(300);
  await settle();

  // ── 범위 펜 다섯 + 페르시아어 ──
  const add = async (sel: string, needle: string, pen: number, style: string) => {
    if (!(await select(sel, needle))) {
      fail(`[tray] "${needle}" 을(를) 골랐는데 펜 트레이가 안 떴다.`);
      return null;
    }
    const id = await pickPen(pen);
    if (id) targets.push({ id, sel, needle, style });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    doc()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();
    return id;
  };
  const hl = await add("p", "근거가 부족하다", 0, "highlight");
  // 메모 — 방금 단 표시를 눌러 고치기 트레이 → 입력 → Enter
  if (hl) {
    const g = marks().find((m) => m.getAttribute("data-id") === hl)!;
    const b = g.getBoundingClientRect();
    doc()!.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }));
    await settle();
    const input = q<HTMLInputElement>(".annot-tray .annot-memo");
    if (!input) fail("[memo] 표시를 눌렀는데 고치기 트레이가 안 떴다.");
    else {
      typeInto(input, "출처가 어디지?");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await waitFor(() => !q(".annot-tray"), "메모 저장 뒤 트레이 닫힘", 60);
      const saved = (await annotBackend().list(PATH)).annotations.find((a) => a.id === hl);
      if (saved?.note !== "출처가 어디지?") fail(`[memo] 메모가 저장되지 않았다: ${JSON.stringify(saved?.note)}`);
      await waitFor(() => /<text[^>]*>1<\/text>/.test(doc()!.querySelector("svg.annot-over")?.innerHTML ?? ""), "메모 번호 ① 그리기", 60);
    }
  }
  await add("p", "부팅 때마다 색인 전체를", 1, "underline"); // 굵게 안
  await add("p", "성능 문서", 2, "wavy"); // 링크 글
  await add("li", "한 트랜잭션", 3, "strike"); // 인라인 코드
  await add("td", "2.5초", 4, "circle"); // 표 셀
  await add("p", "جهت متن", 0, "highlight"); // RTL 문단

  // 코드 블록 안 — 범위 펜 불가(트레이 안 뜸)
  {
    const noticeBefore = st().notice?.id ?? 0;
    const shown = await select("pre", "atomically");
    if (shown) fail("[code] 코드 블록 안을 골랐는데 펜 트레이가 떴다.");
    if ((st().notice?.id ?? 0) === noticeBefore) fail("[code] 코드 블록 안을 골랐는데 안내가 없다.");
    doc()?.getSelection()?.removeAllRanges();
  }

  // ── 점 표시 — 여백 ＋ ──
  const addPoint = async (sel: string, needle: string, pen: number, style: string) => {
    const r = textRange(sel, needle);
    if (!r) return fail(`[plus] "${needle}" 없음`);
    const b = r.getBoundingClientRect();
    (r.startContainer.parentElement as HTMLElement).dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: b.left + 2, clientY: b.top + 2 }));
    await settle();
    const plus = q<HTMLButtonElement>(".annot-plus");
    if (!plus) return fail(`[plus] "${needle}" 블록에 머물렀는데 여백 ＋ 가 안 떴다.`);
    plus.click();
    await settle();
    const id = await pickPen(pen);
    if (id) targets.push({ id, sel, needle, style });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
  };
  await addPoint("li", "지워진 파일은", 0, "star");
  await addPoint("blockquote p", "가장 큰 위험은", 4, "bar");

  await settle();
  checkAll("[처음]");

  // ── 같은 표시는 어디서나 같은 글자에 ──
  await redrawn(() => st().setReadingWidth("narrow"), "리딩 폭 좁게");
  checkAll("[리딩 폭 좁게]");
  {
    const app = q<HTMLElement>(".app");
    if (app) {
      // 카드 폭(최대 860)이 그대로면 다시 그릴 일이 없다 — 표시는 카드 기준 좌표다. 기다리기만.
      app.style.width = "980px";
      window.dispatchEvent(new Event("resize"));
      await sleep(250);
      await settle();
      checkAll("[창 폭 980px]");
      app.style.width = "";
      await sleep(150);
    }
  }
  await redrawn(() => st().setReadingWidth("normal"), "리딩 폭 보통");
  await redrawn(() => st().setPreviewZoom(1.4), "줌 1.4");
  checkAll("[줌 1.4]");
  await redrawn(() => st().setPreviewZoom(1), "줌 1");
  await redrawn(() => st().setTheme("dark"), "다크 테마");
  checkAll("[다크]");
  {
    const want = markPalette(themes.dark).yellow.ink;
    const got = doc()?.defaultView?.getComputedStyle(doc()!.documentElement).getPropertyValue("--mark-yellow-ink").trim();
    if (got !== want) fail(`[다크] --mark-yellow-ink 가 ${got} 다(기대 ${want}).`);
  }
  await redrawn(() => st().setTheme("paper"), "페이퍼 테마");
  await redrawn(() => st().setTextDirection("rtl"), "글 방향 rtl");
  checkAll("[글 방향 rtl]");
  await redrawn(() => st().setTextDirection("auto"), "글 방향 auto");

  // ── 질감 끔 = 같은 도형에서 필터만 뺀다 ──
  {
    const before = annotPerf.draws;
    st().setAnnotTexture(false);
    await waitFor(() => annotPerf.draws > before, "질감 끔 다시 그리기", 60);
    const html = doc()?.querySelector("svg.annot-under")?.innerHTML ?? "";
    if (html.includes("filter=")) fail("[질감 끔] 필터가 남아 있다.");
    checkAll("[질감 끔]");
    st().setAnnotTexture(true);
    await waitFor(() => (doc()?.querySelector("svg.annot-under")?.innerHTML ?? "").includes("filter="), "질감 켬", 60);
  }

  // ── 에이전트가 문서를 고쳐 쓴다 — 바뀜·옮겨짐·사라짐 ──
  {
    const edited = fixture
      .replace("## 무엇을 했나\n", "## 무엇을 했나\n\n(에이전트가 덧붙임) 이 절은 10-12 에 다시 썼다.\n")
      .replace("근거가 부족하다", "근거가 충분하다")
      .replace("- 지워진 파일은 walk 하며 본 경로 목록과 대조해 색인에서 뺀다.\n", "");
    await redrawn(() => st().reloadFile(PATH, edited), "에이전트식 수정");
    await sleep(200);
    // 바뀐 형광펜은 지금 판의 글자(충분하다)에, 밑줄은 옮겨진 자리에
    const hlT = targets.find((x) => x.id === hl);
    if (hlT) hlT.needle = "근거가 충분하다";
    const star = targets.find((x) => x.style === "star");
    const survivors = targets.filter((x) => x !== star);
    for (const tg of survivors) checkAligned("[수정 뒤]", tg);
    if (star && marks().some((g) => g.getAttribute("data-id") === star.id)) fail("[수정 뒤] 지워진 목록 항목의 별표가 아직 그려져 있다.");
    lines.push(`  ${"[수정 뒤]".padEnd(22)} 바뀜 1 · 사라짐 1 · 나머지 ${survivors.length - 1}개 옮겨짐`);
    const pill = q(".annot-pill")?.textContent ?? "";
    if (!/1\b.*1\b/.test(pill) || !/바뀜 1|Changed 1/.test(pill) || !/잃음 1|Lost 1/.test(pill)) fail(`[수정 뒤] 요약 알약이 "${pill}" 다(바뀜 1 · 위치 잃음 1 기대).`);

    // 툴팁 — 바뀐 표시에 머무르면 이전 → 지금
    const g = marks().find((m) => m.getAttribute("data-id") === hl);
    if (g) {
      const b = g.getBoundingClientRect();
      doc()!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: b.left + 4, clientY: b.top + b.height / 2 }));
      await sleep(700);
      const tip = q(".annot-tip")?.textContent ?? "";
      if (!tip.includes("부족하다") || !tip.includes("충분하다")) fail(`[툴팁] 바뀐 표시의 툴팁에 이전/지금이 없다: "${tip.slice(0, 80)}"`);
      else lines.push(`  ${"[툴팁]".padEnd(22)} 450ms 뒤 이전 → 지금`);
    }

    // 레일 — 넓으면 펼치고, 좁으면 툴팁으로 돌아간다
    st().setAnnotRail(true);
    await settle();
    await settle();
    const cards = document.querySelectorAll(".annot-rail .annot-card").length;
    if (cards < 2) fail(`[레일] 펼쳤는데 카드가 ${cards}장이다(메모 1 + 바뀜(같은 것) + 사라짐 1 → 2 이상).`);
    const app = q<HTMLElement>(".app");
    if (app) {
      app.style.width = "900px";
      window.dispatchEvent(new Event("resize"));
      await sleep(200);
      await settle();
      if (q(".annot-rail")) fail("[레일] 900px 인데 레일이 그대로다(폭을 재서 툴팁으로 돌아가야 한다).");
      if (!q(".annot-narrow")) fail("[레일] 좁아서 접었다는 안내가 없다.");
      app.style.width = "";
      window.dispatchEvent(new Event("resize"));
      await sleep(150);
    }
    lines.push(`  ${"[레일]".padEnd(22)} 1600px 카드 ${cards}장 · 900px 툴팁으로`);
    st().setAnnotRail(false);
  }

  // ── 저장 안 한 편집이 있으면 막는다 ──
  {
    const tab = st().tabs.find((t) => t.path === PATH)!;
    st().updateContent(PATH, tab.content + "\n");
    await sleep(700); // 미리보기 디바운스
    await settle();
    const shown = await select("p", "첫 실행 시간이");
    if (!shown || !q(".annot-tray .annot-dirty")) fail("[dirty] 저장 안 한 편집이 있는데 펜 트레이가 막지 않았다.");
    else lines.push(`  ${"[dirty]".padEnd(22)} 저장 안 한 편집 → 트레이가 안내만`);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    st().reloadFile(PATH, tab.content);
    await sleep(700);
  }

  // ── 공유: 리뷰 요약 · HTML 내보내기(표시·메모 포함) ──
  {
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>(".annot-pill")).find((b) => /요약|summary/i.test(b.textContent ?? ""));
    btn?.click();
    await sleep(200);
    const md = lastSummary.text;
    if (!btn || !md.includes("충분하다") || !md.includes("출처가 어디지?") || !/\((line )?\d+/.test(md)) fail(`[요약] 리뷰 요약이 이상하다: ${md.slice(0, 160)}`);
    else lines.push(`  ${"[요약]".padEnd(22)} ${md.trim().split(String.fromCharCode(10)).length}줄 — 바뀜·메모·줄 번호 포함`);
    const tab = st().tabs.find((t) => t.path === PATH)!;
    const params = { content: tab.content, path: PATH, themeId: "paper", fontRead: "default", previewZoom: 1, textDirection: "auto" as const };
    const texts = { notesTitle: "메모", changedNote: "원래 문장이 수정됨", meaning: (x: string) => x };
    const plain = await buildExportHtml(params);
    if (new DOMParser().parseFromString(plain, "text/html").querySelector(".annot-x, .annot-notes")) fail("[내보내기] 기본(꺼짐)인데 표시가 들어갔다.");
    const html = await buildExportHtml({ ...params, annot: { marks: true, notes: true, texts } });
    const d = new DOMParser().parseFromString(html, "text/html");
    const spans = d.querySelectorAll(".annot-x");
    const hl = Array.from(d.querySelectorAll(".annot-highlight")).map((x) => x.textContent).join("");
    const notes = d.querySelector(".annot-notes");
    if (hl !== "근거가 충분하다" && !hl.includes("근거가 충분하다")) fail(`[내보내기] 형광펜이 감싼 글이 "${hl}" 다.`);
    if (!notes || !notes.textContent?.includes("출처가 어디지?") || !notes.textContent.includes("원래 문장이 수정됨")) fail("[내보내기] 메모 절이 없거나 바뀜 안내가 없다.");
    if (d.querySelector(".annot-x script, .annot-notes script")) fail("[내보내기] 스크립트가 섞였다.");
    // 감싸기만 했지 글은 그대로 — 메모 끔 판의 본문 글이 표시 없는 판과 같아야 한다.
    const text = (h: string) => new DOMParser().parseFromString(h, "text/html").querySelector(".md")?.textContent ?? "";
    const marksOnlyHtml = await buildExportHtml({ ...params, annot: { marks: true, notes: false, texts } });
    if (text(marksOnlyHtml) !== text(plain)) fail("[내보내기] 표시를 감쌌더니 본문 글이 달라졌다.");
    if (new DOMParser().parseFromString(marksOnlyHtml, "text/html").querySelector(".annot-notes")) fail("[내보내기] 메모 끔인데 메모 절이 들어갔다.");
    lines.push(`  ${"[내보내기]".padEnd(22)} 기본 꺼짐 · 표시 span ${spans.length}개 · 메모 절 ${notes?.querySelectorAll("li").length ?? 0}건`);
  }

  // ── 그리기 비용: 표시 60개 · 질감 켬/끔 ──
  {
    const be = annotBackend();
    const text = st().tabs.find((t) => t.path === PATH)!.content;
    const words = Array.from(text.matchAll(/[가-힣]{2,}/g)).slice(0, 60);
    for (const [i, m] of words.entries()) {
      if (text.slice(m.index!, m.index! + m[0].length) !== m[0]) fail(`[비용] 낱말 위치 불일치 ${i}`);
      await be.add({ id: `perf-${i}`, path: PATH, kind: "range", style: i % 2 ? "underline" : "highlight", color: "yellow", srcStart: m.index!, srcEnd: m.index! + m[0].length, quote: m[0], prefix: "", suffix: "", note: null });
    }
    // 다시 불러오기 = 다른 문서로 갔다가 돌아오기
    st().openFile("C:/docs/other.md", "# other\n");
    await waitFor(() => !!doc()?.querySelector(".md h1")?.textContent?.includes("other"), "다른 문서", 200);
    st().openFile(PATH, st().tabs.find((t) => t.path === PATH)!.content);
    await waitFor(() => marks().length >= 60, "표시 60개+", 300);
    const setTex = async (v: boolean) => {
      if (st().annotTexture === v) return;
      const b = annotPerf.draws;
      st().setAnnotTexture(v);
      await waitFor(() => annotPerf.draws > b, "질감 토글", 60);
    };
    const time = async (on: boolean) => {
      const ms: number[] = [];
      let draw = 0;
      for (let k = 0; k < 5; k++) {
        await setTex(!on);
        await settle();
        const t0 = performance.now();
        await setTex(on);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        ms.push(performance.now() - t0);
        draw = annotPerf.lastDrawMs;
      }
      ms.sort((a, b) => a - b);
      return { median: ms[2], draw };
    };
    const on = await time(true);
    const off = await time(false);
    // 질감 비용은 그리기(계산)가 아니라 **다시 칠하기(래스터)** 에 있다 — 필터가 층 전체(카드 크기)에 걸린다.
    // 카드 배경을 매 프레임 바꿔 전체를 다시 칠하게 하고 프레임 간격을 잰다.
    const repaint = async (tex: boolean) => {
      await setTex(tex);
      const mdEl = doc()!.querySelector<HTMLElement>(".md")!;
      const win = doc()!.defaultView!;
      const stamps: number[] = [];
      await new Promise<void>((done) => {
        let k = 0;
        const step = (ts: number) => {
          stamps.push(ts);
          mdEl.style.outline = k % 2 ? "1px solid transparent" : "1px solid rgba(0,0,0,0.01)";
          mdEl.style.backgroundColor = k % 2 ? "" : "color-mix(in srgb, var(--bg) 99%, #000)";
          if (++k < 24) win.requestAnimationFrame(step);
          else done();
        };
        win.requestAnimationFrame(step);
      });
      mdEl.style.outline = "";
      mdEl.style.backgroundColor = "";
      const gaps = stamps.slice(4).map((t, i) => t - stamps[i + 3]).sort((a, b) => a - b);
      return gaps[Math.floor(gaps.length / 2)];
    };
    const rOn = await repaint(true);
    const rOff = await repaint(false);
    const h = doc()!.querySelector<HTMLElement>(".md")!.offsetHeight;
    lines.push(`  ${"[다시 칠하기]".padEnd(22)} 카드 높이 ${h}px — 프레임 간격 질감 켬 ${rOn.toFixed(1)}ms · 끔 ${rOff.toFixed(1)}ms`);
    (window as unknown as { __annotRepaint: unknown }).__annotRepaint = { rOn, rOff, h };
    // 끄는 기준(ADR 4절 — 감이 아니라 실측): 질감이 다시 칠하기를 한 프레임 넘게 늦추면 실패. 처음 만든 판
    // (필터 영역 = 층 전체)이 여기서 걸렸다(16.7 → 33.3ms) — 표시마다 상자에 걸어 같아졌다.
    if (rOn > rOff + 8) fail(`[다시 칠하기] 질감 켬 ${rOn.toFixed(1)}ms vs 끔 ${rOff.toFixed(1)}ms — 한 프레임 넘게 느리다.`);
    lines.push(`  ${"[비용]".padEnd(22)} 표시 ${marks().length}개 — 질감 켬 ${on.median.toFixed(1)}ms(계산 ${on.draw.toFixed(1)}) · 끔 ${off.median.toFixed(1)}ms(계산 ${off.draw.toFixed(1)})`);
    (window as unknown as { __annotCost: unknown }).__annotCost = { on, off };
    if (on.median > 200) fail(`[비용] 질감 켠 다시 그리기 ${on.median.toFixed(0)}ms — 예산 200ms 초과.`);
  }

  return { ok: failures.length === 0, failures, lines };
}

async function shot() {
  await waitFor(() => !!q(".split"), "앱 마운트");
  // 앱의 readFile 처럼 줄끝을 LF 로 — git(autocrlf)이 픽스처를 CRLF 로 바꿔 두면 아래 수정(replace)이 조용히 안 먹는다.
  const fixture = (await (await fetch("/probe-fixture")).text()).replace(/\r\n?/g, "\n");
  setAnnotBackend(memoryBackend((p) => st().tabs.find((t) => t.path === p)?.content));
  st().setTheme("paper");
  st().openFile(PATH, fixture);
  st().setReaderMode(true);
  st().setAnnotRail(true);
  await waitFor(() => !!doc()?.querySelector(".md h1"), "미리보기");
  await sleep(300);
  const be = annotBackend();
  const text = fixture;
  const mk = (needle: string, style: string, color: string, note: string | null, kind = "range") => {
    const i = text.indexOf(needle);
    return be.add({ id: `shot-${style}-${i}`, path: PATH, kind: kind as never, style: style as never, color: color as never, srcStart: i, srcEnd: i + needle.length, quote: needle, prefix: "", suffix: "", note });
  };
  await mk("근거가 부족하다", "highlight", "yellow", "출처가 어디지?");
  await mk("부팅 때마다 색인 전체를", "underline", "blue", null);
  await mk("성능 문서", "wavy", "pink", "링크가 깨졌을지도");
  await mk("한 트랜잭션", "strike", "orange", null);
  await mk("2.5초", "circle", "green", null);
  st().openFile("C:/docs/other.md", "# other\n");
  await sleep(300);
  st().openFile(PATH, fixture);
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
