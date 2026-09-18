// 글 방향(RTL) 프로브 — 브라우저 쪽 하네스.
//
// 왜 있나: RTL 이 맞는지는 **언어가 아니라 기하**로 판정한다. 글자를 어느 쪽부터 놓을지는 유니코드
// 양방향 알고리즘이 글자 속성으로 정하고 Chromium 이 실행한다. 우리가 만든 것은 "브라우저가 그렇게
// 하도록 놔두는 것"(기준 방향·정렬·여백 뒤집기)이라, 확인할 것은 "첫 글자가 오른쪽 변에서 시작하는가,
// 막대가 오른쪽에 붙는가, 코드는 여전히 왼쪽인가"뿐이다 — 전부 픽셀 좌표다. 페르시아어를 읽을 필요가
// 없고, 픽스처 문장은 UN 공개 번역을 그대로 베꼈다(docs/samples/rtl-persian.md).
//
// 정답 오라클: 같은 문단을 브라우저에 `dir="rtl"` 로 직접 그린 것. 우리 자동 판정 문단의 첫 글자 좌표가
// 그것과 같아야 한다(자동 = 브라우저와 같은 답).
//
// 실행: `cd src; npm run probe:rtl` (진짜 앱을 마운트한 뒤 store 를 몰아 auto/rtl/ltr 을 오간다)
import { EditorView, Direction } from "@codemirror/view";
import { cursorCharLeft } from "@codemirror/commands";
import { useAppStore } from "../store";
import type { TextDirection } from "../lib/bidi";
import { buildExportHtml } from "../features/export/html";

interface ProbeResult {
  ok: boolean;
  failures: string[];
  lines: string[];
}

const failures: string[] = [];
const lines: string[] = [];
const fail = (s: string) => failures.push(s);
const round = (n: number) => Math.round(n * 10) / 10;
const settle = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const q = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

const FIXTURE_PATH = "C:/docs/rtl-persian.md";
// 픽스처에서 문단을 찾는 열쇠(앞부분). 픽스처가 바뀌면 여기도 바뀐다 — 그래서 짧게 둔다.
const FA_PARA = "تمام افراد بشر";
const MIXED = "سلام 123 hello.";
const CODE_PARA = "پارامتر";
const LINK_PARA = "پیوند";
const EN_PARA = "English paragraph";
const KO_PARA = "한국어 문단";

/** 텍스트 노드 안 부분 문자열의 사각형(첫 글자 하나 또는 구간). */
function rectOfText(el: Element, needle: string, len = 1): DOMRect | null {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.textContent?.indexOf(needle) ?? -1;
    if (i < 0) continue;
    const r = el.ownerDocument.createRange();
    r.setStart(n, i);
    r.setEnd(n, i + len);
    return r.getBoundingClientRect();
  }
  return null;
}

function findBlock(doc: Document, sel: string, needle: string): HTMLElement | null {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(sel))) {
    if (el.textContent?.includes(needle)) return el;
  }
  return null;
}

/** 블록의 첫 글자가 콘텐츠 상자의 어느 변에서 시작하는가. 'right' 면 RTL 로 그려진 것. */
function startsAt(el: HTMLElement, needle: string): "left" | "right" | "neither" {
  const r = rectOfText(el, needle);
  if (!r) return "neither";
  const cs = getComputedStyle(el);
  const box = el.getBoundingClientRect();
  const left = box.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
  const right = box.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  if (Math.abs(r.right - right) <= 1.5) return "right";
  if (Math.abs(r.left - left) <= 1.5) return "left";
  return "neither";
}

/** 한 줄짜리 블록의 글이 콘텐츠 상자의 어느 변에 붙어 있는가(전체 텍스트 범위의 사각형으로).
 *  여러 줄로 접힌 블록은 양쪽 변에 다 닿아 'full' — 그런 블록엔 첫 글자 검사(startsAt)를 쓴다.
 *  강제 모드에서 첫 글자 위치는 판정 기준이 못 된다: RTL 문단 속 영어 문장은 오른쪽 정렬돼도
 *  첫 글자 E 는 문장 왼쪽 끝(변이 아닌 곳)에 있고 마침표만 왼쪽 변에 붙는다. */
