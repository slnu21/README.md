// 웹 에디션 페이지 표 — 언어(ko/en) × 랜딩(앱·뷰어·mermaid·README). 빌드(정적 페이지 생성)와 런타임(언어 전환 이동)이
// 같은 표를 본다. 순수 모듈(부작용 없음) — 데스크톱 번들에는 들어가지 않는다(웹 전용 모듈만 import 한다).
//
// URL 규칙(같은 브랜드의 timer.ondolworks.com 과 같다): `/<lang>/<slug>/` · 루트 `/` 는 언어 고르기(자동 이동).
// x-default = en.

export type Lang = "en" | "ko";
export const LANGS: readonly Lang[] = ["en", "ko"];
export const DEFAULT_LANG: Lang = "en";
/** 언어 선호(루트 자동 이동이 본다) — 앱에서 언어를 바꾸면 런타임이 쓴다. */
export const LANG_PREF_KEY = "readme-md.web.lang";

export type RouteId = "app" | "markdown-viewer" | "mermaid-preview" | "readme-preview";
/** 페이지에 들어올 때의 보기 — keep = 사용자가 마지막에 둔 그대로, reader = 미리보기만, split = 편집+미리보기. */
export type RouteMode = "keep" | "reader" | "split";
export type SampleId = "viewer" | "mermaid" | "readme";

export interface RouteDef {
  id: RouteId;
  /** 경로 조각("" = 언어 루트). */
  slug: string;
  mode: RouteMode;
  /** 열린 문서가 하나도 없을 때 보여 줄 견본. */
  sample: SampleId | null;
}

export const ROUTES: readonly RouteDef[] = [
  { id: "app", slug: "", mode: "keep", sample: null },
  { id: "markdown-viewer", slug: "markdown-viewer", mode: "reader", sample: "viewer" },
  { id: "mermaid-preview", slug: "mermaid-preview", mode: "split", sample: "mermaid" },
  { id: "readme-preview", slug: "readme-preview", mode: "split", sample: "readme" },
];

export const isLang = (x: unknown): x is Lang => x === "en" || x === "ko";

export function routeById(id: string | null | undefined): RouteDef {
  return ROUTES.find((r) => r.id === id) ?? ROUTES[0];
}

/** base 를 `/…/` 모양으로(앞뒤 슬래시 하나씩). */
export function normBase(base: string | undefined): string {
  const b = (base ?? "/").trim();
  if (!b || b === "/") return "/";
  return `/${b.replace(/^\/+|\/+$/g, "")}/`;
}

/** 페이지의 경로(디렉터리 형태, 끝 슬래시). */
export function routePath(id: RouteId, lang: Lang, base = "/"): string {
  const r = routeById(id);
  return `${normBase(base)}${lang}/${r.slug ? `${r.slug}/` : ""}`;
}

/** 빌드 산출물 안의 파일 이름(base 와 무관 — 출력 폴더 기준). */
export function routeFile(id: RouteId, lang: Lang): string {
  const r = routeById(id);
  return `${lang}/${r.slug ? `${r.slug}/` : ""}index.html`;
}

/** 경로 → 페이지. 모르는 경로면 null. `index.html` 꼬리와 끝 슬래시 없는 모양도 받는다. */
export function parseRoutePath(pathname: string, base = "/"): { lang: Lang; route: RouteDef } | null {
  const b = normBase(base);
  if (!pathname.startsWith(b)) return null;
  const rest = pathname.slice(b.length).replace(/index\.html$/, "").replace(/\/+$/, "");
  const [lang, slug = "", ...more] = rest.split("/");
  if (!isLang(lang) || more.length) return null;
  const route = ROUTES.find((r) => r.slug === slug);
  return route ? { lang, route } : null;
}

/** 같은 페이지의 다른 언어 경로. 모르는 경로면 그 언어의 앱 첫 화면. */
export function counterpartPath(pathname: string, to: Lang, base = "/"): string {
  const hit = parseRoutePath(pathname, base);
  return routePath(hit ? hit.route.id : "app", to, base);
}
