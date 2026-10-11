// 성능 프로브 — Node 드라이버.
//
// 다른 프로브와 달리 **프로덕션 빌드**로 잰다: Vite build API 로 앱(index.html)과 하네스
// (app/dev/perf-probe.html)를 임시 폴더에 함께 빌드하고, vite preview 로 띄워 Edge 헤드리스를 붙인다.
// 개발 모드 React·변환 안 된 모듈로 재면 타자 지연 같은 숫자가 몇 배로 부풀어 의미가 없다.
//
// 재는 것: ① 번들 크기(앱 index.html 이 처음 싣는 JS·CSS, gzip) ② 브라우저 쪽 지표
// (app/dev/perfProbe.ts — 작은/큰 문서 열기 · 타자 지연 · 재렌더 · 다이어그램 갤러리)를 `--runs` 번
// 새 프로필로 반복해 항목별 중앙값. 판정은 tools/perf-budget.json(Rust 측정과 같은 파일).
//
// 새 npm 의존성 없음. 앱을 띄우지 않으므로 사용자 DB·WebView2 프로필을 건드리지 않는다.
//
// 실행: cd src; npm run probe:perf            (기본 3회)
//       npm run probe:perf -- --runs 5 --json out.json
import { build, preview } from "vite";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir, cpus } from "node:os";
import { checkBudget, medianOfRuns } from "./perf-budget.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PORT = 5197; // 5199=mermaid · 5198=layout · 1420=tauri dev. 겹치면 서로를 죽인다.
const RUN_TIMEOUT_MS = 180_000;
const FIXTURES = { "mermaid-gallery": resolve(ROOT, "../docs/samples/mermaid-gallery.md") };

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? dflt : process.argv[i + 1];
};
const RUNS = Math.max(1, Number(arg("--runs", 3)));
const JSON_OUT = arg("--json", null);

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

/** 앱 index.html 이 처음 싣는 자산(script·modulepreload·stylesheet)의 크기. 지연 청크(mermaid 등)는 빠진다. */
function bundleSizes(outDir) {
  const html = readFileSync(join(outDir, "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  let js = 0, jsGz = 0, css = 0, cssGz = 0;
  for (const ref of new Set(refs)) {
    const buf = readFileSync(join(outDir, ref));
    const gz = gzipSync(buf).length;
    if (ref.endsWith(".js")) (js += buf.length), (jsGz += gz);
    else (css += buf.length), (cssGz += gz);
  }
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else total += statSync(p).size;
    }
  };
  walk(join(outDir, "assets"));
  const kb = (n) => Math.round(n / 102.4) / 10;
  return {
    entry_js_kb: kb(js),
    entry_js_gz_kb: kb(jsGz),
    entry_css_gz_kb: kb(cssGz),
    entry_css_kb_info: kb(css),
    assets_total_kb_info: kb(total),
  };
}

async function runBrowserOnce(browser, url, waitResult) {
  const profile = mkdtempSync(resolve(tmpdir(), "perf-probe-"));
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--force-device-scale-factor=1",
      "--window-size=1600,1000",
      `--user-data-dir=${profile}`,
      url,
    ],
    { stdio: "ignore" },
  );
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`프로브가 ${RUN_TIMEOUT_MS / 1000}초 안에 결과를 보내지 않았다.`)), RUN_TIMEOUT_MS),
  );
  try {
    return await Promise.race([waitResult(), timeout]);
  } finally {
    child.kill();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* temp 프로필은 OS 가 정리한다 */
    }
  }
}

async function main() {
  const outDir = mkdtempSync(resolve(tmpdir(), "perf-build-"));
  const t0 = Date.now();
  await build({
    configFile: resolve(ROOT, "vite.config.ts"),
    root: ROOT,
    logLevel: "error",
    build: {
      outDir,
      emptyOutDir: true,
      chunkSizeWarningLimit: 1e9, // 앱 빌드의 기존 청크 경고는 여기서 소음일 뿐
      rollupOptions: { input: { index: resolve(ROOT, "index.html"), perf: resolve(ROOT, "app/dev/perf-probe.html") } },
    },
  });
  const buildSec = ((Date.now() - t0) / 1000).toFixed(1);
  const bundle = bundleSizes(outDir);

  // 결과 회신 대기열 — 실행마다 새 약속을 건다.
  let resolveResult = () => {};
  const nextResult = () => new Promise((r) => (resolveResult = r));

  const server = await preview({
    configFile: resolve(ROOT, "vite.config.ts"),
    root: ROOT,
    logLevel: "warn",
    build: { outDir },
    preview: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
    plugins: [
      {
        name: "perf-probe",
        configurePreviewServer(s) {
          s.middlewares.use("/probe-fixture", (req, res) => {
            const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "";
            const file = FIXTURES[name];
            if (!file) {
              res.statusCode = 404;
              return res.end();
            }
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end(readFileSync(file, "utf8"));
          });
          s.middlewares.use("/probe-result", (req, res) => {
            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", () => {
              res.end("ok");
              try {
                resolveResult(JSON.parse(body));
              } catch (e) {
                resolveResult({ ok: false, failures: [`판정 JSON 파싱 실패: ${e}`], lines: [], metrics: {} });
              }
            });
          });
        },
      },
    ],
  });

  const browser = findBrowser();
  const url = `http://127.0.0.1:${PORT}/app/dev/perf-probe.html?demo=1&worker`;
  const runs = [];
  const failures = [];
  let lines = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      const res = await runBrowserOnce(browser, url, nextResult);
      runs.push(res.metrics ?? {});
      failures.push(...(res.failures ?? []).map((f) => `run ${i + 1}: ${f}`));
      lines = res.lines ?? lines;
    }
  } finally {
    await new Promise((r) => server.httpServer.close(r));
    try {
      rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* OS 가 정리한다 */
    }
  }

  const frontend = medianOfRuns(runs);
  const budget = JSON.parse(readFileSync(resolve(HERE, "perf-budget.json"), "utf8"));
  const over = [...checkBudget(budget, "frontend", frontend), ...checkBudget(budget, "bundle", bundle)];

  console.log(`perf probe · ${browser.split("\\").pop()} headless · production build (${buildSec}s) · ${RUNS} runs · ${cpus()[0]?.model.trim()}`);
  for (const l of lines) console.log(l);
  const show = (title, obj, section) => {
    console.log(`  ${title}`);
    for (const [k, v] of Object.entries(obj)) {
      const lim = budget?.[section]?.[k];
      const all = section === "frontend" ? ` [${runs.map((r) => r[k]).join(", ")}]` : "";
      console.log(`    ${k.padEnd(22)} ${String(v).padStart(8)}${typeof lim === "number" ? `  / ${lim}` : ""}${all}`);
    }
  };
  show("bundle", bundle, "bundle");
  show("frontend (median)", frontend, "frontend");
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ bundle, frontend, runs }, null, 2));

  const problems = [...failures, ...over];
  if (!problems.length) {
    console.log("PASS");
    return 0;
  }
  console.log("");
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\nFAIL: ${problems.length}건`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`FAIL: ${err.stack ?? err.message}`);
    process.exit(1);
  },
);