function alignedAt(el: HTMLElement): "left" | "right" | "full" | "neither" {
  const r = el.ownerDocument.createRange();
  r.selectNodeContents(el);
  const rect = r.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const box = el.getBoundingClientRect();
  const left = box.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
  const right = box.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  const atL = Math.abs(rect.left - left) <= 1.5;
  const atR = Math.abs(rect.right - right) <= 1.5;
  return atL && atR ? "full" : atR ? "right" : atL ? "left" : "neither";
}

async function waitFor(pred: () => boolean, what: string, tries = 300): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (pred()) return true;
    await settle();
  }
  fail(`[setup] ${what} 을(를) 기다리다 포기했다.`);
  return false;
}

function previewDoc(): Document | null {
  return q<HTMLIFrameElement>(".pane-a .preview-frame")?.contentDocument ?? null;
}

/** 설정을 바꾸고 미리보기 문서가 그 모드로 다시 그려질 때까지 기다린다. */
async function switchMode(mode: TextDirection): Promise<Document | null> {
  useAppStore.getState().setTextDirection(mode);
  const ok = await waitFor(
    () => previewDoc()?.querySelector(".md")?.getAttribute("data-dir-mode") === mode && !!previewDoc()?.querySelector("h1"),
    `미리보기가 ${mode} 모드로 다시 그려지는 것`,
  );
  if (!ok) return null;
  await settle();
  await settle();
  return previewDoc();
}

