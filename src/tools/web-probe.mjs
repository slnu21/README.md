// 웹 에디션 프로브 — Node 드라이버(W1 + W2).
//
// **진짜 웹 빌드**(`vite build --mode web`, 임시 폴더)를 vite preview 로 띄우고 Edge 헤드리스에 CDP 로 붙는다.
// 앱 안에 프로브 코드를 넣지 않는다 — 배포될 번들 그대로를 사용자처럼 다룬다. 미리보기 서버는 빌드가 만든 `_headers` 의
// 보안 헤더(**CSP 포함**)를 그대로 붙여 준다 — CSP 가 앱을 깨는지도 여기서 잡힌다(위반 이벤트 0 이어야 PASS).
//   W1: 파일 드롭 → 렌더(헤딩·mermaid·KaTeX·코드) → 웹 사이드바 목차·최근 파일 → 편집 → 리딩 모드 → 접기 → 좁은 폭 ·
//       데스크톱 전용 UI 부재 · 번들에 Tauri 플러그인 없음
//   W2: 배포 파일(_headers·_redirects·404·sitemap·robots·manifest·sw) · 루트 언어 이동 · hreflang/canonical · 첫 화면 = 앱
//       (설명 h2 는 스크롤해야 보임) · 랜딩별 기본 모드·견본·문구 고유 · URL 로 열기(로컬 픽스처 서버, CORS 있음/없음) ·
//       공유 링크 왕복·길이 초과 안내 · 편집 중 언어 전환(다른 URL 로 이동 + 미저장 보존) · 편집·열기·보기 전환은 새로고침 없음 ·
//       서비스 워커 오프라인(서버를 끈 뒤 새 탭)
//
// 실행: cd src; npm run probe:web
//       npm run probe:web -- --shot out.png   ← 문서를 연 화면 한 장
//       npm run probe:web -- --shots <폴더>   ← 라이트·다크·랜딩·랜딩 전체·모바일 390 스크린샷
// 새 의존성 0 — Node 24 내장 WebSocket·fetch·http.
import { build, preview } from "vite";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PORT = 5196; // 5197=rtl · 5198=layout · 5199=mermaid · 1420=tauri dev · 1430=dev:web
const FIX_PORT = 5194; // URL 로 열기 픽스처(다른 출처)
const CDP_PORT = 9336;
const TIMEOUT_MS = 300_000;
const SITE = "https://md.ondolworks.com";

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
};
const shotPath = process.argv.includes("--shot") ? resolve(process.cwd(), argOf("--shot") ?? "web-probe.png") : null;
const shotsDir = process.argv.includes("--shots") ? resolve(process.cwd(), argOf("--shots") ?? "web-shots") : null;

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

// 1×1 PNG
const DOT_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

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
  const listeners = new Set();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) pending.get(m.id)(m), pending.delete(m.id);
    else if (m.method) for (const l of listeners) l(m);
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
      sleep(30_000).then(() => ({ error: { message: `CDP 응답 없음: ${method}` } })),
    ]);
    if (m.error) throw new Error(m.error.message);
    return m.result;
  };
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  return { send, evaluate, on: (f) => listeners.add(f), close: () => ws.close() };
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

/** `_headers` 에서 경로 패턴 하나의 헤더 묶음. */
function headersFor(text, pattern) {
  const out = {};
  let on = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      on = line.trim() === pattern;
      continue;
    }
    if (!on) continue;
    const i = line.indexOf(":");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// CSP 위반 수집 — 모든 새 문서에 먼저 심는다(앱 번들에는 없다).
const CSP_HOOK = `window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI), true);`;

