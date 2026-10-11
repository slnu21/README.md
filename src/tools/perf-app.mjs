// 앱 실물 성능 — 릴리스 exe 의 기동 시간·유휴 메모리. **릴리스 때 손으로 돌리는 측정**이다
// (npm run probe:perf 는 브라우저에서 앱 셸을 재는 회귀 감시, 이쪽은 WebView2·Rust 셸까지 포함한 실물).
//
// 재는 것(실행마다, `--runs` 번의 중앙값):
//   cdp_ms      프로세스 시작 → WebView2 가 떠 원격 디버깅에 응답(= 창 안에 웹이 올라옴)
//   shell_ms    → 앱 셸(.split)이 마운트됨
//   preview_ms  → argv 로 넘긴 문서의 미리보기에 첫 헤딩이 그려짐(파일 연결로 여는 경로 그대로)
//   ws_mb / private_mb   준비 뒤 `--idle` 초 지나 프로세스 트리(WebView2 자식 포함)의 작업 집합·전용 바이트 합
//
// **실사용 데이터를 비켜 놓는다** — 앱은 %APPDATA%·%LOCALAPPDATA% 의 com.readme.app 을 쓴다(DB · WebView2
// 프로필). video/capture/userdata.ps1 로 이름을 바꿔 두고 끝나면(실패해도) 되돌린다. 매 실행은 빈 데이터
// 에서 시작하므로 "처음 설치한 사람의 기동"이다(마이그레이션 v1~v4 포함).
//
// 실행: cd src; node tools/perf-app.mjs --exe <README.exe>        (기본: release/v<버전>/ portable zip 을 풀어 쓴다)
//       node tools/perf-app.mjs --runs 5 --idle 30 --json out.json
//       node tools/perf-app.mjs --returning      (재방문 기동 — 데이터를 실행 사이에 남긴다)
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { checkBudget, median } from "./perf-budget.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const USERDATA = join(REPO, "video/capture/userdata.ps1");
const PORT = 9337;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? dflt : process.argv[i + 1];
};
const RUNS = Math.max(1, Number(arg("--runs", 5)));
const IDLE_S = Math.max(0, Number(arg("--idle", 30)));
const JSON_OUT = arg("--json", null);
const DOC = resolve(arg("--doc", join(REPO, "README.md")));
// --returning: 데이터를 실행 사이에 지우지 않는다 = 이미 쓰던 사람의 기동(DB·WebView2 프로필이 있다).
// 첫 실행은 그 상태를 만드는 준비라 버린다.
const RETURNING = process.argv.includes("--returning");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (cmd) => execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8" });

function resolveExe() {
  const given = arg("--exe", null);
  if (given) return { exe: resolve(given), cleanup: () => {} };
  const version = JSON.parse(readFileSync(join(REPO, "src/package.json"), "utf8")).version;
  const zip = join(REPO, `release/v${version}/README_${version}_x64_portable.zip`);
  if (!existsSync(zip)) throw new Error(`${zip} 가 없다 — --exe 로 릴리스 exe 를 지정할 것`);
  const dir = mkdtempSync(join(tmpdir(), "perf-app-"));
  ps(`Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force`);
  return { exe: join(dir, "README.exe"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** 프로세스 트리(자신 + 자손)의 작업 집합·전용 바이트 합(MB). WebView2 는 자식 프로세스 여럿이다. */
function treeMemory(rootPid) {
  const out = ps(
    "Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2} {3}' -f $_.ProcessId, $_.ParentProcessId, $_.WorkingSetSize, $_.PrivatePageCount }",
  );
  const rows = out.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number));
  const kids = new Map();
  for (const [pid, ppid] of rows) kids.set(ppid, [...(kids.get(ppid) ?? []), pid]);
  const inTree = new Set([rootPid]);
  const stack = [rootPid];
  while (stack.length) for (const k of kids.get(stack.pop()) ?? []) if (!inTree.has(k)) inTree.add(k), stack.push(k);
  let ws = 0, priv = 0;
  for (const [pid, , w, p] of rows) if (inTree.has(pid)) (ws += w), (priv += p);
  return { ws_mb: Math.round(ws / 1048576), private_mb: Math.round(priv / 1048576), procs: inTree.size };
}

async function cdpPage(deadline) {
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {
      /* 아직 안 떴다 */
    }
    await sleep(15);
  }
  throw new Error("WebView2 원격 디버깅이 응답하지 않는다");
}

function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) pending.get(m.id)(m), pending.delete(m.id);
  };
  // 시간 제한 — 안 풀리는 약속은 Node 를 조용히 끝낸다(위 restoreOnce 주석).
  const ready = new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
    setTimeout(() => j(new Error("CDP 웹소켓이 열리지 않는다")), 10_000);
  });
  const evaluate = async (expression) => {
    await ready;
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    const m = await new Promise((r) => pending.set(n, r));
    return m.result?.result?.value;
  };
  return { evaluate, close: () => ws.close() };
}

async function until(evaluate, expr, deadline) {
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expr)) return;
    } catch {
      /* 페이지가 바뀌는 중 */
    }
    await sleep(10);
  }
  throw new Error(`시간 초과: ${expr}`);
}