// ── 미리보기 ─────────────────────────────────────────────────────────────────
function checkPreviewAuto(doc: Document) {
  const tag = "[preview auto]";
  const md = q<HTMLElement>(".md", doc)!;
  if (md.getAttribute("dir") !== "rtl") fail(`${tag} 문서 루트 dir 이 ${md.getAttribute("dir")} 다(첫 강한 글자가 페르시아어라 rtl 이어야 한다).`);

  // 페르시아어 문단: RTL 로 계산되고 첫 글자가 오른쪽 변에서 시작한다.
  const fa = findBlock(doc, "p", FA_PARA);
  if (!fa) return fail(`${tag} 페르시아어 문단을 찾지 못했다.`);
  if (getComputedStyle(fa).direction !== "rtl") fail(`${tag} 페르시아어 문단의 direction 이 ${getComputedStyle(fa).direction} 다.`);
  const faStart = startsAt(fa, FA_PARA);
  if (faStart !== "right") fail(`${tag} 페르시아어 문단의 첫 글자가 ${faStart} 에서 시작한다(오른쪽 변이어야 한다).`);

  // 정답 오라클: 같은 문단을 dir="rtl" 로 강제해 그린 것과 첫 글자 x 가 같아야 한다.
  const ref = fa.cloneNode(true) as HTMLElement;
  ref.setAttribute("dir", "rtl");
  fa.after(ref);
  const a = rectOfText(fa, FA_PARA)!;
  const b = rectOfText(ref, FA_PARA)!;
  if (Math.abs(a.right - b.right) > 0.5) fail(`${tag} 자동 판정 문단의 첫 글자 x(${round(a.right)})가 dir="rtl" 참조(${round(b.right)})와 다르다.`);
  ref.remove();

  // 혼합 문단: 시각 순서가 페르시아어 > "hello" > "." (마침표가 왼쪽 끝).
  const mixed = findBlock(doc, "p", MIXED);
  if (!mixed) fail(`${tag} 혼합 문단을 찾지 못했다.`);
  else {
    const fa1 = rectOfText(mixed, "سلام");
    const hello = rectOfText(mixed, "hello", 5);
    const dot = rectOfText(mixed, ".");
    if (!fa1 || !hello || !dot) fail(`${tag} 혼합 문단의 조각을 찾지 못했다.`);
    else if (!(fa1.left > hello.right - 0.5 && hello.left > dot.right - 0.5)) {
      fail(`${tag} 혼합 문단 시각 순서가 틀렸다: سلام@${round(fa1.left)} hello@${round(hello.left)} .@${round(dot.left)} (오른쪽부터 페르시아어→hello→마침표여야 한다).`);
    }
  }

  // 인라인 코드는 격리돼 자기 순서(LTR)를 지킨다: 'f' 가 ')' 보다 왼쪽.
  const codePara = findBlock(doc, "p", CODE_PARA);
  const code = codePara?.querySelector("code");
  if (!code) fail(`${tag} 인라인 코드 문단을 찾지 못했다.`);
  else {
    if (getComputedStyle(code).unicodeBidi !== "plaintext") fail(`${tag} 인라인 코드 unicode-bidi 가 ${getComputedStyle(code).unicodeBidi} 다(plaintext 여야 한다).`);
    const f = rectOfText(code, "f");
    const close = rectOfText(code, ")");
    if (f && close && !(f.left < close.left)) fail(`${tag} 인라인 코드 foo_bar() 의 글자 순서가 뒤집혔다(f@${round(f.left)} )@${round(close.left)}).`);
  }

  // 목록: 컨테이너가 rtl 로 계산되고 여백이 오른쪽에 붙는다.
  const ul = findBlock(doc, "ul", "مورد اول");
  if (!ul) fail(`${tag} 페르시아어 목록을 찾지 못했다.`);
  else {
    if (ul.getAttribute("data-dir") !== "rtl") fail(`${tag} 목록 data-dir 이 ${ul.getAttribute("data-dir")} 다.`);
    const cs = getComputedStyle(ul);
    if (!(parseFloat(cs.paddingRight) > 0 && parseFloat(cs.paddingLeft) === 0)) fail(`${tag} 목록 여백이 오른쪽이 아니다(left ${cs.paddingLeft} / right ${cs.paddingRight}).`);
    const li = ul.querySelector<HTMLElement>("li")!;
    if (startsAt(li, "مورد") !== "right") fail(`${tag} 목록 항목 글자가 오른쪽 변에서 시작하지 않는다.`);
  }
  const ol = findBlock(doc, "ol", "یک");
  if (ol && getComputedStyle(ol).paddingRight === "0px") fail(`${tag} 번호 목록 여백이 오른쪽이 아니다.`);

  // 인용문·콜아웃: 막대가 오른쪽.
  const bq = findBlock(doc, "blockquote", "نقل قول");
  if (!bq) fail(`${tag} 페르시아어 인용문을 찾지 못했다.`);
  else {
    const cs = getComputedStyle(bq);
    if (!(parseFloat(cs.borderRightWidth) >= 3 && parseFloat(cs.borderLeftWidth) === 0)) fail(`${tag} 인용문 막대가 오른쪽이 아니다(left ${cs.borderLeftWidth} / right ${cs.borderRightWidth}).`);
    if (!(parseFloat(cs.borderTopLeftRadius) > 0 && parseFloat(cs.borderTopRightRadius) === 0)) fail(`${tag} 인용문 둥근 모서리가 뒤집히지 않았다(tl ${cs.borderTopLeftRadius} / tr ${cs.borderTopRightRadius}).`);
  }
  const callout = findBlock(doc, ".callout", "یادداشت");
  if (!callout) fail(`${tag} 콜아웃을 찾지 못했다.`);
  else {
    const cs = getComputedStyle(callout);
    if (!(parseFloat(cs.borderRightWidth) >= 4 && parseFloat(cs.borderLeftWidth) === 0)) fail(`${tag} 콜아웃 막대가 오른쪽이 아니다(left ${cs.borderLeftWidth} / right ${cs.borderRightWidth}).`);
  }
  // 한국어 인용문(문서 맨 앞)은 그대로 왼쪽 막대 — 혼용 회귀.
  const koBq = findBlock(doc, "blockquote", "회귀 픽스처");
  if (koBq && parseFloat(getComputedStyle(koBq).borderLeftWidth) < 3) fail(`${tag} 한국어 인용문 막대가 왼쪽에서 사라졌다(문단마다 따로 판정해야 한다).`);

  // 표: 첫 열이 오른쪽(열 순서 뒤집힘) + 셀 글자 오른쪽 정렬.
  const table = findBlock(doc, "table", "ستون");
  if (!table) fail(`${tag} 표를 찾지 못했다.`);
  else {
    const ths = table.querySelectorAll<HTMLElement>("th");
    if (ths.length >= 2 && !(ths[0].getBoundingClientRect().left > ths[1].getBoundingClientRect().left)) fail(`${tag} 표의 첫 열이 오른쪽에 오지 않았다.`);
    if (ths.length && startsAt(ths[0], "ستون") !== "right") fail(`${tag} 표 머리글 글자가 오른쪽 정렬이 아니다.`);
  }

  // 코드 블록은 LTR: 페르시아어 주석으로 시작해도 첫 글자가 왼쪽.
  const pre = findBlock(doc, "pre", "const x");
  if (!pre) fail(`${tag} 코드 블록을 찾지 못했다.`);
  else {
    if (getComputedStyle(pre).direction !== "ltr") fail(`${tag} 코드 블록 direction 이 ${getComputedStyle(pre).direction} 다.`);
    const slash = rectOfText(pre, "//", 2);
    if (slash && Math.abs(slash.left - (pre.getBoundingClientRect().left + parseFloat(getComputedStyle(pre).paddingLeft) + 1)) > 2) fail(`${tag} 코드 블록 첫 글자가 왼쪽 변에서 시작하지 않는다(${round(slash.left)}).`);
  }
  const math = doc.querySelector<HTMLElement>("math");
  if (math && getComputedStyle(math).direction !== "ltr") fail(`${tag} 수식 direction 이 ${getComputedStyle(math).direction} 다.`);

  // 영어·한국어 문단은 문서 안에서 LTR 그대로(회귀 0) — 한 줄이라 정렬 변으로 본다.
  for (const [needle, label] of [[EN_PARA, "영어"], [KO_PARA, "한국어"]] as const) {
    const p = findBlock(doc, "p", needle);
    if (!p) fail(`${tag} ${label} 문단을 찾지 못했다.`);
    else if (alignedAt(p) !== "left") fail(`${tag} ${label} 문단이 왼쪽 정렬이 아니다(${alignedAt(p)}).`);
  }
  lines.push(`  preview auto  root=rtl · fa=right · mixed(fa>hello>.) · code=ltr · en/ko=left`);
}

