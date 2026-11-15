// 웹 에디션 프로브 — Node 드라이버(W1).
//
// **진짜 웹 빌드**(`vite build --mode web`, 임시 폴더)를 vite preview 로 띄우고 Edge 헤드리스에 CDP 로 붙는다.
// 앱 안에 프로브 코드를 넣지 않는다 — 배포될 번들 그대로를 사용자처럼 다룬다:
//   파일 드롭(DataTransfer) → 미리보기 렌더(헤딩·mermaid·KaTeX·코드) → 웹 사이드바 목차·최근 파일 →
//   목차 클릭 스크롤 → 편집(입력이 미리보기에 반영) → 리딩 모드 → 사이드바 접기(광고 자리도 사라짐) →
//   좁은 폭(사이드바 숨김) · 데스크톱 전용 UI 부재(창 버튼·워크스페이스 탭·검색) · 번들에 Tauri 플러그인 없음.
//
// 실행: cd src; npm run probe:web
//       npm run probe:web -- --shot out.png   ← 문서를 연 화면 스크린샷도 남긴다(육안 확인)
// 새 의존성 0 — Node 24 내장 WebSocket·fetch 를 쓴다(perf-app.mjs 와 같은 CDP 방식).
import { build, preview } from "vite";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PORT = 5196; // 5197=rtl · 5198=layout · 5199=mermaid · 1420=tauri dev · 1430=dev:web
const CDP_PORT = 9336;
const TIMEOUT_MS = 120_000;

const shotArg = process.argv.indexOf("--shot");
const shotPath = shotArg !== -1 ? resolve(process.cwd(), process.argv[shotArg + 1] ?? "web-probe.png") : null;

