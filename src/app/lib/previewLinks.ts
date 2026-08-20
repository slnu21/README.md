// 미리보기·프레젠테이션 iframe 문서의 링크 처리(DOM 글루).
// 분류 규칙은 lib/links.ts(순수·테스트), 여기서는 그 결정을 실제 동작으로 옮긴다.
//
// ── 링크 클릭은 **반드시** 호스트가 가로챈다 ──────────────────────────────────
// srcdoc 문서의 URL 은 about:srcdoc 인데 base URL 은 부모(tauri.localhost)에서 상속된다.
// 그래서 "#제목" 조차 tauri.localhost/#제목 으로 해석돼 같은 문서 내 스크롤이 아니라
// **전체 내비게이션**이 되고, srcdoc 내용이 사라져 미리보기가 빈 화면이 된다.
import { classifyLink, howFromModifiers, type OpenHow } from "./links";
import { dirOf, resolvePath } from "./paths";
import { openExternalUrl } from "./tauri";

/** 링크 종류별로 호스트가 할 일. 미리보기와 프레젠테이션이 각자 채운다. */
export interface LinkSink {
  /** 같은 문서 안 제목으로 스크롤 */
  anchor(id: string): void;
  /** 로컬 파일(문서 폴더 기준으로 해석된 경로) */
  path(abs: string, how: OpenHow): void;
  /** 열 수 없는 링크(data:·javascript:·file:·앱 스킴 등) */
  ignored(href: string): void;
  /** 외부 URL 을 OS 에 넘기지 못했다 */
  urlFailed(url: string, detail: string): void;
}

/** 링크가 실제로 가리키는 곳. DOMPurify 가 스킴 때문에 href 를 지웠으면 그 흔적을 본다
 *  (lib/sanitize.ts 의 data-blocked-href — 값만 기록된 것이라 브라우저는 실행하지 않는다). */
function targetOf(a: Element): string | null {
  return a.getAttribute("href") ?? a.getAttribute("data-blocked-href");
}

/** iframe 문서의 click 리스너 본체. `docPath` 는 지금 보고 있는 문서의 경로(상대경로 기준). */
export function handleLinkClick(e: MouseEvent, docPath: string, sink: LinkSink): void {
  const el = e.target as HTMLElement | null;
  const a = el?.closest("a");
  if (!a) return;
  // href 가 비어 있어도 막는다 — <a href=""> 는 base URL 로 이동해 미리보기를 날린다.
  e.preventDefault();

  const href = targetOf(a);
  const link = classifyLink(href);
  switch (link.kind) {
    case "anchor":
      sink.anchor(link.id);
      return;
    case "url":
      // 외부 링크는 목적지가 브라우저·메일 클라이언트 하나뿐이라 수식어를 보지 않는다.
      void openExternalUrl(link.url).catch((err: unknown) => sink.urlFailed(link.url, String(err)));
      return;
    case "path":
      sink.path(resolvePath(dirOf(docPath), link.rel), howFromModifiers(e));
      return;
    case "ignored":
      // 빈 href 는 클릭 사고에 가깝다 — 이동만 막고 조용히 넘어간다.
      if (link.reason === "scheme") sink.ignored(href ?? "");
      return;
  }
}

/** 링크에 목적지를 title 로 달아 준다 — 누르기 전에 어디로 가는지 보이게.
 *  작성자가 `[텍스트](url "제목")` 로 붙인 title 은 건드리지 않는다.
 *  srcdoc 은 재렌더마다 새 문서라 로드될 때마다 다시 붙여야 한다. */
export function annotateLinkTitles(doc: Document, docPath: string): void {
  const dir = dirOf(docPath);
  for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href], a[data-blocked-href]")) {
    if (a.title) continue;
    const link = classifyLink(targetOf(a));
    if (link.kind === "url") a.title = link.url;
    else if (link.kind === "path") a.title = resolvePath(dir, link.rel);
    else if (link.kind === "ignored" && link.reason === "scheme") a.title = targetOf(a) ?? "";
  }
}
