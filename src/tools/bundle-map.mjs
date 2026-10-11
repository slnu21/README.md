// 첫 청크(앱 index.html 이 처음 싣는 JS)를 패키지별로 쪼갠다 — 번들 예산(perf-budget.json "bundle")이
// 떨어졌을 때 무엇이 첫 청크로 들어왔는지 보는 도구. 크기는 압축 전 렌더 길이(줄이기 전)라 합계가
// 실제 파일보다 크다 — 비율을 본다. 새 의존성 없음(Vite build API + 인라인 플러그인).
//
// 실행: cd src; node tools/bundle-map.mjs
import { build } from "vite";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const root = process.argv[2] ?? fileURLToPath(new URL("..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "bmap-"));
const groups = {};
await build({
  configFile: join(root, "vite.config.ts"), root, logLevel: "error",
  build: { outDir: out, emptyOutDir: true, chunkSizeWarningLimit: 1e9 },
  plugins: [{ name: "map", generateBundle(_, bundle) {
    for (const c of Object.values(bundle)) {
      if (c.type !== "chunk" || !c.isEntry) continue;
      for (const [id, m] of Object.entries(c.modules)) {
        const n = id.split(String.fromCharCode(92)).join("/");
        const k = n.includes("node_modules/") ? n.split("node_modules/").pop().split("/").slice(0, n.split("node_modules/").pop().startsWith("@") ? 2 : 1).join("/") : "app:" + n.split("/app/").pop().split("/").slice(0, 2).join("/");
        groups[k] = (groups[k] ?? 0) + m.renderedLength;
      }
    }
  } }],
});
const rows = Object.entries(groups).sort((a, b) => b[1] - a[1]);
const total = rows.reduce((s, r) => s + r[1], 0);
console.log("total", Math.round(total / 1024), "KB");
for (const [k, v] of rows.slice(0, 30)) console.log(String(Math.round(v / 1024)).padStart(6), k);
