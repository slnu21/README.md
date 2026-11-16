// 웹 정적 사이트 생성 — 페이지 표·문구 고유성·hreflang·sitemap·헤더·서비스 워커 목록.
import { describe, expect, it } from "vitest";
import { COPY } from "./copy";
import {
  allPagePaths,
  buildCsp,
  headersFile,
  introHtml,
  langRedirectJs,
  manifestJson,
  precacheList,
  redirectsFile,
  render404,
  renderPage,
  renderRootPage,
  robotsTxt,
  serviceWorkerJs,
  sitemapXml,
  versionOf,
} from "./pages";
import { LANGS, ROUTES, counterpartPath, normBase, parseRoutePath, routeFile, routePath } from "./routes";

const SITE = "https://md.ondolworks.com";
// Vite 가 내는 index.html 과 같은 모양의 틀
const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>README.md</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-abc.css">
  </head>

  <body>
    <div id="root"></div>

  </body>
</html>`;

describe("routes — 언어 × 랜딩 경로", () => {
  it("경로 모양: /<lang>/<slug>/ · base 반영", () => {
    expect(routePath("app", "en")).toBe("/en/");
    expect(routePath("mermaid-preview", "ko")).toBe("/ko/mermaid-preview/");
    expect(routePath("readme-preview", "en", "/sub")).toBe("/sub/en/readme-preview/");
    expect(routeFile("markdown-viewer", "ko")).toBe("ko/markdown-viewer/index.html");
    expect(normBase("sub/")).toBe("/sub/");
    expect(normBase("")).toBe("/");
  });

  it("경로 해석 — 끝 슬래시·index.html 없어도, 모르는 경로는 null", () => {
    expect(parseRoutePath("/ko/mermaid-preview/")).toMatchObject({ lang: "ko", route: { id: "mermaid-preview" } });
    expect(parseRoutePath("/en/readme-preview")).toMatchObject({ lang: "en", route: { id: "readme-preview" } });
    expect(parseRoutePath("/en/index.html")).toMatchObject({ lang: "en", route: { id: "app" } });
    expect(parseRoutePath("/fr/")).toBeNull();
    expect(parseRoutePath("/en/nope/")).toBeNull();
    expect(parseRoutePath("/en/a/b/")).toBeNull();
    expect(parseRoutePath("/sub/ko/", "/sub/")).toMatchObject({ lang: "ko" });
  });

  it("다른 언어 짝 — 같은 랜딩, 모르면 앱 첫 화면", () => {
    expect(counterpartPath("/en/markdown-viewer/", "ko")).toBe("/ko/markdown-viewer/");
    expect(counterpartPath("/ko/", "en")).toBe("/en/");
    expect(counterpartPath("/weird", "ko")).toBe("/ko/");
  });
});

describe("문구 — 랜딩마다 다르게(같은 앱, 다른 소개)", () => {
  for (const lang of LANGS) {
    it(`${lang}: title·h1·description·첫 단락이 페이지마다 고유`, () => {
      for (const key of ["title", "h1", "description"] as const) {
        const vals = ROUTES.map((r) => COPY[lang].routes[r.id][key]);
        expect(new Set(vals).size).toBe(vals.length);
      }
      const leads = ROUTES.map((r) => COPY[lang].routes[r.id].lead[0]);
      expect(new Set(leads).size).toBe(leads.length);
    });
    it(`${lang}: description 은 검색 결과에 맞는 길이(50~200자)`, () => {
      for (const r of ROUTES) {
        const d = COPY[lang].routes[r.id].description;
        expect(d.length).toBeGreaterThan(50);
        expect(d.length).toBeLessThanOrEqual(200);
      }
    });
  }
  it("ko/en 은 같은 구성(절 수·문법 항목 수)", () => {
    expect(COPY.ko.how.length).toBe(COPY.en.how.length);
    expect(COPY.ko.syntax.length).toBe(COPY.en.syntax.length);
    expect(COPY.ko.share.length).toBe(COPY.en.share.length);
  });
});

describe("페이지 생성", () => {
  const page = renderPage(TEMPLATE, { id: "mermaid-preview", lang: "ko", siteUrl: SITE });

  it("html 속성 — 언어·랜딩·기본 모드·base", () => {
    expect(page).toContain(`<html lang="ko" data-route="mermaid-preview" data-mode="split" data-base="/">`);
  });

  it("self-canonical + hreflang 셋(ko·en·x-default=en)", () => {
    expect(page).toContain(`<link rel="canonical" href="${SITE}/ko/mermaid-preview/" />`);
    expect(page).toContain(`hreflang="en" href="${SITE}/en/mermaid-preview/"`);
    expect(page).toContain(`hreflang="ko" href="${SITE}/ko/mermaid-preview/"`);
    expect(page).toContain(`hreflang="x-default" href="${SITE}/en/mermaid-preview/"`);
  });

  it("title·description 이 그 랜딩 것 · Vite 아이콘 대신 앱 아이콘 · manifest 는 언어별", () => {
    expect(page).toContain(`<title>${COPY.ko.routes["mermaid-preview"].title}</title>`);
    expect(page).not.toContain("vite.svg");
    expect(page).toContain(`href="/manifest-ko.webmanifest"`);
    expect(page.match(/<title>/g)).toHaveLength(1);
  });

  it("앱 스크립트·스타일은 그대로, 설명 본문은 #root 뒤에(보이는 DOM)", () => {
    expect(page).toContain(`src="/assets/index-abc.js"`);
    expect(page).toContain(`href="/assets/index-abc.css"`);
    expect(page.indexOf('<div id="root"></div>')).toBeLessThan(page.indexOf('id="web-intro"'));
    expect(page).toContain(`<h1>${COPY.ko.routes["mermaid-preview"].h1}</h1>`);
    expect(page).not.toMatch(/<script>(?!<)/); // 인라인 실행 스크립트 없음(JSON-LD 데이터 블록만)
    expect(page).not.toMatch(/\shidden[\s>]/);
  });

  it("설명 본문 — 다른 랜딩·다른 언어 링크, 브랜드·Store 링크", () => {
    const intro = introHtml("app", "en");
    expect(intro).toContain(`href="/en/markdown-viewer/"`);
    expect(intro).toContain(`href="/ko/" hreflang="ko"`);
    expect(intro).toContain(`href="https://ondolworks.com"`);
    expect(intro).toContain("apps.microsoft.com/detail/9N9QMXQPND3H");
    expect(intro).not.toContain(`href="/en/"`); // 자기 자신은 목록에 없다
    expect(intro).toContain("A[Write] --&gt; B"); // 코드 예시는 이스케이프(mermaid 화살표가 태그로 읽히지 않게)
  });

  it("JSON-LD 는 데이터 블록 · '<' 이스케이프", () => {
    const m = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(page);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toMatchObject({ "@type": "WebApplication", inLanguage: "ko" });
  });

  it("루트 = 언어 고르기(스크립트 파일로 이동 · 링크 폴백), 404 = noindex", () => {
    const root = renderRootPage(SITE);
    expect(root).toContain(`<script src="/lang-redirect.js"></script>`);
    expect(root).toContain(`href="/ko/"`);
    expect(render404()).toContain(`noindex`);
    const js = langRedirectJs();
    expect(js).toContain("location.search+location.hash");
    expect(js).toContain("readme-md.web.lang");
  });
});

describe("배포 파일", () => {
  it("sitemap — 8 URL, 각자 hreflang 대안", () => {
    const xml = sitemapXml(SITE);
    expect(xml.match(/<loc>/g)).toHaveLength(ROUTES.length * LANGS.length);
    expect(xml).toContain(`<loc>${SITE}/ko/readme-preview/</loc>`);
    expect(xml.match(/hreflang="x-default"/g)).toHaveLength(8);
    expect(allPagePaths()).toHaveLength(8);
  });

  it("robots — sitemap 절대 주소", () => {
    expect(robotsTxt(SITE)).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robotsTxt("https://x.dev/", "/sub/")).toContain("Sitemap: https://x.dev/sub/sitemap.xml");
  });

  it("_headers — 보안 헤더 + 자산 1년 immutable + HTML·sw no-cache", () => {
    const h = headersFile();
    expect(h).toMatch(/^\/\*\n {2}X-Content-Type-Options: nosniff$/m);
    expect(h).toContain("Referrer-Policy: strict-origin-when-cross-origin");
    expect(h).toContain(`Content-Security-Policy: ${buildCsp()}`);
    expect(h).toMatch(/^\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
    expect(h).toMatch(/^\/sw\.js\n {2}Cache-Control: no-cache$/m);
    expect(h).toMatch(/^\/ko\/\*\n {2}Cache-Control: no-cache$/m);
    // 자산 경로가 no-cache 규칙에 같이 걸리면 Pages 가 값을 쉼표로 합친다 — 겹치는 패턴이 없어야 한다
    expect(h).not.toMatch(/^\/\*\n {2}Cache-Control/m);
    // Pages 매칭: `*` 는 빈 문자열도 받는다(`/ko/*` ⊃ `/ko/`) → 실제 경로마다 Cache-Control 규칙은 정확히 하나
    const rules = h.split("\n\n").map((b) => b.trim().split("\n").filter((l) => !l.startsWith("#"))).filter((r) => r.length > 0);
    const hits = (path: string) =>
      rules.filter(([p, ...lines]) => (p.endsWith("*") ? path.startsWith(p.slice(0, -1)) : path === p) && lines.some((l) => l.includes("Cache-Control"))).length;
    for (const path of ["/", "/ko/", "/en/mermaid-preview/", "/sw.js", "/assets/a.js"]) expect(hits(path), path).toBe(1);
  });

  it("CSP — 인라인 스크립트 금지, 원격은 이미지·연결(https)만", () => {
    const c = buildCsp();
    expect(c).toContain("script-src 'self';");
    expect(c).not.toContain("unsafe-eval");
    expect(c).toContain("img-src 'self' data: blob: https:");
    expect(c).toContain("connect-src 'self' https:");
    expect(c).toContain("frame-ancestors 'none'");
    expect(c).not.toMatch(/\bhttp:/);
    expect(buildCsp(["http://127.0.0.1:1"])).toContain("connect-src 'self' https: http://127.0.0.1:1");
  });

  it("_redirects — 언어 없는 랜딩 → en", () => {
    const r = redirectsFile();
    expect(r).toContain("/mermaid-preview/  /en/mermaid-preview/  301");
    expect(r).not.toMatch(/^\/ /m); // 루트는 언어 고르기 페이지가 맡는다
  });

  it("manifest — 언어별 시작 주소, 같은 id, .md 파일 핸들러", () => {
    const m = JSON.parse(manifestJson("ko"));
    expect(m.start_url).toBe("/ko/");
    expect(m.id).toBe("/");
    expect(JSON.parse(manifestJson("en")).id).toBe(m.id);
    expect(m.file_handlers[0].accept["text/markdown"]).toContain(".md");
    expect(m.file_handlers[0].action).toBe("/ko/");
    expect(m.launch_handler.client_mode).toBe("focus-existing");
    expect(m.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
  });

  it("미리 받기 목록 — 페이지는 디렉터리 주소, 배포 설정 파일 제외", () => {
    const list = precacheList(["index.html", "en/index.html", "ko/mermaid-preview/index.html", "assets/a-1.js", "_headers", "sw.js", "sitemap.xml", "404.html", "vite.svg"]);
    expect(list).toEqual(["/", "/404.html", "/assets/a-1.js", "/en/", "/ko/mermaid-preview/"]);
  });

  it("서비스 워커 — 판 이름·목록이 박히고 문법이 맞다", () => {
    const sw = serviceWorkerJs({ version: versionOf(["a"]), precache: ["/en/"] });
    expect(sw).toContain(`readme-md-${versionOf(["a"])}`);
    expect(() => new Function(sw)).not.toThrow();
    expect(versionOf(["a"])).not.toBe(versionOf(["b"]));
    expect(versionOf(["a"])).toMatch(/^[0-9a-f]{8}$/);
  });
});
