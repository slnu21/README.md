// 글 방향(RTL) 프로브 — Node 드라이버.
//
// Vite 개발 서버를 Node API 로 띄우고 Edge 를 헤드리스로 붙여 app/dev/rtl-probe.html 을 실행시킨다.
// 그 페이지는 **진짜 앱 셸**을 마운트하고(layout-probe 와 같은 구조) docs/samples/rtl-persian.md 를
// 열어 미리보기·편집기의 기하를 잰다 — 페르시아어 문단이 오른쪽 변에서 시작하는가, 인용문 막대와
// 목록 여백이 오른쪽인가, 코드는 여전히 왼쪽인가, 편집기에서 ← 키가 RTL 줄에서 논리적으로 앞으로
// 가는가. 언어를 모르는 사람도 판정할 수 있는 종류의 검사만 있다(방향은 글자의 유니코드 속성이다).
//
// 미들웨어 둘: /probe-fixture(픽스처는 Vite 루트 밖) · /probe-result(판정 회신). 새 의존성 0.
//
// 실행: cd src; npm run probe:rtl
//       npm run probe:rtl -- --shot out.png   ← 앱 화면(편집기+미리보기) 스크린샷도 남긴다(육안 확인)
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "../../docs/samples/rtl-persian.md");
const PORT = 5197; // 5198=layout · 5199=mermaid · 1420=tauri dev. 겹치면 서로를 죽인다.
const TIMEOUT_MS = 120_000;

const shotArg = process.argv.indexOf("--shot");
const shotPath = shotArg !== -1 ? resolve(process.cwd(), process.argv[shotArg + 1] ?? "rtl-probe.png") : null;

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

const COMMON_ARGS = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1"];

async function main() {
  const fixture = readFileSync(FIXTURE, "utf8");
  let resolveResult;
  const resultPromise = new Promise((r) => (resolveResult = r));

  const server = await createServer({
    configFile: resolve(HERE, "../vite.config.ts"),
    root: resolve(HERE, ".."),
    logLevel: "warn",
    server: { port: PORT, strictPort: true, host: "127.0.0.1", open: false },
    plugins: [
      {
        name: "rtl-probe",
        configureServer(s) {
          s.middlewares.use("/probe-fixture", (_req, res) => {
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end(fixture);
          });
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

  const profile = mkdtempSync(resolve(tmpdir(), "rtl-probe-"));
  const browser = findBrowser();
  const url = `http://127.0.0.1:${PORT}/app/dev/rtl-probe.html?demo=1`;
  const child = spawn(browser, [...COMMON_ARGS, "--window-size=1600,1000", `--user-data-dir=${profile}`, url], {
    stdio: "ignore",
  });

  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`프로브가 ${TIMEOUT_MS / 1000}초 안에 결과를 보내지 않았다.`)), TIMEOUT_MS),
  );

  try {
    const result = await Promise.race([resultPromise, timeout]);
    console.log(`rtl probe · ${browser.split("\\").pop()} headless · 1600x1000`);
    for (const l of result.lines ?? []) console.log(l);

    if (shotPath) {
      // 첫 브라우저를 먼저 죽이고 **다른 프로필**로 띄운다(같은 프로필이면 실행 중인 쪽으로 넘어가
      // 스크린샷이 안 찍힌다). ?shot 이면 프로브 스크립트가 픽스처만 열고 멈추며, 가상 시간 예산이
      // 그 비동기 작업(마운트→열기→미리보기 렌더)을 기다려 준다.
      child.kill();
      const shotProfile = mkdtempSync(resolve(tmpdir(), "rtl-shot-"));
      const shooter = spawn(
        browser,
        [
          ...COMMON_ARGS,
          "--hide-scrollbars",
          "--virtual-time-budget=8000",
          `--user-data-dir=${shotProfile}`,
          `--screenshot=${shotPath}`,
          "--window-size=1600,1000",
          `${url}&shot=1`,
        ],
        { stdio: "ignore" },
      );
      await new Promise((r) => shooter.on("exit", r));
      console.log(existsSync(shotPath) ? `  스크린샷 ${shotPath}` : `  스크린샷 실패 (${shotPath})`);
      try {
        rmSync(shotProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* temp 는 OS 가 정리한다 */
      }
    }

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
