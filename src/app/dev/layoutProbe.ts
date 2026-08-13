// 리딩 분할 레이아웃 프로브 — 브라우저 쪽 하네스.
//
// 왜 있나: mermaid 프로브는 미리보기 **문서 안**만 본다(자기 iframe 을 치수까지 직접 만들고 앱
// 셸을 아예 로드하지 않는다). 그래서 패널 기하 — 머리띠가 생기면서 iframe 이 넘치는지, 모드
// 전환에서 주 미리보기가 언마운트되는지 — 는 그쪽으로 절대 안 잡힌다. 눈으로만 보면 다음 버전에
// 샌다는 걸 이 저장소는 v0.6.7→v0.6.8 로 이미 배웠다.
//
// 이 파일은 **진짜 앱**(main.tsx)이 마운트된 문서에서 store 를 직접 몰아 세 모드를 오가며 잰다.
// 실행: `cd src; npm run probe:layout`
import { useAppStore } from "../store";

interface ProbeResult {
  ok: boolean;
  failures: string[];
  lines: string[];
}

const failures: string[] = [];
const lines: string[] = [];
const fail = (s: string) => failures.push(s);
const round = (n: number) => Math.round(n * 10) / 10;

/** React 리렌더 + 레이아웃이 끝나길 기다린다(rAF 두 번이면 커밋 후 페인트까지 지난다). */
const settle = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const visible = (el: Element | null) => !!el && (el as HTMLElement).offsetParent !== null;

/** .split 의 보이는 grid 아이템 수. display:none 은 배치에서 아예 빠지므로 1 또는 3 이어야 한다. */
function visibleItems(): string[] {
  const split = q<HTMLElement>(".split");
  if (!split) return [];
  return Array.from(split.children)
    .filter((c) => visible(c))
    .map((c) => c.className.split(" ").filter((x) => x !== "preview").join("."));
}

/** 패널 안 iframe 이 패널 밖으로 넘치지 않는가(머리띠 높이만큼 흘러내리는 회귀 가드). */
function checkFrameFits(paneSel: string, tag: string) {
  const pane = q<HTMLElement>(paneSel);
  const frame = pane?.querySelector<HTMLIFrameElement>(".preview-frame");
  if (!pane || !frame) {
    fail(`[fit] ${tag}: ${paneSel} 또는 그 안의 .preview-frame 을 찾지 못했다.`);
    return;
  }
  const p = pane.getBoundingClientRect();
  const f = frame.getBoundingClientRect();
  const over = f.bottom - p.bottom;
  if (over > 1) {
    fail(
      `[fit] ${tag} ${paneSel}: iframe 이 패널 아래로 ${round(over)}px 넘친다. ` +
        `.preview 가 flex 열이 아니거나 .preview-frame 이 height:100% 로 되돌아갔다(App.css).`,
    );
  }
  if (f.height < 50) {
    fail(`[fit] ${tag} ${paneSel}: iframe 높이가 ${round(f.height)}px 뿐이다(레이아웃이 무너졌다).`);
  }
}

