// 캔버스 프로브 — Node 드라이버(ADR 0004).
//
// Vite 개발 서버 + 헤드리스 Edge 로 app/dev/canvas-probe.html 을 띄운다. 그 페이지는 **진짜 앱 셸**을 마운트하고
// docs/samples/map.canvas 를 탭으로 연 뒤, 사람처럼 포인터를 몰아 카드·선을 다룬다(층 순서 히트 테스트 · 연결 ·
// 끝점 옮기기 · 이동 · 확대 단계 · text 노드 정화 · 파일 없음 · 더블클릭 열기 · 모르는 필드 보존).
//
// 그리고 **빈 렌더 회귀**를 픽셀로 잰다 — 시안에서 transform:scale 된 world 안의 flex+overflow 가 노드 묶음을 통째로 안
// 그렸다(히트 테스트는 통과하는데 화면은 비어 있었다). 그래서 촬영 모드 스크린샷을 PNG 그대로 풀어(zlib 만 — 새 의존성 0)
// 카드 자리의 픽셀이 바탕과 다른지 본다.
//
// 실행: cd src; npm run probe:canvas   (-- --shot out.png 로 화면도 남긴다)
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = resolve(HERE, "../../docs/samples");
const FIXTURES = ["map.canvas", "annot-review.md", "rtl-persian.md"];
const PORT = 5195; // 5196=annot · 5197=rtl · 5198=layout · 5199=mermaid · 1420=tauri dev.
const TIMEOUT_MS = 120_000;
const W = 1600;
const H = 1000;

const shotArg = process.argv.indexOf("--shot");
const keepShot = shotArg !== -1 ? resolve(process.cwd(), process.argv[shotArg + 1] ?? "canvas-probe.png") : null;

