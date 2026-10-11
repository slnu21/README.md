// ②③ 공존 실측(비패키지 exe 두 판, 식별자 com.readme.updtest — 실사용 데이터 무접촉).
// 옛 브리지(v3 exe)가 연결을 쥔 채 쉬지 않고 검색하는 동안 새 앱(v4 exe)이 판올림한다.
import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { rmSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// 사용: node coexist.mjs --v3 <0.10.0 exe> --v4 <새 판 exe>   (둘 다 식별자 com.readme.updtest 로 빌드한 것)
const arg = (n) => { const i = process.argv.indexOf(n); if (i < 0) throw new Error(`${n} <exe> 가 필요하다`); return process.argv[i + 1]; };
const V3 = arg("--v3"), V4 = arg("--v4");
const WORK = process.env.UPDATE_CHECK_WORK || join(tmpdir(), "md-reader-update-check"), FX = join(WORK, "fx"), PORT = 9334;
const DATA = [join(process.env.APPDATA, "com.readme.updtest"), join(process.env.LOCALAPPDATA, "com.readme.updtest")];
const DBP = join(DATA[0], "md-reader.db");
// 픽스처 — 문서 30개(제목 셋). 매번 새로 쓴다(공존 실측이 본문 끝에 줄을 붙인다).
mkdirSync(join(FX, "notes"), { recursive: true });
for (let i = 1; i <= 30; i++)
  writeFileSync(join(FX, "notes", `doc-${i}.md`), `# 문서 ${i}

## 개요

업데이트 실측 픽스처 ${i} 번. 브리지가 이 글을 찾는다.

## 세부

둘째 절 본문 ${i}.
`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kids = new Set();
// 우리가 띄운 두 exe 의 프로세스만 — 경로는 환경변수로 넘긴다(명령 문자열에 넣으면 JS 가 \b 같은 이스케이프를 먹어
// 필터가 아무것도 안 잡는다: 실제로 그래서 옛 앱이 살아남아 새 앱이 single-instance 로 넘겨지고 "판올림 통과"로 보였다).
const PS_OURS = "$exes = $env:UC_EXES -split ';'; Get-CimInstance Win32_Process -Filter \"name='md-reader.exe'\" | Where-Object { $exes -contains $_.ExecutablePath }";
const psOurs = (tail) => execFileSync("powershell", ["-NoProfile", "-Command", `${PS_OURS} | ${tail}`], { encoding: "utf8", timeout: 30000, env: { ...process.env, UC_EXES: [V3, V4].map((p) => p.replaceAll("/", "\\")).join(";") } });
const killExe = () => { try { psOurs("ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"); } catch {} };
process.on("exit", () => { for (const k of kids) try { k.kill(); } catch {} killExe(); });
setTimeout(() => { console.log("FATAL 5분 제한"); process.exit(2); }, 300_000);
function db() {
  const py = `import sqlite3,json,sys
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
cols=[r[1] for r in c.execute('pragma table_info(file_meta)')]
print(json.dumps({'uv':c.execute('pragma user_version').fetchone()[0],'meta':c.execute('select count(*) from file_meta').fetchone()[0],'idx':c.execute('select count(*) from file_index').fetchone()[0],'fts_rowid':'fts_rowid' in cols,'nodes':c.execute('select count(*) from node').fetchone()[0],'snaps':c.execute('select count(*) from doc_snapshot').fetchone()[0]}))`;
  return JSON.parse(execFileSync("python", ["-I", "-c", py, DBP], { encoding: "utf8", timeout: 20000 }));
}
function bridge(exe) {
  const p = spawn(exe, ["mcp"], { stdio: ["pipe", "pipe", "ignore"] }); kids.add(p);
  let id = 0; const wait = new Map(); let exited = null;
  p.on("exit", (c) => { exited = c; });
  createInterface({ input: p.stdout }).on("line", (l) => { const m = JSON.parse(l); wait.get(m.id)?.(m); wait.delete(m.id); });
  const req = (method, params = {}) => new Promise((r) => { const n = ++id; wait.set(n, r); setTimeout(() => wait.delete(n) && r({ error: { message: "timeout" } }), 10000); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
  const call = async (name, args) => { const m = await req("tools/call", { name, arguments: args }); return m.error ? `ERR ${m.error.message}` : `${m.result.isError ? "isError " : ""}${m.result.content[0].text}`; };
  return { req, call, get exited() { return exited; }, end: () => p.stdin.end() };
}
async function gui(exe) {
  const p = spawn(exe, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore" }); kids.add(p);
  let exited = null; p.on("exit", (c) => { exited = c; });
  const t0 = Date.now();
  let page;
  while (!page && Date.now() - t0 < 60000 && exited === null) { try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => /tauri\.localhost/.test(t.url)); } catch {} if (!page) await sleep(100); }
  return { p, page, ms: Date.now() - t0, get exited() { return exited; } };
}
async function evalIn(page, expr) {
  for (let i = 0; i < 8; i++) {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    const v = await new Promise((r) => { ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) r(m.result?.result?.value); }; ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: `(async()=>{for(let i=0;i<100&&!window.__TAURI_INTERNALS__;i++)await new Promise(r=>setTimeout(r,100));try{return await (${expr})}catch(e){return 'THROW '+(e?.message??e)}})()`, awaitPromise: true, returnByValue: true } })); setTimeout(() => r(undefined), 20000); });
    ws.close();
    if (v !== undefined) return v;
    await sleep(1000);
  }
}
const guiPids = () => psOurs("Where-Object { $_.CommandLine -notmatch ' mcp' } | ForEach-Object ProcessId").trim().split(/\s+/).filter(Boolean);
const close = async (g) => { try { execFileSync("taskkill", ["/PID", String(g.p.pid), "/T", "/F"], { stdio: "ignore" }); } catch {} for (let i = 0; i < 40 && guiPids().length; i++) await sleep(250); const left = guiPids(); if (left.length) throw new Error("GUI 가 안 죽었다 " + left); await sleep(1500); };

