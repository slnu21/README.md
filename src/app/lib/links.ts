// 미리보기 링크 분류(순수). "무엇을 눌렀는가"·"어디에 열 것인가"만 판단한다.
// DOM·Tauri를 건드리지 않아 node 환경 vitest로 그대로 테스트된다 — 실제로 여는 일은
// lib/previewLinks.ts(DOM 글루)가 한다.

/** 링크를 눌렀을 때 어디에 열 것인가. 수식어 키에서 나온다. */
export type OpenHow = "here" | "beside" | "reveal";

export type Link =
  | { kind: "anchor"; id: string } // 같은 문서 안 제목(#앵커)
  | { kind: "url"; url: string } // OS 기본 브라우저·메일로 넘길 외부 링크
  | { kind: "path"; rel: string } // 로컬 파일(문서 폴더 기준으로 해석해야 함)
  | { kind: "ignored"; reason: "empty" | "scheme" };

/** OS로 넘길 스킴. `capabilities/default.json`의 `opener:default`가 주는 기본 스코프
 *  (`mailto:*`·`tel:*`·`http://*`·`https://*`)와 **정확히** 같아야 한다.
 *  여기서 통과시킨 스킴을 스코프가 막으면 클릭이 조용히 죽는다 — v0.6.8~v0.7.0이 그랬다
 *  (그때는 스킴이 아니라 `open_url`이 아닌 `open_path`를 부른 것이 원인이었다). */
const EXTERNAL_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/** RFC 3986 스킴 문법. 이 검사를 통과해도 한 글자면 드라이브 문자로 본다(아래 참고). */
const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/** 잘못된 퍼센트 인코딩은 예외를 던진다 — 그러면 원문을 그대로 쓴다. */
function decodeAnchor(s: string): string {
  try {
    // markdown-it이 비ASCII 앵커를 퍼센트 인코딩하므로 디코드해서 id를 찾는다.
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function decodePath(s: string): string {
  try {
    // 경로는 `%20`만 풀면 되고 `#`·`?` 같은 구분자는 살려야 하므로 decodeURI를 쓴다.
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** `file:///C:/notes/a.md` → `C:/notes/a.md`. 슬래시 셋(호스트 없음)만 받는다. */
function fileUrlToPath(raw: string): Link {
  const m = /^file:\/\/\/([^?#]*)/i.exec(raw);
  if (!m) return { kind: "ignored", reason: "scheme" };
  const decoded = decodePath(m[1]);
  if (!decoded) return { kind: "ignored", reason: "scheme" };
  // 드라이브 문자로 시작하지 않으면 루트 절대경로다 — 정규화하며 삼킨 앞 슬래시를 되돌린다.
  return { kind: "path", rel: /^[a-zA-Z]:/.test(decoded) ? decoded : `/${decoded}` };
}

/** 미리보기 문서의 `<a href>` → 처리 방법. href 문자열만 보고 결정한다. */
export function classifyLink(href: string | null | undefined): Link {
  const raw = (href ?? "").trim();
  if (!raw) return { kind: "ignored", reason: "empty" };
  if (raw.startsWith("#")) return { kind: "anchor", id: decodeAnchor(raw.slice(1)) };

  // 스킴 없는 `//host/path` — 프로토콜 상대 URL이라 http인지 https인지 알 수 없다.
  // 경로로 해석하면 `<문서폴더>/host/path`라는 엉뚱한 파일을 열려고 한다.
  if (raw.startsWith("//")) return { kind: "ignored", reason: "scheme" };

  const m = SCHEME_RE.exec(raw);
  // 한 글자 스킴은 Windows 드라이브 문자다(`C:/notes/a.md`). 실제로 쓰이는 URL 스킴은
  // 모두 두 글자 이상이라 이 구분으로 충분하다 — 이걸 안 하면 절대경로 링크가 전부
  // "모르는 스킴"으로 버려진다.
  if (m && m[1].length > 1) {
    const scheme = m[1].toLowerCase();
    if (EXTERNAL_SCHEMES.has(scheme)) return { kind: "url", url: raw };
    // file: 은 로컬 파일을 가리키는 정당한 링크다 — 경로로 옮겨 다른 로컬 링크와 똑같이
    // 다룬다(열지 말지는 뒤에서 확장자로 다시 판단한다). 호스트가 붙은 file://server/share
    // 는 UNC 라 확실히 옮길 수 없어 무시한다.
    if (scheme === "file") return fileUrlToPath(raw);
    // data:·blob:·javascript:·about:은 열지 않는다(스크립트·임의 콘텐츠 실행 표면).
    // ftp:·앱 스킴(obsidian:·vscode: 등)도 여기서 끊는다 — 예전엔 이것들이 로컬 경로
    // 분기로 새서 `<문서폴더>/obsidian:/open` 같은 경로를 열려고 했다.
    return { kind: "ignored", reason: "scheme" };
  }

  // 로컬 경로. 프래그먼트를 뗀다 — 대상 문서 안의 특정 제목까지 이동하는 것은
  // 지원하지 않는다(문서만 열린다).
  const rel = decodePath(raw.split("#")[0]);
  if (!rel) return { kind: "ignored", reason: "empty" };
  return { kind: "path", rel };
}

export interface Modifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** 수식어 → 어디에 열 것인가.
 *
 *  **맨클릭이 곧 열기**다. 미리보기는 편집면이 아니라 읽는 면이라 클릭에 다른 뜻이 없고,
 *  Ctrl+클릭을 요구하는 편집기들(VS Code 소스·Typora)은 클릭이 이미 "커서 놓기"인 곳이다.
 *  수식어는 *추가* 목적지에만 쓴다:
 *   · Ctrl(⌘) = 옆 패널(탭 우클릭 "옆에 나란히 열기"와 같은 동작)
 *   · Alt     = 탐색기에서 위치 열기
 *  외부 URL은 목적지가 브라우저 하나뿐이라 호출부가 이 값을 보지 않는다. */
export function howFromModifiers(m: Modifiers): OpenHow {
  if (m.ctrlKey || m.metaKey) return "beside";
  if (m.altKey) return "reveal";
  return "here";
}
