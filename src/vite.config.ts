import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// 웹 에디션 배포 경로(Cloudflare Pages 루트 = "/"). 하위 경로에 올릴 때만 `WEB_BASE=/sub/ npm run build:web`.
// @ts-expect-error process is a nodejs global
const webBase: string = process.env.WEB_BASE || "/";

// 플랫폼 구현 선택 — 앱 코드는 `@platform` 하나로 닿고, 빌드가 어느 구현을 넣을지 정한다.
// 데스크톱(기본·tauri dev/build·vitest·프로브) = platform/tauri.ts, `--mode web` = platform/web/index.ts.
// tsc 는 tsconfig.json `paths` 로 데스크톱 쪽 타입을 보고, 웹 구현이 같은 모양인지는
// platform/conformance.ts 가 컴파일 시간에 잰다.
const platformEntry = (web: boolean) =>
  decodeURIComponent(
    new URL(web ? "./app/platform/web/index.ts" : "./app/platform/tauri.ts", import.meta.url).pathname,
  ).replace(/^\/([A-Za-z]:)/, "$1");

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const web = mode === "web";
  return {
    plugins: [react()],
    // 판 상수 — 빌드가 리터럴(true/false)로 바꿔 넣는다. 데스크톱 빌드에서는 `__WEB__ && …`·`__WEB__ ? 웹 : 데스크톱`
    // 의 웹 쪽이 상수 접기로 사라지고, 웹 전용 모듈(WebSidebar·웹 문구·웹 CSS)은 import 째 빠진다 — 데스크톱 번들 불변.
    define: { __WEB__: JSON.stringify(web) },
    resolve: {
      alias: { "@platform": platformEntry(web) },
    },

    // 웹 에디션(W1): `npm run build:web` → web-dist/. 배포 대상은 Cloudflare Pages(루트 "/", WEB_BASE 로 바꿈).
    ...(web
      ? {
          base: webBase,
          // 청크 경고선 = 이 저장소의 진짜 번들 감시선(tools/perf-budget.json 첫 JS 1,150KB)에 맞춘다. Vite 기본 500KB 는
          // 일반 권고라 mermaid·markdown 지연 청크가 늘 넘는다(데스크톱 빌드의 알려진 경고 1건과 같은 것). 첫 JS 회귀는 probe:perf 가 잡는다.
          build: { outDir: "web-dist", emptyOutDir: true, chunkSizeWarningLimit: 1150 },
        }
      : {}),

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    //    (웹 개발 서버 `npm run dev:web` 는 1430 — tauri dev 와 같이 띄워도 서로를 죽이지 않는다)
    server: {
      port: web ? 1430 : 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