async function run(): Promise<ProbeResult> {
  // 앱이 마운트되고 데모 시드가 탭 둘을 열 때까지 기다린다.
  for (let i = 0; i < 200 && !q(".split"); i++) await settle();
  const st = () => useAppStore.getState();
  if (st().tabs.length < 2) {
    fail(`[setup] 데모 탭이 ${st().tabs.length}개다(2개 이상이어야 분할을 잴 수 있다).`);
    return { ok: false, failures, lines };
  }
  const other = st().tabs.find((t) => t.path !== st().activePath)!;

  // ── (1) 편집 모드 ────────────────────────────────────────────────────────
  st().setReaderMode(false);
  st().closeSecondary();
  await settle();
  let items = visibleItems();
  if (items.length !== 3) fail(`[edit] 보이는 grid 아이템이 ${items.length}개다(3개여야 한다): ${items}`);
  if (!visible(q(".editor"))) fail("[edit] 편집기가 안 보인다.");
  if (!visible(q(".seam-main"))) fail("[edit] 주 리사이저(.seam-main)가 안 보인다.");
  if (visible(q(".seam-reader"))) fail("[edit] 리딩 리사이저가 편집 모드에서 보인다.");
  if (visible(q(".pane-b"))) fail("[edit] 두 번째 패널이 편집 모드에서 보인다.");
  if (q(".pane-head")) fail("[edit] 단일 문서인데 패널 머리띠가 있다.");
  checkFrameFits(".pane-a", "edit");
  lines.push(`  edit         ${items.join(" | ")}`);

  // 주 미리보기 iframe 의 **DOM 노드 자체**를 붙잡아 둔다. 세 모드를 오간 뒤에도 같은 노드여야
  // 한다 — 언마운트되면 srcdoc 이 다시 로드돼 스크롤 위치가 튄다(리딩 모드의 존재 이유).
  const frameA = q<HTMLIFrameElement>(".pane-a .preview-frame");
  if (!frameA) fail("[edit] .pane-a 안의 iframe 을 찾지 못했다.");

  // ── (2) 리딩 단일 ────────────────────────────────────────────────────────
  st().setReaderMode(true);
  await settle();
  items = visibleItems();
  if (items.length !== 1) fail(`[reader] 보이는 grid 아이템이 ${items.length}개다(1개여야 한다): ${items}`);
  if (visible(q(".editor"))) fail("[reader] 리딩 모드인데 편집기가 보인다.");
  if (visible(q(".seam-main"))) fail("[reader] 리딩 모드인데 주 리사이저가 보인다.");
  const split = q<HTMLElement>(".split")!;
  const paneFull = q<HTMLElement>(".pane-a")!.getBoundingClientRect();
  if (Math.abs(paneFull.width - split.getBoundingClientRect().width) > 1) {
    fail(`[reader] 미리보기가 전체 폭이 아니다(${round(paneFull.width)}px / ${round(split.getBoundingClientRect().width)}px).`);
  }
  checkFrameFits(".pane-a", "reader");
  lines.push(`  reader       ${items.join(" | ")} · ${round(paneFull.width)}px`);

  // ── (3) 리딩 분할 ────────────────────────────────────────────────────────
  st().openSecondary(other.path);
  st().setReaderRatio(0.6);
  await settle();
  await settle();
  items = visibleItems();
  if (items.length !== 3) fail(`[split] 보이는 grid 아이템이 ${items.length}개다(3개여야 한다): ${items}`);
  if (visible(q(".editor"))) fail("[split] 분할인데 편집기가 보인다.");
  if (visible(q(".seam-main"))) fail("[split] 분할인데 주 리사이저가 보인다 — .split.reader .seam 이 통칭이면 반대로 둘 다 사라진다.");
  if (!visible(q(".seam-reader"))) fail("[split] 리딩 리사이저가 안 보인다.");
  if (!visible(q(".pane-b"))) fail("[split] 두 번째 패널이 안 보인다.");

  const heads = document.querySelectorAll(".pane-head");
  if (heads.length !== 2) fail(`[split] 패널 머리띠가 ${heads.length}개다(양쪽에 하나씩 2개여야 한다).`);
  const a = q<HTMLElement>(".pane-a")!.getBoundingClientRect();
  const b = q<HTMLElement>(".pane-b")!.getBoundingClientRect();
  // readerRatio=0.6 → 좌:우 ≈ 6:4 (가운데 7px seam 제외). 반올림 오차 2px 허용.
  const want = (split.getBoundingClientRect().width - 7) * 0.6;
  if (Math.abs(a.width - want) > 2) {
    fail(`[split] 좌 패널 폭 ${round(a.width)}px (readerRatio 0.6 기준 ${round(want)}px 이어야 한다).`);
  }
  if (b.left < a.right) fail("[split] 두 패널이 겹친다.");
  checkFrameFits(".pane-a", "split");
  checkFrameFits(".pane-b", "split");
  if (split.scrollWidth > split.clientWidth + 1) {
    fail(`[split] .split 이 가로로 넘친다(${split.scrollWidth} > ${split.clientWidth}).`);
  }
  lines.push(`  readerSplit  ${items.join(" | ")} · ${round(a.width)}px / ${round(b.width)}px`);

  // 두 패널이 서로 다른 문서를 보여 주는가(같은 문서를 두 번 그리면 분할의 의미가 없다).
  if (st().secondaryPath === st().activePath) fail("[split] 두 패널이 같은 문서를 가리킨다.");

  // ── (4) 되돌아가기 — 주 미리보기가 살아남았는가 ──────────────────────────
  st().closeSecondary();
  await settle();
  st().setReaderMode(false);
  await settle();
  if (visibleItems().length !== 3) fail("[restore] 편집 모드로 못 돌아왔다.");
  const frameA2 = q<HTMLIFrameElement>(".pane-a .preview-frame");
  if (frameA && frameA2 !== frameA) {
    fail(
      "[restore] 주 미리보기 iframe 이 모드 전환 중에 교체됐다(언마운트). srcdoc 이 다시 로드돼 " +
        "스크롤 위치가 튄다 — .split 의 DOM 순서(editor·seam-main·pane-a·seam-reader·pane-b)가 " +
        "깨졌거나 pane-a 가 조건부 렌더로 바뀌었다.",
    );
  }
  if (q(".pane-head")) fail("[restore] 분할을 닫았는데 패널 머리띠가 남아 있다.");
  checkFrameFits(".pane-a", "restore");
  lines.push(`  restore      iframe 동일=${frameA2 === frameA}`);

  return { ok: failures.length === 0, failures, lines };
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
      }),
    }),
  );
