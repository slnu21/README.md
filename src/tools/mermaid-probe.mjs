// mermaid 렌더 프로브 — Node 드라이버.
//
// Vite 개발 서버를 Node API 로 띄우고, Edge 를 헤드리스로 붙여
// app/dev/mermaid-probe.html 을 실행시킨 뒤 판정 JSON 을 회신받아 종료 코드로 바꾼다.
//
// 새 npm 의존성 없음: vite 는 이미 devDependency 이고, 브라우저는 셸아웃한다.
// 미들웨어 두 개를 붙이는 이유:
//   /probe-fixture  docs/samples/mermaid-gallery.md 는 Vite 루트(src/) 밖이라 server.fs 가 막는다.
//                   드라이버가 fs 로 읽어 넘긴다 — 픽스처 원본이 갤러리 하나로 유지된다.
//   /probe-result   같은 오리진으로 결과를 회신받는다(CORS·2차 포트 불필요).
//
// 실행: cd src; npm run probe:mermaid
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "../../docs/samples/mermaid-gallery.md");
// 1420 은 vite.config.ts 가 strictPort 로 잡고 있다(tauri dev). 겹치면 서로를 죽인다.
const PORT = 5199;
const TIMEOUT_MS = 180_000;

function findBrowser() {
  if (process.env.PROBE_BROWSER) return process.env.PROBE_BROWSER;
  const candidates = [
    `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) {
    throw new Error(
      "Edge/Chrome 을 찾지 못했다. PROBE_BROWSER 환경변수로 실행 파일 경로를 지정할 것.\n" +
        "  예: $env:PROBE_BROWSER=\"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\"",
    );
  }
  return found;
}

/** `--shot <out.png>` — 첫 설정의 미리보기 문서를 그대로 렌더해 스크린샷을 남긴다(육안 확인용).
 *  앱을 띄우지 않으므로 사용자 DB·WebView2 프로필을 건드리지 않는다. */
const shotArg = process.argv.indexOf("--shot");
const shotPath = shotArg !== -1 ? resolve(process.cwd(), process.argv[shotArg + 1] ?? "mermaid-probe.png") : null;

async function main() {
  if (!existsSync(FIXTURE)) throw new Error(`픽스처를 찾지 못했다: ${FIXTURE}`);
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
        name: "mermaid-probe",
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
                resolveResult({ ok: false, failures: [`판정 JSON 파싱 실패: ${e}`], lines: [], stats: {} });
              }
            });
          });
        },
      },
    ],
  });
  await server.listen();

  const profile = mkdtempSync(resolve(tmpdir(), "mermaid-probe-"));
  const browser = findBrowser();
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      // 배율을 고정하지 않으면 텍스트 실측이 기기 DPI 에 따라 달라져 허용오차가 기기별로 바뀐다.
      "--force-device-scale-factor=1",
      "--window-size=1600,2400",
      `--user-data-dir=${profile}`,
      `http://127.0.0.1:${PORT}/app/dev/mermaid-probe.html${shotPath ? "?shot" : ""}`,
    ],
    { stdio: "ignore" },
  );

  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`프로브가 ${TIMEOUT_MS / 1000}초 안에 결과를 보내지 않았다.`)), TIMEOUT_MS),
  );

  try {
    const result = await Promise.race([resultPromise, timeout]);

    console.log(`mermaid probe · ${browser.split("\\").pop()} headless · 픽스처 ${FIXTURE}`);
    for (const l of result.lines ?? []) console.log(l);
    const s = result.stats ?? {};
    console.log(
      `  측정 라벨 ${s.labels ?? 0}개 · dominant-baseline ${s.dominantBaseline ?? 0}개 · ` +
        `상속 고정 속성 ${s.ctxProps ?? 0}개`,
    );

    if (shotPath && result.srcdoc) {
      // 첫 브라우저를 먼저 죽이고 **다른 프로필**로 띄운다 — 같은 --user-data-dir 를 쓰면
      // 두 번째 인스턴스가 실행 중인 쪽으로 넘어가 버려 스크린샷이 안 찍힌다.
      child.kill();
      const shotProfile = mkdtempSync(resolve(tmpdir(), "mermaid-shot-"));
      const html = resolve(shotProfile, "shot.html");
      writeFileSync(html, result.srcdoc, "utf8");
      const shooter = spawn(
        browser,
        [
          "--headless=new",
          "--disable-gpu",
          "--force-device-scale-factor=1",
          "--hide-scrollbars",
          `--user-data-dir=${shotProfile}\\p`,
          `--screenshot=${shotPath}`,
          "--window-size=1280,14000", // 갤러리 전체가 한 장에 들어가는 높이
          `file:///${html.replace(/\\/g, "/")}`,
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
    // 브라우저가 프로필을 아직 물고 있을 수 있다 — 정리 실패로 판정을 뒤엎지 않는다.
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
