// 지금 페이지가 누구인가 — 정적 HTML 의 `<html lang data-route data-mode>`(빌드가 박는다)를 읽는다.
// 그리고 앱 스토어가 만들어지기 **전에** 그 영속 상태(localStorage `md-reader`)의 언어·보기를 이 페이지 것으로 맞춘다 —
// 그래야 /ko/ 가 첫 페인트부터 한국어이고 /markdown-viewer/ 가 처음부터 리딩 모드다(깜빡임 없음).
// 모듈 최상위 부작용 없음(호출은 platform/web/index.ts 가 한다).
import { isLang, routeById, DEFAULT_LANG, type Lang, type RouteDef } from "./site/routes";

export interface PageInfo {
  lang: Lang;
  route: RouteDef;
  base: string;
}

export function readPage(root: { lang?: string; dataset?: Record<string, string | undefined> } | null | undefined, base = "/"): PageInfo {
  const lang = root?.lang && isLang(root.lang) ? root.lang : DEFAULT_LANG;
  return { lang, route: routeById(root?.dataset?.route), base: root?.dataset?.base || base };
}

/** zustand persist 원문({state,version})의 일부 필드만 바꾼다. 원문이 없거나 깨졌으면 새로 만든다. */
export function patchPersisted(raw: string | null, patch: Record<string, unknown>): string {
  let obj: { state?: Record<string, unknown>; version?: number } = {};
  try {
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === "object" && !Array.isArray(p)) obj = p;
  } catch {
    /* 깨진 원문 — 스토어도 어차피 버린다 */
  }
  const state = obj.state && typeof obj.state === "object" ? obj.state : {};
  return JSON.stringify({ ...obj, state: { ...state, ...patch }, version: obj.version ?? 0 });
}

/** 이 페이지가 정하는 영속 필드 — 언어는 늘, 보기는 랜딩이 정할 때만. */
export function pagePatch(page: PageInfo): Record<string, unknown> {
  const patch: Record<string, unknown> = { language: page.lang };
  if (page.route.mode === "reader") patch.readerMode = true;
  if (page.route.mode === "split") patch.readerMode = false;
  return patch;
}

export const STORE_KEY = "md-reader";

export function applyPageToStorage(storage: Pick<Storage, "getItem" | "setItem"> | undefined, page: PageInfo): void {
  if (!storage) return;
  try {
    storage.setItem(STORE_KEY, patchPersisted(storage.getItem(STORE_KEY), pagePatch(page)));
  } catch {
    /* 저장소 없음 — 앱이 마운트 때 언어를 다시 맞춘다(WebEdition) */
  }
}