killExe();
for (const d of DATA) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
// 1) v3 앱으로 DB 를 만들고 채운다
let g = await gui(V3);
console.log("populate", await evalIn(g.page, `(async()=>{const I=window.__TAURI_INTERNALS__;await I.invoke('ws_import_folder',{id:crypto.randomUUID(),parentId:null,realPath:${JSON.stringify(FX)}});await I.invoke('search_index_folder',{path:${JSON.stringify(FX)}});await I.invoke('settings_set',{key:'agentControlEnabled',value:'1'});await new Promise(r=>setTimeout(r,3000));return 'ok'})()`));
await close(g);
console.log("db.v3", db());
// 2) 옛 브리지가 붙고, 쉬지 않고 검색한다
const A = bridge(V3);
console.log("A.init", (await A.req("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } })).result?.serverInfo);
let busy = true, n = 0, errs = [];
(async () => { while (busy) { const r = await A.call("search_docs", { query: "픽스처", limit: 50 }); n++; if (!r.startsWith('{"hits"') || JSON.parse(r).hits.length !== 30) errs.push(r.slice(0, 200)); } })();
await sleep(500);
// 3) 그 사이 새 앱이 판올림
g = await gui(V4);
await sleep(3000);
console.log("gui.v4", { cdp: !!g.page, ms: g.ms, exited: g.exited, url: g.page?.url, pids: guiPids() });
if (g.exited !== null) throw new Error("v4 앱이 떠 있지 않다 — 측정 무효");
console.log("db.after", db());
busy = false; await sleep(300);
console.log("A.loop", { calls: n, errors: errs.length, first: errs[0] });
// 4) 옛 브리지가 v4 DB 에서
const doc = join(FX, "notes", "doc-9.md");
for (const [name, args] of [["search_docs", { query: "둘째 절", limit: 3 }], ["outline", { path: doc }], ["read_section", { path: doc, heading: "개요" }], ["list_workspace", {}], ["place_doc", { path: doc }], ["place_doc", { path: doc }]])
  console.log("A.v4db", name, (await A.call(name, args)).slice(0, 220));
// 새 앱이 그 place_doc 을 보는가
console.log("app sees place_doc", await evalIn(g.page, `(async()=>{const s=await window.__TAURI_INTERNALS__.invoke('ws_load');return JSON.stringify(s).includes('doc-9.md')})()`));
// 새 앱이 옛 브리지 연결이 있는 채 재색인(쓰기) — 옛 브리지 검색과 겹쳐도 되는가
busy = true; n = 0; errs = [];
(async () => { while (busy) { const r = await A.call("search_docs", { query: "픽스처", limit: 50 }); n++; if (!r.startsWith('{"hits"') || JSON.parse(r).hits.length !== 30) errs.push(r.slice(0, 200)); } })();
const snaps0 = db().snaps;
for (let round = 0; round < 5; round++) {
  for (let i = 1; i <= 30; i++) appendFileSync(join(FX, "notes", `doc-${i}.md`), `
고친 줄 ${Date.now()} ${round}
`);
  await sleep(1100); // mtime 해상도·합치기 창과 무관하게 바뀐 것으로 보이게
  console.log("reindex", round, await evalIn(g.page, `(async()=>{await window.__TAURI_INTERNALS__.invoke('search_index_folder',{path:${JSON.stringify(FX)}});await new Promise(r=>setTimeout(r,800));return 'ok'})()`));
}
console.log("snapshots", snaps0, "->", db().snaps);
busy = false; await sleep(300);
console.log("A.loop2", { calls: n, errors: errs.length, first: errs[0] });
console.log("A sees edit", (await A.call("search_docs", { query: "고친 줄", limit: 50 })).match(/"path"/g)?.length);
console.log("db.final", db());
await close(g); A.end(); await sleep(500);
const B = bridge(V4);
const l = await B.req("tools/list");
console.log("B.reconnect", { line: !!l.result.tools.find((t) => t.name === "open_in_app").inputSchema.properties.line, search: (await B.call("search_docs", { query: "픽스처", limit: 50 })).length });
B.end(); await sleep(500);
await sleep(1500);
try { for (const d of DATA) if (existsSync(d)) rmSync(d, { recursive: true, force: true }); } catch (e) { console.log("cleanup later:", e.code); }
console.log("done");
process.exit(0);