const FIXTURE = [
  "# 웹 프로브 문서",
  "",
  "첫 문단 — **굵게**와 `코드`.",
  "",
  "## 수식",
  "",
  "$$",
  "E = mc^2",
  "$$",
  "",
  "## 다이어그램",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[열기] --> B[읽기] --> C[고치기]",
  "```",
  "",
  "## 코드",
  "",
  "```js",
  "const answer = 42;",
  "```",
  "",
  ...Array.from({ length: 40 }, (_, i) => `줄 ${i + 1} — 스크롤을 만들기 위한 본문.\n`),
  "### 맨 아래 절",
  "",
  "끝.",
].join("\n");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  if (process.env.PROBE_BROWSER) return process.env.PROBE_BROWSER;
  const candidates = [
    `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error("Edge/Chrome 을 찾지 못했다. PROBE_BROWSER 로 실행 파일 경로를 지정할 것.");
  return found;
}

function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) pending.get(m.id)(m), pending.delete(m.id);
  };
  const ready = new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
    setTimeout(() => j(new Error("CDP 웹소켓이 열리지 않는다")), 10_000);
  });
  const send = async (method, params = {}) => {
    await ready;
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    const m = await Promise.race([
      new Promise((r) => pending.set(n, r)),
      sleep(20_000).then(() => ({ error: { message: `CDP 응답 없음: ${method}` } })),
    ]);
    if (m.error) throw new Error(m.error.message);
    return m.result;
  };
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

async function until(evaluate, expr, ms = 15_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expr)) return true;
    } catch {
      /* 페이지가 바뀌는 중 */
    }
    await sleep(50);
  }
  return false;
}

async function main() {
  const outDir = mkdtempSync(resolve(tmpdir(), "web-probe-build-"));
  const profile = mkdtempSync(resolve(tmpdir(), "web-probe-prof-"));
  let server = null;
  let child = null;
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

  try {
    await build({ configFile: resolve(ROOT, "vite.config.ts"), root: ROOT, mode: "web", logLevel: "warn", build: { outDir, emptyOutDir: true } });

    // 번들 검사 — 웹 빌드에 Tauri 플러그인 호출이 섞이면 alias 가 새는 것이다.
    const js = readdirSync(join(outDir, "assets")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(outDir, "assets", f), "utf8")).join("\n");
    check("번들에 Tauri 플러그인(dialog·opener) 호출이 없다", !/plugin:dialog|plugin:opener/.test(js));

    server = await preview({
      configFile: resolve(ROOT, "vite.config.ts"),
      root: ROOT,
      mode: "web",
      logLevel: "warn",
      build: { outDir },
      preview: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
    });

    const url = `http://127.0.0.1:${PORT}/`;
    child = spawn(
      findBrowser(),
      ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1", "--hide-scrollbars", `--remote-debugging-port=${CDP_PORT}`, "--window-size=1400,900", `--user-data-dir=${profile}`, url],
      { stdio: "ignore" },
    );

    let page = null;
    const deadline = Date.now() + 20_000;
    while (!page && Date.now() < deadline) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        page = list.find((t) => t.type === "page" && t.url.startsWith(url));
      } catch {
        /* 아직 */
      }
      if (!page) await sleep(100);
    }
    if (!page) throw new Error("브라우저 원격 디버깅이 응답하지 않는다");
    const s = cdpSession(page.webSocketDebuggerUrl);
    const ev = s.evaluate;

    check("웹 셸이 뜬다(.app.edition-web)", await until(ev, "!!document.querySelector('.app.edition-web')"));
    check("Tauri 전역이 없다", await ev("!('__TAURI_INTERNALS__' in window)"));
    check("창 버튼(.wctl)이 없다", await ev("!document.querySelector('.wctl')"));
    check("워크스페이스 탭·검색창이 없다", await ev("!document.querySelector('.sidebar-tabs') && !document.querySelector('.search-wrap')"));
    check("받은 문서함 종이 없다", await ev("!document.querySelector('.inbox-wrap, .inbox-btn, [aria-label*=\"inbox\" i]')"));
    const slot = await ev("(() => { const r = document.querySelector('.wsb-slot')?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null })()");
    check("광고 자리가 300×250 으로 예약돼 있다(빈 문서)", slot && slot[0] === 300 && slot[1] === 250, JSON.stringify(slot));
    check("데스크톱 앱 링크가 Store 를 가리킨다", await ev("!!document.querySelector('.wsb a[href*=\"apps.microsoft.com/detail/9N9QMXQPND3H\"]')"));

    // 파일 드롭 — 사용자가 탐색기에서 끌어다 놓는 것과 같은 이벤트 경로(window capture 리스너).
    await ev(`(() => {
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(FIXTURE)}], "web-probe.md", { type: "text/markdown" }));
      const fire = (type) => document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire("dragenter"); fire("dragover"); fire("drop");
      return true;
    })()`);
    const frame = "document.querySelector('.pane-a .preview-frame')?.contentDocument";
    check("드롭한 문서가 탭으로 열린다", await until(ev, "[...document.querySelectorAll('.tab .tname')].some(e => e.textContent === 'web-probe.md')"));
    check("미리보기에 h1 이 그려진다", await until(ev, `${frame}?.querySelector('h1')?.textContent.includes('웹 프로브 문서')`));
    check("KaTeX 수식이 그려진다", await until(ev, `!!${frame}?.querySelector('.katex')`));
    check("mermaid 다이어그램이 SVG 로 그려진다", await until(ev, `!!${frame}?.querySelector('svg[id^="mmd"], .mermaid svg, svg[aria-roledescription]')`, 25_000));
    check("코드 하이라이트가 붙는다", await until(ev, `!!${frame}?.querySelector('pre code .hljs-keyword, pre code.hljs')`));

    const toc = await ev(`(() => ({ side: document.querySelectorAll('.wsb-toc button').length, doc: ${frame}?.querySelectorAll('h1,h2,h3,h4,h5,h6').length }))()`);
    check("사이드바 목차 = 문서 헤딩 수", toc && toc.side > 0 && toc.side === toc.doc, JSON.stringify(toc));
    await ev("[...document.querySelectorAll('.wsb-toc button')].pop()?.click()");
    check("목차 클릭이 미리보기를 스크롤한다", await until(ev, "(document.querySelector('.pane-a .preview-frame')?.contentWindow?.scrollY ?? 0) > 100"));
    check("최근 파일에 들어간다", await until(ev, "[...document.querySelectorAll('.wsb-recent button')].some(e => e.textContent.includes('web-probe.md'))"));
    const slot2 = await ev("(() => { const r = document.querySelector('.wsb-slot')?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null })()");
    check("문서를 연 뒤에도 광고 자리 크기가 그대로다", slot2 && slot2[0] === 300 && slot2[1] === 250, JSON.stringify(slot2));

    // 편집 — 편집기 끝에 헤딩을 치면 미리보기·목차에 나타나고 탭이 미저장 표시가 된다.
    await ev("(() => { const c = document.querySelector('.editor .cm-content'); c?.focus(); return !!c })()");
    await s.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "End", code: "End", windowsVirtualKeyCode: 35, modifiers: 2 });
    await s.send("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End", windowsVirtualKeyCode: 35, modifiers: 2 });
    await s.send("Input.insertText", { text: "\n\n## 새로 친 절\n" });
    check("편집이 미리보기에 반영된다", await until(ev, `[...(${frame}?.querySelectorAll('h2') ?? [])].some(h => h.textContent.includes('새로 친 절'))`));
    check("편집하면 탭에 미저장 표시", await ev("!!document.querySelector('.tab.active .dirty')"));
    check("목차가 편집을 따라온다", await until(ev, "[...document.querySelectorAll('.wsb-toc button')].some(b => b.textContent.includes('새로 친 절'))"));

    if (shotPath) {
      const shot = await s.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    }

    // 리딩 모드
    await ev("document.querySelector('.titlebar button[aria-pressed][aria-label]:is([aria-label=\"Reading mode\"],[aria-label=\"리딩 모드\"])')?.click() ?? true");
    await ev("(() => { const b = [...document.querySelectorAll('.titlebar .tbtn')].find(x => x.querySelector('use[href=\"#i-read\"], use[*|href=\"#i-read\"]')); if (b && !document.querySelector('.split.reader')) b.click(); return true })()");
    check("리딩 모드로 전환된다", await until(ev, "!!document.querySelector('.split.reader')", 5_000));

    // 언어 전환 — 페이지를 새로고침하지 않고 사이드바 문구가 바뀌며 편집 상태(미저장)가 남는다.
    await ev("window.__probeMark = 1");
    await ev("[...document.querySelectorAll('.seg.lang button')].find(b => b.textContent.trim() === 'EN')?.click()");
    check("언어 전환이 새로고침 없이 반영된다", await until(ev, "window.__probeMark === 1 && document.documentElement.lang === 'en' && !!document.querySelector('.tab.active .dirty')", 5_000));

    // 사이드바 접기 — 광고 자리도 함께 사라진다.
    await ev("document.querySelector('.wsb-toggle')?.click()");
    check("접으면 사이드바와 광고 자리가 사라진다", await until(ev, "!document.querySelector('.wsb') && !document.querySelector('.wsb-slot')", 5_000));
    await ev("document.querySelector('.wsb-toggle')?.click()");
    check("다시 펴면 돌아온다", await until(ev, "!!document.querySelector('.wsb-slot')", 5_000));

    // 새 탭(같은 프로필) — 최근 파일이 IndexedDB 에서 돌아오고, 눌러서 다시 열린다(핸들 없는 문서는 내용 사본으로).
    // 지금 탭을 새로고침하지 않는 이유: 미저장 편집이 있어 beforeunload 가 막는다(그것도 의도된 동작이다).
    {
      const nt = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${url}`, { method: "PUT" })).json();
      const s2 = cdpSession(nt.webSocketDebuggerUrl);
      check("새 탭에서도 최근 파일이 남아 있다(IndexedDB)", await until(s2.evaluate, "[...document.querySelectorAll('.wsb-recent button')].some(e => e.textContent.includes('web-probe.md'))"));
      await s2.evaluate("[...document.querySelectorAll('.wsb-recent button')].find(e => e.textContent.includes('web-probe.md'))?.click()");
      check("최근 파일을 누르면 다시 열린다", await until(s2.evaluate, "document.querySelector('.pane-a .preview-frame')?.contentDocument?.querySelector('h1')?.textContent.includes('웹 프로브 문서')"));
      s2.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${nt.id}`).catch(() => {});
    }

    // 좁은 폭 — 사이드바 숨김.
    await s.send("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
    check("좁은 폭(600px)에서 사이드바가 숨는다", await until(ev, "(() => { const e = document.querySelector('.wsb'); return !e || getComputedStyle(e).display === 'none' })()", 5_000));
    check("좁은 폭에서 가로 넘침이 없다", await ev("document.documentElement.scrollWidth <= 600"));

    s.close();
  } finally {
    try {
      child?.kill();
    } catch {
      /* 끝남 */
    }
    await server?.close?.();
    await sleep(500);
    for (const d of [outDir, profile]) {
      try {
        rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* temp 는 OS 가 정리한다 */
      }
    }
  }

  console.log("web probe · Edge headless · 1400x900 (web build)");
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  if (shotPath) console.log(existsSync(shotPath) ? `  스크린샷 ${shotPath}` : `  스크린샷 실패 (${shotPath})`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `RESULT=FAIL (${failed})` : `RESULT=OK (${results.length})`);
  process.exit(failed ? 1 : 0);
}

const timer = setTimeout(() => {
  console.error(`프로브가 ${TIMEOUT_MS / 1000}초 안에 끝나지 않았다.`);
  process.exit(2);
}, TIMEOUT_MS);
timer.unref();
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
