// U6 "브리지가 떠 있는 채로 업데이트" 실측. 임시 신원(SlnU.README.md.UpdTest · 별칭 readme-md-updtest.exe ·
// 식별자 com.readme.updtest)만 만진다 — 실사용 패키지·DB 무접촉.
// 사용: packaging/update-check/README.md. node update-run.mjs <default|defer|force>
// 작업 폴더(UPDATE_CHECK_WORK, 기본 %TEMP%\md-reader-update-check)에 v3.msix·v4.msix 가 있어야 한다.
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORK = process.env.UPDATE_CHECK_WORK || join(tmpdir(), "md-reader-update-check");
const MODE = process.argv[2] ?? "default";
const NAME = "SlnU.README.md.UpdTest";
const ALIAS = "readme-md-updtest.exe";
const IDENT = "com.readme.updtest";
const FX = join(WORK, "fx");
const PORT = 9333;
const V3 = join(WORK, "v3.msix"), V4 = join(WORK, "v4.msix");
// 픽스처 — 문서 30개(제목 셋). 매번 새로 쓴다(공존 실측이 본문 끝에 줄을 붙인다).
mkdirSync(join(FX, "notes"), { recursive: true });
for (let i = 1; i <= 30; i++)
  writeFileSync(join(FX, "notes", `doc-${i}.md`), `# 문서 ${i}

## 개요

업데이트 실측 픽스처 ${i} 번. 브리지가 이 글을 찾는다.

## 세부

둘째 절 본문 ${i}.
`);