/** 지금 떠 있는 측정 대상 — 비정상 종료 때 원복 전에 죽인다(살아 있으면 DB 파일을 쥐고 있다). */
let current = null;

async function oneRun(exe) {
  const t0 = performance.now();
  const child = (current = spawn(exe, [DOC], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
    stdio: "ignore",
  }));
  const deadline = Date.now() + 60_000;
  try {
    const page = await cdpPage(deadline);
    const cdp_ms = performance.now() - t0;
    const s = cdpSession(page.webSocketDebuggerUrl);
    await until(s.evaluate, "!!document.querySelector('.split')", deadline);
    const shell_ms = performance.now() - t0;
    await until(s.evaluate, "!!document.querySelector('.preview-frame')?.contentDocument?.querySelector('h1')", deadline);
    const preview_ms = performance.now() - t0;
    s.close();
    await sleep(IDLE_S * 1000);
    const mem = treeMemory(child.pid);
    const r = (n) => Math.round(n);
    return { cdp_ms: r(cdp_ms), shell_ms: r(shell_ms), preview_ms: r(preview_ms), ...mem };
  } finally {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* 이미 끝났다 */
    }
    current = null;
    await sleep(2000); // single-instance 잠금·WebView2 자식이 정리될 시간
  }
}

async function main() {
  if (!existsSync(DOC)) throw new Error(`문서가 없다: ${DOC}`);
  const { exe, cleanup } = resolveExe();
  const ver = ps(`(Get-Item '${exe}').VersionInfo.FileVersion`).trim();
  console.log(`perf app · ${exe.split(/[\\/]/).pop()} ${ver} · ${RETURNING ? "returning" : "first-install"} · ${RUNS} runs · idle ${IDLE_S}s · doc ${DOC.split(/[\\/]/).pop()}`);
  console.log(ps(`& '${USERDATA}'`).trim());
  // **원복은 무슨 일이 있어도 한다.** finally 만으로는 모자란다 — 기다리던 약속이 끝내 안 풀린 채
  // 이벤트 루프가 비면 Node 는 finally 를 건너뛰고 그냥 끝난다(검증 스크립트에서 실제로 그래서 실사용
  // 데이터가 비켜 둔 채로 남았다). exit 훅은 동기 코드를 돌릴 수 있으므로 거기서도 원복한다.
  // 원복 스크립트는 비켜 둔 사본이 있을 때만 현재 폴더(= 측정용 일회용)를 지운다.
  let restored = false;
  const restoreOnce = () => {
    if (restored) return;
    restored = true;
    if (current) {
      try {
        execFileSync("taskkill", ["/PID", String(current.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        /* 이미 끝났다 */
      }
    }
    for (let i = 0; i < 10; i++) {
      try {
        console.log(ps(`& '${USERDATA}' -Restore`).trim());
        return;
      } catch (e) {
        if (i === 9) console.error(`원복 실패 — 손으로: powershell -File video/capture/userdata.ps1 -Restore
${e.message}`);
        execFileSync("powershell", ["-NoProfile", "-Command", "Start-Sleep -Milliseconds 500"]); // WebView2 자식이 파일을 놓을 때까지
      }
    }
  };
  process.on("exit", restoreOnce);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
  const live = [process.env.APPDATA, process.env.LOCALAPPDATA].map((b) => join(b, "com.readme.app"));
  // 아래에서 이 폴더를 지운다 — 비켜 놓기가 실제로 됐는지 **지우기 전에** 확인한다(아니면 실사용 DB 다).
  const left = live.filter((p) => existsSync(p));
  if (left.length) {
    restoreOnce();
    throw new Error(`비켜 놓기 뒤에도 남아 있다(지우지 않고 멈춤): ${left.join(", ")}`);
  }
  const runs = [];
  try {
    if (RETURNING) console.log(`  warm-up (버림): ${JSON.stringify(await oneRun(exe))}`);
    for (let i = 0; i < RUNS; i++) {
      // 처음 설치 모드: 매 실행을 빈 데이터에서 — 앞 실행이 만든 DB·프로필을 지운다(비켜 둔 실사용 데이터와는 다른 폴더명).
      if (!RETURNING) for (const p of live) rmSync(p, { recursive: true, force: true });
      const r = await oneRun(exe);
      runs.push(r);
      console.log(`  run ${i + 1}: ${JSON.stringify(r)}`);
    }
  } finally {
    await sleep(1000);
    restoreOnce();
    cleanup();
  }
  const keys = ["cdp_ms", "shell_ms", "preview_ms", "ws_mb", "private_mb", "procs"];
  const med = Object.fromEntries(keys.map((k) => [k, median(runs.map((r) => r[k]))]));
  console.log(`  median: ${JSON.stringify(med)}`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ exe: ver, runs, median: med }, null, 2));
  const over = checkBudget(JSON.parse(readFileSync(join(HERE, "perf-budget.json"), "utf8")), "app", med);
  if (over.length) {
    for (const o of over) console.log(`  ${o}`);
    console.log(`FAIL: ${over.length}건`);
    process.exitCode = 1;
  } else console.log("PASS");
}

main().catch((e) => {
  console.error(`FAIL: ${e.stack ?? e.message}`);
  process.exit(1);
});