function checkPreviewForced(doc: Document, mode: "rtl" | "ltr") {
  const tag = `[preview ${mode}]`;
  const md = q<HTMLElement>(".md", doc)!;
  if (md.getAttribute("dir") !== mode) fail(`${tag} 문서 루트 dir 이 ${md.getAttribute("dir")} 다.`);
  const en = findBlock(doc, "p", EN_PARA);
  const fa = findBlock(doc, "p", FA_PARA);
  const faShort = findBlock(doc, "blockquote", "نقل قول")?.querySelector<HTMLElement>("p") ?? null;
  const ul = findBlock(doc, "ul", "مورد اول");
  const pre = findBlock(doc, "pre", "const x");
  if (!en || !fa || !faShort || !ul || !pre) return fail(`${tag} 문단을 찾지 못했다.`);
  const want = mode === "rtl" ? "right" : "left";
  // 강제는 내용과 무관하게 전부 — 한 줄짜리 영어 문단·페르시아어 문단이 같은 변에 정렬된다.
  if (alignedAt(en) !== want) fail(`${tag} 영어 문단이 ${alignedAt(en)} 정렬이다(${want} 여야 한다 — dir=auto 를 CSS 가 덮지 못했다).`);
  if (alignedAt(faShort) !== want) fail(`${tag} 페르시아어 한 줄 문단이 ${alignedAt(faShort)} 정렬이다(${want} 여야 한다).`);
  if (getComputedStyle(fa).direction !== mode) fail(`${tag} 페르시아어 문단 direction 이 ${getComputedStyle(fa).direction} 다.`);
  if (mode === "rtl" && startsAt(fa, FA_PARA) !== "right") fail(`${tag} 페르시아어 문단 첫 글자가 오른쪽 변에서 시작하지 않는다.`);
  const cs = getComputedStyle(ul);
  const pad = mode === "rtl" ? cs.paddingRight : cs.paddingLeft;
  if (parseFloat(pad) === 0) fail(`${tag} 목록 여백이 ${mode === "rtl" ? "오른쪽" : "왼쪽"}에 없다(data-dir 을 CSS 가 덮지 못했다).`);
  if (getComputedStyle(pre).direction !== "ltr") fail(`${tag} 코드 블록이 LTR 이 아니다.`);
  lines.push(`  preview ${mode.padEnd(4)}  root=${mode} · en=${want} · fa=${want} · code=ltr`);
}

