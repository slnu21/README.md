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
import { BUILTIN_THEMES, listThemeIds, setUserThemes, type Theme } from "../themes";
import { requiredWidth } from "../lib/toolbarFit";

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

/** 지금 단계의 툴바가 **실제로 요구하는 폭**. 늘어나는 칸(.spacer)은 남는 폭을 통째로
 *  먹으므로 최소폭(8px)으로 바꿔 놓고 잰다 — 안 그러면 항상 clientWidth 가 나온다. */
function needNow(bar: HTMLElement): number {
  const cs = getComputedStyle(bar);
  return requiredWidth(
    Array.from(bar.children).map((c) => {
      const m = getComputedStyle(c);
      const outer = (parseFloat(m.marginLeft) || 0) + (parseFloat(m.marginRight) || 0);
      return (c.classList.contains("spacer") ? 8 : c.getBoundingClientRect().width) + outer;
    }),
    parseFloat(cs.columnGap) || 0,
    (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0),
  );
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

  // ── (5) 테마가 늘어도 툴바는 안 늘어난다 ─────────────────────────────────
  // 테마는 파일에서 오므로 개수에 상한이 없다. 예전에는 전부를 타이틀바에 이어 붙여
  // 여섯 개째부터 다른 컨트롤을 밀어냈다 — 그 회귀를 여기서 못박는다.
  const fake = (id: string): Theme => ({
    id,
    name: `가짜 ${id}`,
    type: "light",
    tokens: { "--bg": "#ffffff", "--fg": "#111111", "--accent": "#aa3366", "--surface": "#eeeeee", "--border": "#cccccc" },
  });
  const quick = Object.keys(BUILTIN_THEMES).length;
  setUserThemes({ probeA: fake("probeA"), probeB: fake("probeB"), probeC: fake("probeC") });
  st().bumpThemeRev();
  await settle();

  const seg = q<HTMLElement>(".seg.theme");
  const segButtons = seg ? seg.querySelectorAll("button").length : -1;
  if (segButtons !== quick + 1) {
    fail(
      `[theme] 툴바 테마 버튼이 ${segButtons}개다(내장 ${quick} + 고르기 1 = ${quick + 1}개여야 한다). ` +
        `사용자 테마가 다시 툴바로 새어 나왔다.`,
    );
  }

  // 고르기 창: 목록 전부가 여기 있어야 한다.
  seg?.querySelector<HTMLButtonElement>("button:last-child")?.click();
  await settle();
  const cards = document.querySelectorAll<HTMLButtonElement>(".theme-modal .tp-card");
  const all = listThemeIds().length;
  if (cards.length !== all) fail(`[theme] 고르기 창의 카드가 ${cards.length}개다(테마 ${all}개 전부여야 한다).`);

  // 카드를 누르면 그 테마가 즉시 켜지고, 창은 닫히지 않는다(뒤의 앱이 곧 미리보기다).
  const before = st().themeId;
  const target = Array.from(cards).find((c) => c.querySelector(".tp-id")?.textContent === "probeB");
  target?.click();
  await settle();
  if (st().themeId !== "probeB") fail(`[theme] 카드를 눌렀는데 테마가 ${st().themeId} 다(probeB 여야 한다).`);
  if (!q(".theme-modal")) fail("[theme] 카드를 누르자 창이 닫혔다(고르며 비교할 수 없다).");
  // 파일에서 온 테마를 쓰는 중이면 툴바의 마지막 버튼이 그것을 가리켜야 한다.
  const more = seg?.querySelector<HTMLButtonElement>("button:last-child");
  if (more?.getAttribute("aria-pressed") !== "true") {
    fail("[theme] 사용자 테마가 켜졌는데 툴바 고르기 버튼이 눌린 상태가 아니다(지금 테마가 툴바에서 사라진다).");
  }

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await settle();
  if (q(".theme-modal")) fail("[theme] Esc 로 고르기 창이 안 닫힌다.");
  lines.push(`  themes       툴바 ${segButtons}버튼 · 창 ${cards.length}카드(테마 ${all}개)`);

  // 원상복구 — 뒤에 다른 검사가 붙어도 가짜 테마를 물려주지 않는다.
  st().setTheme(before);
  setUserThemes({});
  st().bumpThemeRev();
  await settle();

  // ── (6) 툴바가 좁아져도 겹치지 않는다 ────────────────────────────────────
  // v0.9.0 의 실제 증상: 1120px 창에서 "폴더 열기"와 "저장" 라벨이 겹쳐 찍혔다(1024px
  // 중단점은 그보다 좁아져야 걸린다). 이제는 중단점이 아니라 **재서** 접으므로, 여기서도
  // 앱 격자의 폭을 직접 바꿔 가며 잰다(뷰포트가 아니라 컨테이너를 줄이는 것이라
  // @media 는 안 걸린다 — 그게 이 방식의 요점이다).
  const app = q<HTMLElement>(".app");
  const bar = q<HTMLElement>(".titlebar");
  if (!app || !bar) {
    fail("[bar] .app 또는 .titlebar 를 찾지 못했다.");
  } else {
    const seen: string[] = [];
    for (const w of [1600, 1240, 1120, 1000, 880, 780]) {
      app.style.width = `${w}px`;
      // 한 번의 관측은 한 칸만 움직인다 — 안정될 때까지 몇 프레임 준다.
      let density = "";
      for (let i = 0; i < 6; i++) {
        await settle();
        const now = bar.dataset.density ?? "";
        if (now === density) break;
        density = now;
      }
      seen.push(`${w}:${density}(${round(needNow(bar))} 필요)`);

      // 겹침은 **버튼 단위**로 본다. 그룹 상자끼리는 겹치지 않으면서 그 안의 버튼이 상자를
      // 넘어 옆 그룹 위에 찍히는 것이 실제 증상이었다("폴더 열기"+"저장" → "폴더 열Save").
      const btns = Array.from(bar.querySelectorAll("button"))
        .map((b) => ({ el: b, r: b.getBoundingClientRect() }))
        .filter((b) => b.r.width > 0);
      for (let i = 1; i < btns.length; i++) {
        const over = btns[i - 1].r.right - btns[i].r.left;
        if (over > 0.5) {
          fail(
            `[bar] ${w}px(${density}): 버튼이 ${round(over)}px 겹친다 ` +
              `(${btns[i - 1].el.getAttribute("aria-label") ?? btns[i - 1].el.textContent?.trim()} · ` +
              `${btns[i].el.getAttribute("aria-label") ?? btns[i].el.textContent?.trim()}). ` +
              `아이템이 다시 줄어들고 있다(.titlebar > * 의 flex:none 이 풀렸다).`,
          );
        }
      }
      const barRect = bar.getBoundingClientRect();
      const last = bar.lastElementChild?.getBoundingClientRect();
      if (last && last.right > barRect.right + 0.5) {
        fail(
          `[bar] ${w}px(${density}): 창 조절 버튼이 툴바 오른쪽으로 ${round(last.right - barRect.right)}px ` +
            `밀려났다(더 접을 단계가 필요하다).`,
        );
      }
      // 접혀도 길은 남아야 한다 — 파일 열기는 버튼이거나 [더 보기] 메뉴 안이거나.
      const openable =
        bar.querySelectorAll(".tgroup.actions .tbtn").length > 0 ||
        !!bar.querySelector(".tbtn.more");
      if (!openable) fail(`[bar] ${w}px(${density}): 파일 열기로 가는 길이 아예 사라졌다.`);
    }

    // 가장 좁은 폭에서는 테마 버튼도 고르기 하나로 접혀야 한다.
    const segNow = q<HTMLElement>(".seg.theme")?.querySelectorAll("button").length ?? -1;
    if (bar.dataset.density === "menu" && segNow !== 1) {
      fail(`[bar] 가장 좁은 단계인데 테마 버튼이 ${segNow}개다(고르기 1개여야 한다).`);
    }
    lines.push(`  titlebar     ${seen.join(" · ")}`);

    // 언어를 바꾸면 라벨 폭이 달라진다. 여태 잰 것을 안 버리면 한쪽 언어에서 잰 폭 때문에
    // 다른 언어에서 필요 이상으로 접힌 채 남는다(useToolbarFit 의 resetKey).
    const langBefore = st().language;
    const needFor = async (lang: "ko" | "en") => {
      st().setLanguage(lang);
      app.style.width = "1600px";
      for (let i = 0; i < 8; i++) await settle();
      return needNow(bar);
    };
    const needKo = await needFor("ko");
    const needEn = await needFor("en");
    lines.push(`  labels       ko ${round(needKo)}px · en ${round(needEn)}px (full 단계 요구폭)`);
    if (Math.abs(needKo - needEn) > 12) {
      const roomy = needKo < needEn ? "ko" : "en"; // 이 언어면 라벨이 들어가는 폭
      const tight = roomy === "ko" ? "en" : "ko";
      app.style.width = `${Math.round((needKo + needEn) / 2)}px`;
      for (const [lang, want] of [
        [tight, "icons"],
        [roomy, "full"],
      ] as const) {
        st().setLanguage(lang);
        for (let i = 0; i < 8; i++) await settle();
        if (bar.dataset.density !== want) {
          fail(
            `[bar] ${lang} 로 바꾸자 단계가 ${bar.dataset.density} 다(${want} 여야 한다). ` +
              `언어가 바뀌면 라벨 폭이 달라지는데 예전 관측을 그대로 쓰고 있다.`,
          );
        }
      }
    }
    st().setLanguage(langBefore);
    await settle();

    // 넓히면 도로 펴진다(한 방향으로만 접히면 창을 키운 뒤에도 아이콘만 남는다).
    app.style.width = "1600px";
    for (let i = 0; i < 6 && bar.dataset.density !== "full"; i++) await settle();
    if (bar.dataset.density !== "full") {
      fail(`[bar] 창을 다시 넓혔는데 단계가 ${bar.dataset.density} 에 머문다(되돌아오지 않는다).`);
    }
    app.style.width = "";
    await settle();
  }

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