const log = [];
const note = (k, v) => { log.push({ t: new Date().toISOString().slice(11, 23), k, v }); console.log(k, typeof v === "string" ? v : JSON.stringify(v)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (cmd, timeout = 120_000) => execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8", timeout }).trim();

function pkg() {
  const o = ps(`$p = Get-AppxPackage ${NAME}; if ($p) { "$($p.Version)|$($p.PackageFamilyName)|$($p.Status)|$($p.InstallLocation)" }`);
  if (!o) return null;
  const [version, pfn, status, loc] = o.split("|");
  return { version, pfn, status, loc };
}
function procs() {
  const o = ps(`Get-CimInstance Win32_Process -Filter "name='md-reader.exe'" | Where-Object { $_.ExecutablePath -like '*${NAME}*' } | ForEach-Object { "$($_.ProcessId)|$($_.ExecutablePath)|$($_.CommandLine)" }`);
  return o ? o.split(/\r?\n/).map((l) => { const [pid, path, cmd] = l.split("|"); return { pid: +pid, ver: (path.match(/UpdTest_([\d.]+)_/) || [])[1], mcp: /\bmcp\b/.test(cmd) }; }) : [];
}
function killAll() { for (const p of procs()) try { execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" }); } catch {} }
function db(pfn) {
  const path = join(process.env.LOCALAPPDATA, "Packages", pfn, "LocalCache", "Roaming", IDENT, "md-reader.db");
  const py = `import sqlite3,json,sys
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
cols=[r[1] for r in c.execute('pragma table_info(file_meta)')]
print(json.dumps({'user_version':c.execute('pragma user_version').fetchone()[0],'file_meta':c.execute('select count(*) from file_meta').fetchone()[0],'fts_rowid_col':'fts_rowid' in cols,'nodes':c.execute('select count(*) from node').fetchone()[0]}))`;
  try { return JSON.parse(execFileSync("python", ["-I", "-c", py, path], { encoding: "utf8", timeout: 20_000 })); } catch (e) { return { error: e.message.split("\n")[0] }; }
}

class Bridge {
  constructor(tag) {
    this.tag = tag; this.id = 0; this.wait = new Map();
    this.p = spawn(ALIAS, ["mcp"], { stdio: ["pipe", "pipe", "pipe"] });
    this.exited = null;
    this.p.on("exit", (code) => { this.exited = code; for (const r of this.wait.values()) r({ error: { message: `exited ${code}` } }); this.wait.clear(); });
    this.p.on("error", (e) => { this.exited = e.message; });
    createInterface({ input: this.p.stdout }).on("line", (l) => { try { const m = JSON.parse(l); this.wait.get(m.id)?.(m); this.wait.delete(m.id); } catch {} });
  }
  req(method, params = {}, ms = 10_000) {
    if (this.exited !== null) return Promise.resolve({ error: { message: `exited ${this.exited}` } });
    const id = ++this.id;
    return new Promise((r) => {
      this.wait.set(id, r);
      setTimeout(() => { if (this.wait.delete(id)) r({ error: { message: "timeout" } }); }, ms);
      this.p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  async call(name, args) { const m = await this.req("tools/call", { name, arguments: args }); if (m.error) return `ERR ${m.error.message}`; const r = m.result; return `${r.isError ? "isError " : ""}${r.content[0].text.slice(0, 160)}`; }
  async hello() {
    const i = await this.req("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "updtest", version: "0" } });
    const l = await this.req("tools/list");
    const oia = l.result?.tools?.find((t) => t.name === "open_in_app");
    return { server: i.result?.serverInfo, err: i.error?.message ?? l.error?.message, build: oia ? (oia.inputSchema.properties.line ? "v4(line)" : "v3(no line)") : "?" };
  }
  async suite(label) {
    const doc = join(FX, "notes", "doc-7.md");
    note(`${this.tag}.${label}.ping`, (await this.req("ping")).error?.message ?? "ok");
    note(`${this.tag}.${label}.search`, await this.call("search_docs", { query: "픽스처", limit: 50 }));
    note(`${this.tag}.${label}.outline`, await this.call("outline", { path: doc }));
    note(`${this.tag}.${label}.read_section`, await this.call("read_section", { path: doc, heading: "세부" }));
    note(`${this.tag}.${label}.list_workspace`, await this.call("list_workspace", {}));
    note(`${this.tag}.${label}.place_doc`, await this.call("place_doc", { path: doc }));
  }
  end() { try { this.p.stdin.end(); } catch {} }
}

async function cdpEval(expr, deadline) {
  // 첫 실행은 페이지가 한 번 다시 로드되며 평가 문맥이 사라질 수 있다 → 값이 올 때까지 다시
  for (let i = 0; i < 8; i++) {
    let v;
    try { v = await cdpEval1(expr, deadline); } catch (e) { v = undefined; if (Date.now() > deadline) throw e; }
    if (v !== undefined) return v;
    await sleep(1000);
  }
  return undefined;
}
async function cdpEval1(expr, deadline) {
  let page;
  while (Date.now() < deadline && !page) { try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page" && /tauri\.localhost/.test(t.url)); } catch {} if (!page) await sleep(200); }
  if (!page) throw new Error("CDP 응답 없음");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; setTimeout(() => j(new Error("ws timeout")), 10_000); });
  const out = await new Promise((r, j) => {
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) r(m.result?.result?.value ?? m.result?.exceptionDetails?.exception?.description); };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: `(async () => { for (let i = 0; i < 100 && !window.__TAURI_INTERNALS__; i++) await new Promise(r => setTimeout(r, 100)); try { return await (${expr}); } catch (e) { return "THROW " + (e?.message ?? e); } })()`, awaitPromise: true, returnByValue: true } }));
    setTimeout(() => j(new Error("eval timeout")), 30_000);
  });
  ws.close();
  return out;
}
function gui() {
  const t0 = Date.now();
  const p = spawn(ALIAS, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore", detached: true });
  p.unref();
  return t0;
}
async function closeGui() {
  for (const p of procs().filter((p) => !p.mcp)) try { execFileSync("taskkill", ["/PID", String(p.pid), "/T"], { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 20 && procs().some((p) => !p.mcp); i++) await sleep(500);
  for (const p of procs().filter((p) => !p.mcp)) try { execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  await sleep(1500);
}

let A, B;
process.on("exit", () => { try { A?.p.kill(); B?.p.kill(); } catch {} killAll(); writeFileSync(join(WORK, `result-${MODE}.json`), JSON.stringify(log, null, 1)); });
const hard = setTimeout(() => { note("FATAL", "전체 시간 제한 10분"); process.exit(2); }, 600_000);

async function main() {
  note("mode", MODE);
  killAll();
  if (pkg()) ps(`Get-AppxPackage ${NAME} | Remove-AppxPackage`);
  ps(`Add-AppxPackage -Path '${V3}'`);
  const p3 = pkg(); note("installed", p3);

  // 채우기: v3 GUI 로 폴더 가져오기 + 색인 + 제어 도구 켜기(앱이 하는 그대로 — Tauri 커맨드)
  gui();
  const r = await cdpEval(`(async () => { const I = window.__TAURI_INTERNALS__; await new Promise(r => setTimeout(r, 1500));
    await I.invoke('ws_import_folder', { id: crypto.randomUUID(), parentId: null, realPath: ${JSON.stringify(FX)} });
    await I.invoke('search_index_folder', { path: ${JSON.stringify(FX)} });
    await I.invoke('settings_set', { key: 'agentControlEnabled', value: '1' });
    await new Promise(r => setTimeout(r, 3000)); return 'ok'; })()`, Date.now() + 60_000);
  note("populate", r);
  await closeGui();
  note("db.before", db(p3.pfn));

  A = new Bridge("A");
  note("A.hello", await A.hello());
  await A.suite("v3db");
  note("procs.beforeUpdate", procs());

  const flag = { default: "", defer: "-DeferRegistrationWhenPackagesAreInUse", force: "-ForceApplicationShutdown" }[MODE];
  const t = Date.now();
  let upd;
  try { ps(`Add-AppxPackage -Path '${V4}' ${flag}`, 180_000); upd = "ok"; } catch (e) { upd = (e.stderr || e.message).toString().replace(/\s+/g, " ").slice(0, 400); }
  note("update", { flag, ms: Date.now() - t, result: upd });
  await sleep(1500);
  note("pkg.afterUpdate", pkg());
  note("procs.afterUpdate", procs());
  note("A.alive", A.exited === null ? "alive" : `exited ${A.exited}`);
  if (A.exited === null) await A.suite("afterUpdate");

  // 새 앱 첫 실행 — 옛 브리지 연결이 열린 채 판올림
  const tg = gui();
  let up = "?";
  try { up = await cdpEval(`location.href`, Date.now() + 60_000); } catch (e) { up = e.message; }
  note("gui2", { cdp: up, ms: Date.now() - tg, procs: procs() });
  await sleep(2000);
  note("db.afterGui2", db(pkg().pfn));
  if (A.exited === null) await A.suite("v4db");
  await closeGui();

  A.end();
  for (let i = 0; i < 20 && A.exited === null; i++) await sleep(250);
  note("A.endedWith", A.exited);
  await sleep(3000);
  note("pkg.afterAllClosed", pkg());

  B = new Bridge("B");
  note("B.hello", await B.hello());
  await B.suite("reconnect");
  note("procs.final", procs());
  B.end();
  await sleep(1000);
  clearTimeout(hard);
}
main().catch((e) => { note("FATAL", e.stack); process.exitCode = 1; });
