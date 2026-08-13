// 리딩 분할 레이아웃 프로브 — Node 드라이버.
//
// Vite 개발 서버를 Node API 로 띄우고 Edge 를 헤드리스로 붙여 app/dev/layout-probe.html 을
// (데모 시드와 함께) 실행시킨 뒤 판정 JSON 을 회신받아 종료 코드로 바꾼다.
// mermaid-probe.mjs 와 같은 구조지만 **진짜 앱 셸을 마운트**한다 — 그쪽은 미리보기 문서 안만 본다.
//
// 새 npm 의존성 없음. 앱을 띄우지 않으므로 사용자 DB·WebView2 프로필을 건드리지 않는다.
//
// 실행: cd src; npm run probe:layout
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 5198; // 5199=mermaid 프로브, 1420=tauri dev. 겹치면 서로를 죽인다.
const TIMEOUT_MS = 120_000;

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

async function main() {
  let resolveResult;
  const resultPromise = new Promise((r) => (resolveResult = r));

  const server = await createServer({
    configFile: resolve(HERE, "../vite.config.ts"),
    root: resolve(HERE, ".."),
    logLevel: "warn",
    server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
    plugins: [
      {
        name: "layout-probe",
        configureServer(s) {
          s.middlewares.use("/probe-result", (req, res) => {
            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", () => {
              res.end("ok");
              try {
                resolveResult(JSON.parse(body));
              } catch (e) {
                resolveResult({ ok: false, failures: [`판정 JSON 파싱 실패: ${e}`], lines: [] });
              }
            });
          });
        },
      },
    ],
  });
  await server.listen();

  const profile = mkdtempSync(resolve(tmpdir(), "layout-probe-"));
  const browser = findBrowser();
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--force-device-scale-factor=1",
      // 900px 초과여야 좌우 분할(세로 스택이 아님)을 잰다.
      "--window-size=1600,1000",
      `--user-data-dir=${profile}`,
      `http://127.0.0.1:${PORT}/app/dev/layout-probe.html?demo=1`,
    ],
    { stdio: "ignore" },
  );

  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`프로브가 ${TIMEOUT_MS / 1000}초 안에 결과를 보내지 않았다.`)), TIMEOUT_MS),
  );

  try {
    const result = await Promise.race([resultPromise, timeout]);
    console.log(`layout probe · ${browser.split("\\").pop()} headless · 1600x1000`);
    for (const l of result.lines ?? []) console.log(l);
    if (result.ok) {
      console.log("PASS");
      return 0;
    }
    console.log("");
    for (const f of result.failures) console.log(`  ${f}`);
    console.log(`\nFAIL: 불변식 ${result.failures.length}건 위반`);
    return 1;
  } finally {
    child.kill();
    await server.close();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* temp 프로필은 OS 가 정리한다 */
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