async function main() {
  const outDir = mkdtempSync(resolve(tmpdir(), "web-probe-build-"));
  const profile = mkdtempSync(resolve(tmpdir(), "web-probe-prof-"));
  let server = null;
  let fixture = null;
  let child = null;
  const sessions = [];
  const results = [];
  const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
  const cspAll = [];

  try {
    await build({ configFile: resolve(ROOT, "vite.config.ts"), root: ROOT, mode: "web", logLevel: "warn", build: { outDir, emptyOutDir: true } });

    // ── 산출물 ──
    const js = readdirSync(join(outDir, "assets")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(outDir, "assets", f), "utf8")).join("\n");
    check("번들에 Tauri 플러그인(dialog·opener) 호출이 없다", !/plugin:dialog|plugin:opener/.test(js));
    const file = (p) => (existsSync(join(outDir, p)) ? readFileSync(join(outDir, p), "utf8") : "");
    const headers = file("_headers");
    const all = headersFor(headers, "/*");
    check(
      "_headers — CSP·nosniff·Referrer-Policy·자산 immutable·sw no-cache",
      all["Content-Security-Policy"]?.includes("script-src 'self'") &&
        all["X-Content-Type-Options"] === "nosniff" &&
        all["Referrer-Policy"] === "strict-origin-when-cross-origin" &&
        headersFor(headers, "/assets/*")["Cache-Control"] === "public, max-age=31536000, immutable" &&
        headersFor(headers, "/sw.js")["Cache-Control"] === "no-cache",
    );
    check("_redirects — 언어 없는 랜딩 → /en/", file("_redirects").includes("/mermaid-preview/  /en/mermaid-preview/  301"));
    check("404.html(noindex)·robots.txt(sitemap)", file("404.html").includes("noindex") && file("robots.txt").includes(`Sitemap: ${SITE}/sitemap.xml`));
    check("sitemap.xml — 8 URL", (file("sitemap.xml").match(/<loc>/g) ?? []).length === 8);
    const mf = (() => {
      try {
        return JSON.parse(file("manifest-ko.webmanifest"));
      } catch {
        return null;
      }
    })();
    check("manifest — 언어별 start_url · .md file_handlers · 아이콘 512", mf?.start_url === "/ko/" && mf?.file_handlers?.[0]?.accept?.["text/markdown"]?.includes(".md") && existsSync(join(outDir, "icon-512.png")));
    const sw = file("sw.js");
    const pre = (() => {
      try {
        return JSON.parse(/const PRECACHE = (\[.*\]);/.exec(sw)?.[1] ?? "[]");
      } catch {
        return [];
      }
    })();
    check("sw.js — 페이지·앱 자산 미리 받기 목록", pre.includes("/en/") && pre.includes("/ko/mermaid-preview/") && pre.some((p) => /^\/assets\/index-.*\.js$/.test(p)), `${pre.length}개`);

    // 랜딩 문구 — title·h1·description 이 8장 모두 다르다(같은 앱, 다른 소개)
    const pages = ["en", "ko"].flatMap((l) => ["", "markdown-viewer/", "mermaid-preview/", "readme-preview/"].map((s) => `${l}/${s}`));
    const meta = pages.map((p) => {
      const h = file(`${p}index.html`);
      return {
        p,
        title: /<title>(.*?)<\/title>/.exec(h)?.[1],
        h1: /<h1>(.*?)<\/h1>/.exec(h)?.[1],
        desc: /name="description" content="(.*?)"/.exec(h)?.[1],
        canon: /rel="canonical" href="(.*?)"/.exec(h)?.[1],
      };
    });
    const uniq = (k) => new Set(meta.map((m) => m[k])).size === meta.length && meta.every((m) => m[k]);
    check("랜딩 8장 — title·h1·description 이 모두 다르다", uniq("title") && uniq("h1") && uniq("desc"));
    check("랜딩 8장 — self-canonical", meta.every((m) => m.canon === `${SITE}/${m.p}`));

    // ── 서버: 미리보기(+ _headers 보안 헤더, CSP 에 픽스처 출처만 더함) · 픽스처(다른 출처) ──
    const fixOrigin = `http://127.0.0.1:${FIX_PORT}`;
    const previewHeaders = { ...all, "Content-Security-Policy": all["Content-Security-Policy"].replace("connect-src 'self' https:", `connect-src 'self' https: ${fixOrigin}`) };
    server = await preview({
      configFile: resolve(ROOT, "vite.config.ts"),
      root: ROOT,
      mode: "web",
      logLevel: "warn",
      build: { outDir },
      preview: { port: PORT, strictPort: true, host: "127.0.0.1", open: false, headers: previewHeaders },
    });
    fixture = createServer((req, res) => {
      const cors = { "Access-Control-Allow-Origin": "*" };
      if (req.url === "/repo/README.md") {
        res.writeHead(200, { ...cors, "Content-Type": "text/plain; charset=utf-8" });
        res.end("# Fixture README\n\n![dot](img/dot.png)\n\n## From a link\n\nOpened with ?url=.\n");
      } else if (req.url === "/repo/img/dot.png") {
        res.writeHead(200, { ...cors, "Content-Type": "image/png" });
        res.end(DOT_PNG);
      } else if (req.url === "/nocors.md") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("# no cors");
      } else {
        res.writeHead(404, cors);
        res.end();
      }
    });
    await new Promise((r) => fixture.listen(FIX_PORT, "127.0.0.1", r));

    const base = `http://127.0.0.1:${PORT}`;
    child = spawn(
      findBrowser(),
      ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1", "--hide-scrollbars", "--lang=en-US", "--accept-lang=en-US", `--remote-debugging-port=${CDP_PORT}`, "--window-size=1400,900", `--user-data-dir=${profile}`, "about:blank"],
      { stdio: "ignore" },
    );
    let browserWs = null;
    for (let t = Date.now(); !browserWs && Date.now() - t < 20_000; ) {
      try {
        browserWs = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl;
      } catch {
        await sleep(100);
      }
    }
    if (!browserWs) throw new Error("브라우저 원격 디버깅이 응답하지 않는다");
    const browser = cdpSession(browserWs);

    /** 새 탭(선택: 깨끗한 저장소의 별도 컨텍스트) — CSP 수집기를 먼저 심고 이동한다. */
    async function openPage(url, { fresh = false, width = 1400, height = 900, mobile = false } = {}) {
      const ctx = fresh ? (await browser.send("Target.createBrowserContext", {})).browserContextId : undefined;
      const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", ...(ctx ? { browserContextId: ctx } : {}) });
      const s = cdpSession(`ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}`);
      sessions.push({ s, targetId });
      await s.send("Page.enable");
      await s.send("Page.addScriptToEvaluateOnNewDocument", { source: CSP_HOOK });
      await s.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await s.send("Page.navigate", { url });
      s.targetId = targetId;
      return s;
    }
    const closePage = async (s) => {
      try {
        cspAll.push(...((await s.evaluate("window.__csp ?? []")) ?? []));
      } catch {
        /* 닫힘 */
      }
      await browser.send("Target.closeTarget", { targetId: s.targetId }).catch(() => {});
      s.close();
    };
    const shot = async (s, name, opts = {}) => {
      if (!shotsDir) return;
      const r = await s.send("Page.captureScreenshot", { format: "png", ...opts });
      writeFileSync(join(shotsDir, name), Buffer.from(r.data, "base64"));
    };
    if (shotsDir) mkdirSync(shotsDir, { recursive: true });

    async function runCommand(s, label) {
      await s.evaluate("document.activeElement?.blur?.(); true");
      await s.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "P", code: "KeyP", windowsVirtualKeyCode: 80, modifiers: 10 });
      await s.send("Input.dispatchKeyEvent", { type: "keyUp", key: "P", code: "KeyP", windowsVirtualKeyCode: 80, modifiers: 10 });
      await until(s.evaluate, "!!document.querySelector('.palette-input')", 3000);
      await s.send("Input.insertText", { text: label });
      await sleep(150);
      await s.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await s.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    }
    const dropDoc = (s, text, name) =>
      s.evaluate(`(() => {
        const dt = new DataTransfer();
        dt.items.add(new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, { type: "text/markdown" }));
        const fire = (type) => document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        fire("dragenter"); fire("dragover"); fire("drop");
        return true;
      })()`);
    const frame = "document.querySelector('.pane-a .preview-frame')?.contentDocument";

    // ── 루트 → 언어 페이지 ──
    const s = await openPage(`${base}/`);
    const ev = s.evaluate;
    check("루트(/)가 브라우저 언어 페이지(/en/)로 옮긴다", await until(ev, "location.pathname === '/en/'"), await ev("location.href + ' ' + navigator.language"));
    check("웹 셸이 뜬다(.app.edition-web)", await until(ev, "!!document.querySelector('.app.edition-web')"));
    const alt = await ev(`[...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang + '=' + l.getAttribute('href')).join(' ')`);
    check(
      "hreflang ko·en·x-default + self-canonical",
      alt === `en=${SITE}/en/ ko=${SITE}/ko/ x-default=${SITE}/en/` && (await ev("document.querySelector('link[rel=canonical]').href")) === `${SITE}/en/`,
      alt + " | " + (await ev("document.querySelector('link[rel=canonical]').href")),
    );

    // 첫 화면 = 앱만, 설명은 스크롤하면
    const fold = await ev(`(() => {
      const vh = innerHeight; const app = document.querySelector('.app').getBoundingClientRect();
      const h2 = [...document.querySelectorAll('#web-intro h2')].map(h => h.getBoundingClientRect().top);
      const hint = document.querySelector('.wi-hint')?.getBoundingClientRect();
      return { vh, appTop: app.top, appH: Math.round(app.height), firstH2: Math.min(...h2), n: h2.length, h1: document.querySelector('#web-intro h1')?.getBoundingClientRect().top,
               hint: hint ? hint.bottom <= vh && hint.top > vh - 60 : false, sx: document.documentElement.scrollWidth <= innerWidth };
    })()`);
    check("첫 화면 = 앱이 뷰포트를 정확히 채운다", fold.appTop === 0 && fold.appH === fold.vh, JSON.stringify(fold));
    check("첫 화면에 설명 h1·h2 가 없다(모두 뷰포트 아래)", fold.n >= 5 && fold.firstH2 >= fold.vh && fold.h1 >= fold.vh);
    check("첫 화면 하단에 '아래에 설명' 힌트 · 가로 넘침 없음", fold.hint && fold.sx);
    await ev("window.scrollTo(0, innerHeight); true");
    check("스크롤하면 설명 h2 가 보인다", await until(ev, "[...document.querySelectorAll('#web-intro h2')].some(h => { const r = h.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && getComputedStyle(h).visibility !== 'hidden' })", 3000));
    check("설명 본문 — Ondol Works·Store 링크", await ev("!!document.querySelector('#web-intro a[href=\"https://ondolworks.com\"]') && !!document.querySelector('#web-intro a[href*=\"apps.microsoft.com\"]')"));
    await ev("window.scrollTo(0, 0); true");

    check("Tauri 전역이 없다", await ev("!('__TAURI_INTERNALS__' in window)"));
    check("창 버튼(.wctl)이 없다", await ev("!document.querySelector('.wctl')"));
    check("워크스페이스 탭·검색창이 없다", await ev("!document.querySelector('.sidebar-tabs') && !document.querySelector('.search-wrap')"));
    check("받은 문서함 종이 없다", await ev("!document.querySelector('.inbox-wrap, .inbox-btn, [aria-label*=\"inbox\" i]')"));
    const slotSize = "(() => { const r = document.querySelector('.wsb-slot')?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null })()";
    const slot = await ev(slotSize);
    check("광고 자리가 300×250 으로 예약돼 있다(빈 문서)", slot && slot[0] === 300 && slot[1] === 250, JSON.stringify(slot));
    check("사이드바 — Store 링크 + Ondol Works 브랜드 링크", await ev("!!document.querySelector('.wsb a[href*=\"apps.microsoft.com/detail/9N9QMXQPND3H\"]') && !!document.querySelector('.wsb a.wsb-brand[href=\"https://ondolworks.com\"]')"));

    // 드롭 — 사용자가 탐색기에서 끌어다 놓는 것과 같은 이벤트 경로. 새로고침 없음을 표식으로 잰다.
    await ev("window.__mark = 1");
    await dropDoc(s, FIXTURE, "web-probe.md");
    check("드롭한 문서가 탭으로 열린다", await until(ev, "[...document.querySelectorAll('.tab .tname')].some(e => e.textContent === 'web-probe.md')"));
    check("미리보기에 h1 이 그려진다", await until(ev, `${frame}?.querySelector('h1')?.textContent.includes('웹 프로브 문서')`));
    check("KaTeX 수식이 그려진다", await until(ev, `!!${frame}?.querySelector('.katex')`));
    check("mermaid 다이어그램이 SVG 로 그려진다", await until(ev, `!!${frame}?.querySelector('svg[id^="mmd"], .mermaid svg, svg[aria-roledescription]')`, 25_000));
    check("코드 하이라이트가 붙는다", await until(ev, `!!${frame}?.querySelector('pre code .hljs-keyword, pre code.hljs')`));
    check("미리보기 iframe 의 스크롤이 페이지로 사슬을 넘기지 않는다(overscroll contain)", await until(ev, `getComputedStyle(${frame}.documentElement).overscrollBehaviorY === 'contain'`, 3000));

    const toc = await ev(`(() => ({ side: document.querySelectorAll('.wsb-toc button').length, doc: ${frame}?.querySelectorAll('h1,h2,h3,h4,h5,h6').length }))()`);
    check("사이드바 목차 = 문서 헤딩 수", toc && toc.side > 0 && toc.side === toc.doc, JSON.stringify(toc));
    await ev("[...document.querySelectorAll('.wsb-toc button')].pop()?.click()");
    check("목차 클릭이 미리보기를 스크롤한다", await until(ev, "(document.querySelector('.pane-a .preview-frame')?.contentWindow?.scrollY ?? 0) > 100"), await ev("JSON.stringify({fy: document.querySelector('.pane-a .preview-frame')?.contentWindow?.scrollY, wy: scrollY})"));
    const yToc = await ev("scrollY");
    check("최근 파일에 들어간다", await until(ev, "[...document.querySelectorAll('.wsb-recent button')].some(e => e.textContent.includes('web-probe.md'))"));
    const slot2 = await ev(slotSize);
    check("문서를 연 뒤에도 광고 자리 크기가 그대로다", slot2 && slot2[0] === 300 && slot2[1] === 250, JSON.stringify(slot2));

    // 편집
    await ev("(() => { const c = document.querySelector('.editor .cm-content'); c?.focus(); return !!c })()");
    await s.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "End", code: "End", windowsVirtualKeyCode: 35, modifiers: 2 });
    await s.send("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End", windowsVirtualKeyCode: 35, modifiers: 2 });
    await s.send("Input.insertText", { text: "\n\n## 새로 친 절\n" });
    check("편집이 미리보기에 반영된다", await until(ev, `[...(${frame}?.querySelectorAll('h2') ?? [])].some(h => h.textContent.includes('새로 친 절'))`));
    check("편집하면 탭에 미저장 표시", await ev("!!document.querySelector('.tab.active .dirty')"));
    check("목차가 편집을 따라온다", await until(ev, "[...document.querySelectorAll('.wsb-toc button')].some(b => b.textContent.includes('새로 친 절'))"));

    check("목차 이동·편집이 바깥 페이지를 굴리지 않는다(앱이 첫 화면에 그대로)", yToc === 0 && (await ev("scrollY")) === 0, JSON.stringify({ afterToc: yToc, afterEdit: await ev("scrollY") }));

    if (shotPath) {
      const r = await s.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(shotPath, Buffer.from(r.data, "base64"));
    }
    await shot(s, "web-desktop-light.png");
    const themeBtn = (icon) => `(() => { const b = [...document.querySelectorAll('.titlebar button')].find(x => x.querySelector('use[href="#i-${icon}"]')); b?.click(); return !!b })()`;
    if (shotsDir && (await ev(themeBtn("moon")))) {
      await sleep(600);
      await shot(s, "web-desktop-dark.png");
      await ev(themeBtn("sun"));
      await sleep(300);
    }

    // 공유 링크 — 명령 팔레트로 만들고, 새 탭에서 연다(왕복)
    await runCommand(s, "Copy share link");
    check("공유 링크 대화상자가 링크를 보여 준다", await until(ev, "(document.querySelector('.wsb-share .modal-input')?.value ?? '').includes('#n=web-probe.md&md=')", 8000), await ev("JSON.stringify({pal: !!document.querySelector('.palette'), modal: document.querySelector('.modal')?.textContent?.slice(0,200), val: document.querySelector('.wsb-share .modal-input')?.value?.slice(0,80), act: document.activeElement?.className})"));
    const shareUrl = await ev("document.querySelector('.wsb-share .modal-input')?.value");
    await ev("[...document.querySelectorAll('.wsb-share button')].pop()?.click(); true");
    {
      const s2 = await openPage(shareUrl ?? `${base}/en/`, { fresh: true });
      const f2 = "document.querySelector('.pane-a .preview-frame')?.contentDocument";
      check(
        "공유 링크 왕복 — 새 브라우저(빈 저장소)에서 같은 문서(편집분 포함)가 열린다",
        await until(s2.evaluate, `${f2}?.querySelector('h1')?.textContent.includes('웹 프로브 문서') && [...${f2}.querySelectorAll('h2')].some(h => h.textContent.includes('새로 친 절'))`, 20_000),
      );
      check("공유 링크를 연 뒤 주소의 해시를 걷는다(새로고침이 덮어 열지 않게)", await until(s2.evaluate, "location.hash === '' && [...document.querySelectorAll('.tab .tname')].some(e => e.textContent === 'web-probe.md')", 3000));
      // 길이 초과 — 압축이 안 되는 긴 문서
      let rnd = "";
      let x = 7;
      for (let i = 0; i < 60_000; i++) rnd += String.fromCharCode(33 + (((x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 16) % 90));
      await dropDoc(s2, `# big\n\n${rnd}`, "big.md");
      await until(s2.evaluate, "[...document.querySelectorAll('.tab .tname')].some(e => e.textContent === 'big.md') && document.querySelector('.tab.active .tname')?.textContent === 'big.md'");
      await runCommand(s2, "Copy share link");
      check("공유 링크 길이 초과 — 길이와 상한을 알려 준다", await until(s2.evaluate, "/too long for a link: [\\d,]+ characters .* limit is 32,000/.test(document.querySelector('.modal[role=alertdialog] .modal-msg')?.textContent ?? '')", 8000));
      // 손상된 공유 링크
      await s2.evaluate("location.hash = 'n=x.md&md=AAAA_broken'; true");
      check("손상된 공유 링크 — 친절한 안내(새로고침 없이 hashchange)", await until(s2.evaluate, "[...document.querySelectorAll('.modal[role=alertdialog] .modal-msg')].some(m => /incomplete or damaged/.test(m.textContent))", 5000));
      await closePage(s2);
    }

    // URL 로 열기 — ?url= (CORS 있음: 렌더 + 상대 이미지 / 없음: 안내) · 앱 안에서 대화상자로(새로고침 없음)
    {
      const s3 = await openPage(`${base}/en/readme-preview/?url=${encodeURIComponent(`${fixOrigin}/repo/README.md`)}`, { fresh: true });
      const f3 = "document.querySelector('.pane-a .preview-frame')?.contentDocument";
      check("?url= — 다른 출처의 마크다운이 탭으로 열린다", await until(s3.evaluate, `${f3}?.querySelector('h1')?.textContent === 'Fixture README'`, 15_000));
      check("?url= — 상대경로 이미지를 같은 출처에서 받아 그린다", await until(s3.evaluate, `(${f3}?.querySelector('img')?.getAttribute('src') ?? '').startsWith('data:image/png')`, 10_000));
      check("?url= 이 있으면 랜딩 견본 대신 그 문서(README 랜딩은 편집 모드)", await s3.evaluate("document.querySelectorAll('.tab').length === 1 && !document.querySelector('.split.reader')"));
      await s3.evaluate("window.__mark = 3");
      await runCommand(s3, "Open from URL");
      await until(s3.evaluate, "!!document.querySelector('.modal[role=dialog] .modal-input')", 3000);
      await s3.send("Input.insertText", { text: `${fixOrigin}/nocors.md` });
      await s3.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await s3.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      check("CORS 없는 원본 — 친절한 안내(이유와 대안)", await until(s3.evaluate, "/CORS/.test(document.querySelector('.modal[role=alertdialog] .modal-msg')?.textContent ?? '')", 10_000));
      check("앱 안의 URL 열기는 새로고침하지 않는다", await s3.evaluate("window.__mark === 3"));
      await closePage(s3);
      const s4 = await openPage(`${base}/ko/?url=${encodeURIComponent("http://example.com/a.md")}`, { fresh: true });
      check("https 아닌 주소 — 한국어 안내", await until(s4.evaluate, "/https:\\/\\/ 링크만/.test(document.querySelector('.modal[role=alertdialog] .modal-msg')?.textContent ?? '')", 8000));
      await closePage(s4);
    }

    // 랜딩 — 같은 앱, 다른 기본 모드·견본·언어(깨끗한 저장소마다)
    {
      const l1 = await openPage(`${base}/ko/mermaid-preview/`, { fresh: true });
      const f = "document.querySelector('.pane-a .preview-frame')?.contentDocument";
      check("ko 랜딩 — 첫 페인트부터 한국어 UI(html lang·언어 단추)", await until(l1.evaluate, "document.documentElement.lang === 'ko' && document.querySelector('.seg.lang button[aria-pressed=true]')?.textContent.trim() === '한'"));
      check("mermaid 랜딩 — 견본 문서가 편집 모드로 열리고 다이어그램이 그려진다", await until(l1.evaluate, `[...document.querySelectorAll('.tab .tname')].some(e => e.textContent === 'mermaid-견본.md') && !document.querySelector('.split.reader') && ${f}?.querySelectorAll('svg[aria-roledescription]').length >= 2`, 25_000));
      await shot(l1, "landing-ko-mermaid.png");
      if (shotsDir) {
        const h = await l1.evaluate("Math.ceil(document.documentElement.scrollHeight)");
        await shot(l1, "landing-ko-mermaid-full.png", { captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1400, height: h, scale: 1 } });
      }
      await closePage(l1);
      const l2 = await openPage(`${base}/en/markdown-viewer/`, { fresh: true });
      check("viewer 랜딩 — 견본이 리딩 모드로 열린다", await until(l2.evaluate, "[...document.querySelectorAll('.tab .tname')].some(e => e.textContent === 'welcome.md') && !!document.querySelector('.split.reader')", 15_000));
      await l2.evaluate("window.__mark = 9");
      await l2.evaluate("(() => { const b = [...document.querySelectorAll('.titlebar .tbtn')].find(x => x.querySelector('use[href=\"#i-read\"], use[*|href=\"#i-read\"]')); b?.click(); return !!b })()");
      check("보기 전환(리딩 끄기)은 새로고침하지 않는다", await until(l2.evaluate, "!document.querySelector('.split.reader') && window.__mark === 9", 5000));
      await closePage(l2);
      const m = await openPage(`${base}/en/mermaid-preview/`, { fresh: true, width: 390, height: 844, mobile: true });
      check("모바일 390 — 앱이 첫 화면을 채우고 가로 넘침이 없다", await until(m.evaluate, `!!document.querySelector('.pane-a .preview-frame')?.contentDocument?.querySelector('svg[aria-roledescription]') && document.querySelector('.app').getBoundingClientRect().height === innerHeight && document.documentElement.scrollWidth <= 390`, 25_000), await m.evaluate("JSON.stringify({h: document.querySelector('.app').getBoundingClientRect().height, ih: innerHeight, sw: document.documentElement.scrollWidth, svg: !!document.querySelector('.pane-a .preview-frame')?.contentDocument?.querySelector('svg[aria-roledescription]'), tabs: [...document.querySelectorAll('.tab .tname')].map(e=>e.textContent)})"));
      await shot(m, "mobile-390.png");
      await closePage(m);
    }

    // 리딩 모드 · 열기 · 언어 전환(편집 보존) — 메인 탭
    await ev("(() => { const b = [...document.querySelectorAll('.titlebar .tbtn')].find(x => x.querySelector('use[href=\"#i-read\"], use[*|href=\"#i-read\"]')); if (b && !document.querySelector('.split.reader')) b.click(); return true })()");
    check("리딩 모드로 전환된다(새로고침 없음)", await until(ev, "!!document.querySelector('.split.reader') && window.__mark === 1", 5_000));
    await dropDoc(s, "# 둘째 문서\n", "second.md");
    check("두 번째 파일 열기도 새로고침하지 않는다", await until(ev, "[...document.querySelectorAll('.tab .tname')].some(e => e.textContent === 'second.md') && window.__mark === 1"));
    await ev("[...document.querySelectorAll('.tab')].find(t => t.textContent.includes('web-probe.md'))?.click(); true");
    await until(ev, "document.querySelector('.tab.active .tname')?.textContent === 'web-probe.md'", 3000);
    await ev("[...document.querySelectorAll('.seg.lang button')].find(b => b.textContent.trim() === '한')?.click()");
    check("언어 전환 = 다른 언어 URL 로 이동(/ko/)", await until(ev, "location.pathname === '/ko/' && window.__mark === undefined && document.documentElement.lang === 'ko'", 15_000), await ev("location.href + ' mark=' + window.__mark + ' lang=' + document.documentElement.lang"));
    check(
      "언어 전환 뒤 — 미저장 편집·탭·활성 탭이 그대로(미저장 표시 포함)",
      await until(ev, "document.querySelector('.tab.active .tname')?.textContent === 'web-probe.md' && !!document.querySelector('.tab.active .dirty') && (document.querySelector('.editor .cm-content, .split')?.ownerDocument && [...document.querySelectorAll('.tab .tname')].some(e => e.textContent === 'second.md'))", 15_000),
    );
    check("언어 전환 뒤 — 편집한 절이 미리보기에 남아 있다", await until(ev, `[...(${frame}?.querySelectorAll('h2') ?? [])].some(h => h.textContent.includes('새로 친 절'))`, 10_000));

    // 사이드바 접기
    await ev("document.querySelector('.wsb-toggle')?.click()");
    check("접으면 사이드바와 광고 자리가 사라진다", await until(ev, "!document.querySelector('.wsb') && !document.querySelector('.wsb-slot')", 5_000));
    await ev("document.querySelector('.wsb-toggle')?.click()");
    check("다시 펴면 돌아온다", await until(ev, "!!document.querySelector('.wsb-slot')", 5_000));

    // 새 탭(같은 프로필) — 최근 파일이 IndexedDB 에서 돌아온다
    {
      const s5 = await openPage(`${base}/en/`);
      check("새 탭에서도 최근 파일이 남아 있다(IndexedDB)", await until(s5.evaluate, "[...document.querySelectorAll('.wsb-recent button')].some(e => e.textContent.includes('web-probe.md'))"));
      await closePage(s5);
    }

    // 좁은 폭 — 사이드바 숨김
    await s.send("Emulation.setDeviceMetricsOverride", { width: 600, height: 900, deviceScaleFactor: 1, mobile: false });
    check("좁은 폭(600px)에서 사이드바가 숨는다", await until(ev, "(() => { const e = document.querySelector('.wsb'); return !e || getComputedStyle(e).display === 'none' })()", 5_000));
    check("좁은 폭에서 가로 넘침이 없다", await ev("document.documentElement.scrollWidth <= 600"));

    // 서비스 워커 — 설치(미리 받기 끝)를 기다린 뒤 서버를 끄고 새 탭으로
    const swState = await ev(`(async () => {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 20000))]);
      if (!reg) return { ok: false };
      for (let i = 0; i < 200 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100));
      const keys = await caches.keys(); const c = keys.find(k => k.startsWith('readme-md-'));
      return { ok: !!navigator.serviceWorker.controller, n: c ? (await (await caches.open(c)).keys()).length : 0 };
    })()`);
    check("서비스 워커가 페이지를 맡고 미리 받기를 마친다", swState?.ok && swState.n === pre.length, JSON.stringify({ ...swState, want: pre.length }));
    await server.close();
    server = null;
    await new Promise((r) => fixture.close(r));
    fixture = null;
    {
      const off = await openPage(`${base}/en/mermaid-preview/`);
      const fo = "document.querySelector('.pane-a .preview-frame')?.contentDocument";
      check("오프라인(서버 꺼짐) — 앱이 뜨고 문서·mermaid 가 그려진다", await until(off.evaluate, `!!document.querySelector('.app.edition-web') && !!${fo}?.querySelector('h1') && !!${fo}?.querySelector('svg[aria-roledescription]')`, 30_000));
      check("오프라인 — 설명 본문도 캐시에서", await off.evaluate("!!document.querySelector('#web-intro h1')"));
      await closePage(off);
    }

    cspAll.push(...((await ev("window.__csp ?? []")) ?? []));
    check("CSP 위반 0건(모든 탭)", cspAll.length === 0, cspAll.slice(0, 5).join(" | "));
    s.close();
    browser.close();
  } finally {
    try {
      child?.kill();
    } catch {
      /* 끝남 */
    }
    await server?.close?.();
    if (fixture) await new Promise((r) => fixture.close(r));
    await sleep(500);
    for (const d of [outDir, profile]) {
      try {
        rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* temp 는 OS 가 정리한다 */
      }
    }
  }

  console.log("web probe · Edge headless · 1400x900 (web build + _headers CSP)");
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  if (shotPath) console.log(existsSync(shotPath) ? `  스크린샷 ${shotPath}` : `  스크린샷 실패 (${shotPath})`);
  if (shotsDir) console.log(`  스크린샷 폴더 ${shotsDir}`);
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