function findBrowser() {
  if (process.env.PROBE_BROWSER) return process.env.PROBE_BROWSER;
  const c = [
    `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  ].find((p) => p && existsSync(p));
  if (!c) throw new Error("Edge/Chrome 을 찾지 못했다. PROBE_BROWSER 로 지정할 것.");
  return c;
}

const COMMON = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1"];

/** RGB(A) 8bit PNG 를 풀어 (x,y) 픽셀을 돌려주는 함수. 필터 5종(None·Sub·Up·Average·Paeth). */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("PNG 아님");
  let p = 8;
  let w = 0;
  let h = 0;
  let ch = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error("8bit 만");
      ch = { 2: 3, 6: 4 }[data[9]];
      if (!ch) throw new Error("RGB/RGBA 만");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, at: (x, y) => [out[y * stride + x * ch], out[y * stride + x * ch + 1], out[y * stride + x * ch + 2]] };
}

/** CDP 로 붙어 하네스가 기하를 내놓을 때까지 기다린 뒤 화면을 찍는다. */
async function cdpShot(port) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let page = null;
  for (let i = 0; i < 300 && !page; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page" && t.url.includes("canvas-probe"));
    } catch {
      /* 아직 */
    }
    if (!page) await sleep(100);
  }
  if (!page) throw new Error("촬영 브라우저 CDP 응답 없음");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) pending.get(m.id)(m), pending.delete(m.id);
  };
  const send = (method, params = {}) => new Promise((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  let geom = null;
  for (let i = 0; i < 300 && !geom; i++) {
    const m = await send("Runtime.evaluate", { expression: "JSON.stringify(window.__canvasGeom ?? null)", returnByValue: true });
    geom = JSON.parse(m.result?.result?.value ?? "null");
    if (!geom) await sleep(100);
  }
  if (!geom) throw new Error("촬영 하네스가 기하를 내놓지 않았다");
  await sleep(300);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  ws.close();
  return { geom, png: Buffer.from(shot.result.data, "base64") };
}

async function main() {
  const files = Object.fromEntries(FIXTURES.map((f) => [f, readFileSync(resolve(SAMPLES, f), "utf8")]));
  let resolveResult;
  const resultPromise = new Promise((r) => (resolveResult = r));
  const server = await createServer({
    configFile: resolve(HERE, "../vite.config.ts"),
    root: resolve(HERE, ".."),
    logLevel: "warn",
    server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
    plugins: [
      {
        name: "canvas-probe",
        configureServer(s) {
          s.middlewares.use("/probe-fixture", (req, res) => {
            const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "";
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end(files[name] ?? "");
          });
          const post = (path, cb) =>
            s.middlewares.use(path, (req, res) => {
              let body = "";
              req.on("data", (c) => (body += c));
              req.on("end", () => {
                res.end("ok");
                try {
                  cb(JSON.parse(body));
                } catch (e) {
                  cb({ ok: false, failures: [`JSON 파싱 실패: ${e}`], lines: [] });
                }
              });
            });
          post("/probe-result", resolveResult);
        },
      },
    ],
  });
  await server.listen();
  const browser = findBrowser();
  const base = `http://127.0.0.1:${PORT}/app/dev/canvas-probe.html?demo=1&worker`;
  const profile = mkdtempSync(resolve(tmpdir(), "canvas-probe-"));
  const child = spawn(browser, [...COMMON, `--window-size=${W},${H}`, `--user-data-dir=${profile}`, base], { stdio: "ignore" });
  const timeout = (ms, what) => new Promise((_, j) => setTimeout(() => j(new Error(`${what} — ${ms / 1000}초 안에 응답이 없다`)), ms));
  try {
    const result = await Promise.race([resultPromise, timeout(TIMEOUT_MS, "프로브")]);
    child.kill();
    console.log(`canvas probe · ${browser.split("\\").pop()} headless · ${W}x${H}`);
    for (const l of result.lines ?? []) console.log(l);

    // ── 픽셀: 촬영 모드로 다시 띄워(CDP) 스크린샷 → 카드 자리가 바탕과 다른가 ──
    const failures = [...result.failures];
    const shotProfile = mkdtempSync(resolve(tmpdir(), "canvas-shot-"));
    const CDP = 9338;
    const shooter = spawn(browser, [...COMMON, "--hide-scrollbars", `--remote-debugging-port=${CDP}`, `--user-data-dir=${shotProfile}`, `--window-size=${W},${H}`, `${base.replace("&worker", "")}&shot=1`], { stdio: "ignore" });
    try {
      const shot = await Promise.race([cdpShot(CDP), timeout(60_000, "촬영")]);
      if (keepShot) writeFileSync(keepShot, shot.png);
      const img = decodePng(shot.png);
      const geom = shot.geom;
      const dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
      let painted = 0;
      for (const c of geom.cards) {
        // 4x4 묶음의 가운데 값(점무늬·안티에일리어싱에 흔들리지 않게)
        const px = [0, 1, 2].map((i) => {
          const vs = [];
          for (let dx = -2; dx < 2; dx++) for (let dy = -2; dy < 2; dy++) vs.push(img.at(Math.min(img.w - 1, Math.max(0, Math.round(c.x) + dx)), Math.min(img.h - 1, Math.max(0, Math.round(c.y) + dy)))[i]);
          return vs.sort((x, y) => x - y)[8];
        });
        // 반투명 카드(파일 없음)는 바탕과 섞인 색이 기대값이다. 화면 밖이면 맞춤 보기가 틀린 것.
        const want = c.want.map((v, i) => Math.round(v * c.alpha + geom.canvasBg[i] * (1 - c.alpha)));
        if (c.x < 0 || c.y < 0 || c.x >= img.w || c.y >= img.h) failures.push(`[픽셀] 카드 ${c.id} 가 화면 밖(${Math.round(c.x)},${Math.round(c.y)}) — 처음 열 때 전부 보이게 맞추지 않았다.`);
        else if (dist(px, want) <= 9 && dist(px, geom.canvasBg) > 9) painted++;
        else failures.push(`[픽셀] 카드 ${c.id} 자리(${Math.round(c.x)},${Math.round(c.y)})가 ${px} — 카드 배경 ${want} 이 아니다(캔버스 바탕 ${geom.canvasBg}) · 안 그려졌다.`);
      }
      console.log(`  ${"[픽셀]".padEnd(22)} 카드 ${geom.cards.length}장 중 ${painted}장이 바탕과 다른 색으로 칠해짐`);
      if (keepShot) console.log(`  스크린샷 ${keepShot}`);
    } catch (e) {
      failures.push(`[픽셀] ${e.message}`);
    } finally {
      shooter.kill();
    }
    try {
      rmSync(shotProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* temp */
    }
    if (!failures.length) {
      console.log("PASS");
      return 0;
    }
    console.log("");
    for (const f of failures) console.log(`  ${f}`);
    console.log(`\nFAIL: 불변식 ${failures.length}건 위반`);
    return 1;
  } finally {
    child.kill();
    await server.close();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* temp */
    }
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  },
);