// ── 편집기 ────────────────────────────────────────────────────────────────────
function editorView(): EditorView | null {
  const dom = q<HTMLElement>(".cm-editor");
  return dom ? EditorView.findFromDOM(dom) : null;
}

function lineOf(view: EditorView, needle: string) {
  const text = view.state.doc.toString();
  const i = text.indexOf(needle);
  return i < 0 ? null : view.state.doc.lineAt(i);
}

function checkEditor(mode: TextDirection) {
  const tag = `[editor ${mode}]`;
  const view = editorView();
  if (!view) return fail(`${tag} 편집기를 찾지 못했다.`);
  const faLine = lineOf(view, FA_PARA);
  const koLine = lineOf(view, KO_PARA);
  const codeLine = lineOf(view, "// سلام");
  const linkLine = lineOf(view, LINK_PARA);
  if (!faLine || !koLine || !codeLine || !linkLine) return fail(`${tag} 픽스처 줄을 찾지 못했다.`);
  const content = view.contentDOM.getBoundingClientRect();
  const dirName = (d: Direction) => (d === Direction.RTL ? "rtl" : "ltr");

  const wantFa = mode === "ltr" ? "ltr" : "rtl";
  const wantKo = mode === "rtl" ? "rtl" : "ltr";
  const gotFa = dirName(view.textDirectionAt(faLine.from));
  const gotKo = dirName(view.textDirectionAt(koLine.from));
  const gotCode = dirName(view.textDirectionAt(codeLine.from));
  if (gotFa !== wantFa) fail(`${tag} 페르시아어 줄 방향이 ${gotFa} 다(${wantFa} 여야 한다).`);
  if (gotKo !== wantKo) fail(`${tag} 한국어 줄 방향이 ${gotKo} 다(${wantKo} 여야 한다).`);
  if (gotCode !== "ltr") fail(`${tag} 코드 펜스 안 줄(페르시아어 주석)이 ${gotCode} 다 — 코드는 어느 모드에서도 ltr 이어야 한다.`);
  // 강한 글자가 없는 줄(표 구분 행)은 위 줄을 따른다 — 페르시아어 표 한가운데서 혼자 왼쪽으로 튀지 않는다.
  const sepLine = lineOf(view, "|------|");
  if (sepLine) {
    const gotSep = dirName(view.textDirectionAt(sepLine.from));
    if (gotSep !== wantFa) fail(`${tag} 표 구분 행 \`|---|\` 이 ${gotSep} 다(위 줄과 같은 ${wantFa} 여야 한다).`);
  } else fail(`${tag} 표 구분 행을 찾지 못했다.`);

  // 줄 정렬: 한 줄짜리 페르시아어 줄(인용문)이 RTL 기준이면 오른쪽 변에, LTR 기준이면 왼쪽 변에 붙는다.
  // (긴 줄은 접혀서 양변에 닿으므로 짧은 줄로 본다.)
  view.dispatch({ selection: { anchor: lineOf(view, "نقل قول")!.from }, scrollIntoView: true });
  const shortEl = Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")).find((l) => l.textContent?.includes("نقل قول"));
  if (!shortEl) fail(`${tag} 짧은 페르시아어 줄 요소를 찾지 못했다.`);
  else {
    const got = alignedAt(shortEl);
    const want = wantFa === "rtl" ? "right" : "left";
    if (got !== want) fail(`${tag} 짧은 페르시아어 줄이 ${got} 정렬이다(${want} 여야 한다).`);
  }

  // 커서 좌표: RTL 기준 줄의 논리적 시작(pos 0)은 오른쪽 변.
  if (wantFa === "rtl") {
    const c = view.coordsAtPos(faLine.from);
    if (c && Math.abs(c.left - content.right) > 6) fail(`${tag} 페르시아어 줄 시작 커서가 오른쪽 변에 없다(x=${round(c.left)}, 변=${round(content.right)}).`);
  }

  // ← 키: RTL 글자 묶음 안에서는 어느 모드든 시각적 왼쪽 = 논리적 앞 → head 가 커진다(CM 의 시각 이동).
  // 모드가 바꾸는 것은 문단 기준 방향(정렬·중립 문자의 자리)이고 묶음 안 순서는 아니다.
  view.dispatch({ selection: { anchor: faLine.from + 2 } });
  cursorCharLeft(view);
  const head = view.state.selection.main.head;
  if (!(head > faLine.from + 2)) fail(`${tag} RTL 글자 묶음 안에서 ← 를 눌렀는데 head 가 ${faLine.from + 2} → ${head} 로 앞으로 가지 않았다.`);

  // URL 격리(auto·rtl): 링크 줄 안의 주소가 dir="ltr" 로 감싸이고 글자 순서가 LTR.
  if (mode !== "ltr") {
    view.dispatch({ selection: { anchor: linkLine.from }, scrollIntoView: true });
    const lineEl = Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".cm-line")).find((l) => l.textContent?.includes("example.com"));
    const iso = lineEl?.querySelector<HTMLElement>('[dir="ltr"]');
    if (!iso || !iso.textContent?.includes("example.com")) fail(`${tag} 링크 줄의 URL 이 dir="ltr" 로 격리되지 않았다.`);
    else {
      const h = rectOfText(iso, "https", 1);
      const p = rectOfText(iso, "page", 1);
      if (h && p && !(h.left < p.left)) fail(`${tag} 격리된 URL 의 글자 순서가 뒤집혔다.`);
    }
  }

  // 거터: rtl 이면 오른쪽, 아니면 왼쪽.
  const gutters = q<HTMLElement>(".cm-gutters")?.getBoundingClientRect();
  if (gutters) {
    const onRight = gutters.left > content.left;
    if (mode === "rtl" && !onRight) fail(`${tag} 거터가 오른쪽으로 옮겨가지 않았다.`);
    if (mode !== "rtl" && onRight) fail(`${tag} 거터가 오른쪽에 있다(왼쪽이어야 한다).`);
  }
  const editorDir = q<HTMLElement>(".cm-editor")?.getAttribute("dir");
  if (mode === "rtl" && editorDir !== "rtl") fail(`${tag} .cm-editor dir 이 ${editorDir} 다.`);
  if (mode !== "rtl" && editorDir === "rtl") fail(`${tag} .cm-editor 에 dir=rtl 이 남아 있다.`);
  lines.push(`  editor ${mode.padEnd(4)}   fa=${gotFa} ko=${gotKo} code=${gotCode} · ←→head ${head > faLine.from + 2 ? "+" : "-"} · gutter=${gutters && gutters.left > content.left ? "right" : "left"}`);
}

