import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import * as site from "./app/platform/web/site/pages";
import { LANGS, ROUTES, routeFile } from "./app/platform/web/site/routes";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// 웹 에디션 배포 경로(Cloudflare Pages 루트 = "/"). 하위 경로에 올릴 때만 `WEB_BASE=/sub/ npm run build:web`.
// @ts-expect-error process is a nodejs global
const webBase: string = process.env.WEB_BASE || "/";
// 웹 에디션의 공개 주소(canonical·hreflang·sitemap·og). 미리보기 배포 등에서 바꿀 때만 `SITE_URL=https://… npm run build:web`.
// @ts-expect-error process is a nodejs global
const siteUrl: string = process.env.SITE_URL || site.SITE_URL_DEFAULT;

/** 웹 에디션 정적 사이트(W2) — 웹 빌드에만 붙는다(데스크톱 플러그인 목록은 그대로 `[react()]`).
 *  Vite 가 만든 index.html 을 틀로 언어×랜딩 페이지 8장 + 루트(언어 고르기) + 404 · _headers · _redirects · sitemap ·
 *  robots · manifest(언어별) · sw.js · 아이콘을 web-dist 에 낸다. 문자열 생성은 전부 app/platform/web/site/pages.ts(단위 테스트). */
function webSite(base: string): Plugin {
  const icon = (name: string) => readFileSync(new URL(`./src-tauri/icons/${name}`, import.meta.url));
  const ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="' +
    site.THEME_COLOR +
    '"/><g transform="translate(24 64)"><rect x="6" y="6" width="196" height="116" rx="16" fill="none" stroke="#fff" stroke-width="14"/>' +
    '<path fill="#fff" d="M30 98V30h20l20 25 20-25h20v68H110V59L90 84 70 59v39zm125 0l-30-33h20V30h20v35h20z"/></g></svg>\n';
  return {
    name: "readme-md-web-site",
    // 개발 서버(`npm run dev:web`)의 / 도 영문 앱 페이지 모양으로 — 설명 본문·data 속성까지 배포본과 같게.
    transformIndexHtml: {
      order: "post",
      handler: (html, ctx) => (ctx.server ? site.renderPage(html, { id: "app", lang: "en", siteUrl, base }) : html),
    },
    generateBundle: {
      order: "post",
      handler(_opts, bundle) {
        const idx = bundle["index.html"];
        if (!idx || idx.type !== "asset") throw new Error("web-site: index.html 이 번들에 없다");
        const tpl = String(idx.source);
        const out: Record<string, string | Uint8Array> = {};
        for (const r of ROUTES) for (const lang of LANGS) out[routeFile(r.id, lang)] = site.renderPage(tpl, { id: r.id, lang, siteUrl, base });
        idx.source = site.renderRootPage(siteUrl, base);
        out["404.html"] = site.render404(base);
        out["_headers"] = site.headersFile(base);
        out["_redirects"] = site.redirectsFile(base);
        out["sitemap.xml"] = site.sitemapXml(siteUrl, base);
        out["robots.txt"] = site.robotsTxt(siteUrl, base);
        out["lang-redirect.js"] = site.langRedirectJs(base);
        for (const lang of LANGS) out[`manifest-${lang}.webmanifest`] = site.manifestJson(lang, base);
        Object.assign(out, site.SITE_VERIFICATION_FILES);
        out[site.ICONS.svg] = ICON_SVG;
        out[site.ICONS.png32] = icon("32x32.png");
        out[site.ICONS.png256] = icon("128x128@2x.png");
        out[site.ICONS.png512] = icon("icon.png");
        const names = [...Object.keys(bundle), ...Object.keys(out)].sort();
        const texts = [String(idx.source), ...Object.values(out).filter((v): v is string => typeof v === "string")];
        out["sw.js"] = site.serviceWorkerJs({ version: site.versionOf([...names, ...texts]), precache: site.precacheList(names, base), base });
        for (const [fileName, source] of Object.entries(out)) this.emitFile({ type: "asset", fileName, source });
      },
    },
  };
}

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
    plugins: web ? [react(), webSite(webBase)] : [react()],
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