async function run(): Promise<ProbeResult> {
  await waitFor(() => !!q(".split"), "앱 마운트");
  const fixture = await (await fetch("/probe-fixture")).text();
  const st = useAppStore.getState;
  st().setReaderMode(false);
  st().setTextDirection("auto");
  st().openFile(FIXTURE_PATH, fixture);
  const ready = await waitFor(
    () => st().activePath === FIXTURE_PATH && !!previewDoc()?.querySelector("h1")?.textContent?.includes("اعلامیه") && !!editorView(),
    "픽스처가 편집기·미리보기에 뜨는 것",
  );
  if (!ready) return { ok: false, failures, lines };
  await settle();
  await settle();

  if (location.search.includes("shot")) {
    // 스크린샷 모드: 열어 두기만 한다(드라이버가 가상 시간 예산 뒤에 찍는다).
    return { ok: true, failures, lines: ["  (shot)"] };
  }

  // ── auto ──
  checkPreviewAuto(previewDoc()!);
  checkEditor("auto");

  // ── 강제 rtl ──
  const rtlDoc = await switchMode("rtl");
  if (rtlDoc) checkPreviewForced(rtlDoc, "rtl");
  await settle();
  checkEditor("rtl");

  // ── 강제 ltr(오늘 그대로) ──
  const ltrDoc = await switchMode("ltr");
  if (ltrDoc) checkPreviewForced(ltrDoc, "ltr");
  await settle();
  checkEditor("ltr");

  // ── 되돌아오기 ──
  const backDoc = await switchMode("auto");
  if (backDoc) {
    const fa = findBlock(backDoc, "p", FA_PARA);
    if (fa && startsAt(fa, FA_PARA) !== "right") fail("[preview auto←] auto 로 되돌아왔는데 페르시아어 문단이 오른쪽에서 시작하지 않는다.");
  }
  await settle();
  checkEditor("auto");

  // ── 설정 창: 글 방향 행이 실제로 있고 누르면 store 가 바뀐다(UI 배선) ──
  {
    const gear = q<HTMLButtonElement>(".settings-wrap > button");
    if (!gear) fail("[settings] 설정 버튼을 찾지 못했다.");
    else {
      gear.click();
      await settle();
      const groups = Array.from(document.querySelectorAll<HTMLElement>(".settings-pop .seg[role=group]"));
      const seg = groups.find((g) => g.querySelectorAll("button").length === 3 && /글 방향|Text direction/.test(g.getAttribute("aria-label") ?? ""));
      if (!seg) fail(`[settings] 글 방향 세그먼트를 찾지 못했다(role=group ${groups.length}개).`);
      else {
        const [bAuto, , bRtl] = Array.from(seg.querySelectorAll<HTMLButtonElement>("button"));
        bRtl.click();
        await settle();
        if (st().textDirection !== "rtl") fail(`[settings] [오→왼] 을 눌렀는데 store 가 ${st().textDirection} 다.`);
        if (bRtl.getAttribute("aria-pressed") !== "true") fail("[settings] [오→왼] 버튼이 눌린 상태로 표시되지 않는다.");
        bAuto.click();
        await settle();
        if (st().textDirection !== "auto") fail(`[settings] [자동] 을 눌렀는데 store 가 ${st().textDirection} 다.`);
        lines.push("  settings      글 방향 세그먼트 3버튼 · 클릭→store 반영");
      }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await settle();
    }
  }
  await switchMode("auto");

  // ── HTML 내보내기: 화면과 같은 방향 속성을 담는다(문자열 수준) ──
  try {
    const html = await buildExportHtml({ content: fixture, path: FIXTURE_PATH, themeId: st().themeId, fontRead: "default", previewZoom: 1, textDirection: "auto" });
    if (!html.includes('<div class="md" dir="rtl" data-dir-mode="auto">')) fail("[export] 내보낸 HTML 의 문서 루트가 rtl/auto 가 아니다.");
    if (!/<p [^>]*dir="auto"/.test(html)) fail("[export] 내보낸 HTML 에 잎 블록 dir=auto 가 없다.");
    lines.push("  export        root=rtl/auto · leaves dir=auto");
  } catch (e) {
    fail(`[export] buildExportHtml 이 던졌다: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { ok: failures.length === 0, failures, lines };
}

void run()
  .then((r) => (location.search.includes("shot") ? undefined : fetch("/probe-result", { method: "POST", body: JSON.stringify(r) })))
  .catch((e: unknown) =>
    fetch("/probe-result", {
      method: "POST",
      body: JSON.stringify({
        ok: false,
        failures: [`[harness] 프로브 자체가 던졌다: ${e instanceof Error ? e.stack : String(e)}`],
        lines: [],
      }),
    }),
  );
