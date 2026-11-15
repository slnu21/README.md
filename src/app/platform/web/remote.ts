// URL 로 열기(`?url=`) — 원격 마크다운을 브라우저가 직접 받는다(서버 경유 없음 → 원본이 CORS 를 허용해야 한다).
//   · github.com 의 blob·저장소·tree 주소는 raw.githubusercontent.com 원문으로 바꾼다(GitHub 페이지는 HTML 이고 CORS 가 없다).
//   · gist.github.com/<user>/<id> → gist.githubusercontent.com/…/raw · gitlab.com …/-/blob/ → …/-/raw/
//   · https 만. http 는 루프백(개발·프로브 픽스처)만 — 배포 CSP 는 어차피 https 만 연결한다.
// 가상 경로: `/web/url/<host>/<경로>` — URL 이 경로에 그대로 들어 있어 상태 없이 되돌릴 수 있다. 그래서 문서 옆의
// 상대경로 이미지·링크(`./img/a.png`, `../docs/b.md`)가 앱의 평소 경로 해석(resolvePath)만으로 같은 저장소의 URL 이 된다.
// 모듈 최상위 부작용 없음.

export type SourceUrl = { ok: true; url: string; converted: boolean } | { ok: false; reason: "empty" | "invalid" | "protocol" };

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

function githubToRaw(u: URL): string | null {
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo, kind, ref, ...rest] = parts;
  const r = repo.replace(/\.git$/, "");
  if (!kind) return `https://raw.githubusercontent.com/${owner}/${r}/HEAD/README.md`;
  if ((kind === "blob" || kind === "raw") && ref && rest.length) return `https://raw.githubusercontent.com/${owner}/${r}/${ref}/${rest.join("/")}`;
  if (kind === "tree" && ref) return `https://raw.githubusercontent.com/${owner}/${r}/${ref}/${[...rest, "README.md"].join("/")}`;
  return null;
}

/** 사용자가 준 주소 → 실제로 받을 원문 주소. */
export function normalizeSourceUrl(input: string): SourceUrl {
  const s = input.trim();
  if (!s) return { ok: false, reason: "empty" };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (u.protocol === "http:" && !LOOPBACK.test(u.hostname)) return { ok: false, reason: "protocol" };
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "protocol" };
  u.hash = "";
  const host = u.hostname.toLowerCase();
  if (host === "github.com" || host === "www.github.com") {
    const raw = githubToRaw(u);
    return raw ? { ok: true, url: raw, converted: true } : { ok: false, reason: "invalid" };
  }
  if (host === "gist.github.com") {
    const [user, id] = u.pathname.split("/").filter(Boolean);
    if (user && id) return { ok: true, url: `https://gist.githubusercontent.com/${user}/${id}/raw`, converted: true };
  }
  if (host === "gitlab.com" && u.pathname.includes("/-/blob/")) {
    u.pathname = u.pathname.replace("/-/blob/", "/-/raw/");
    return { ok: true, url: u.href, converted: true };
  }
  return { ok: true, url: u.href, converted: false };
}

const PREFIX = { "https:": "/web/url/", "http:": "/web/url-http/" } as const;

/** 원문 주소 → 가상 경로(쿼리는 버린다 — 탭 제목·확장자 판정이 경로의 끝 조각을 본다). */
export function urlToWebPath(url: string): string {
  const u = new URL(url);
  const prefix = u.protocol === "http:" ? PREFIX["http:"] : PREFIX["https:"];
  const segs = u.pathname.split("/").map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  let path = segs.join("/");
  if (path.endsWith("/") || path === "") path += "index.md";
  else if (!/\.[a-z0-9]+$/i.test(path)) path += "/index.md"; // gist raw 처럼 이름 없는 주소
  return `${prefix}${u.host}${path.startsWith("/") ? "" : "/"}${path}`;
}

export const isUrlWebPath = (path: string): boolean => path.startsWith(PREFIX["https:"]) || path.startsWith(PREFIX["http:"]);

/** 가상 경로 → 주소(이미지·링크 해석). 원격 경로가 아니면 null. */
export function webPathToUrl(path: string): string | null {
  const p = path.replace(/\\/g, "/");
  const proto = p.startsWith(PREFIX["https:"]) ? "https:" : p.startsWith(PREFIX["http:"]) ? "http:" : null;
  if (!proto) return null;
  const rest = p.slice(PREFIX[proto].length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const host = rest.slice(0, slash);
  const tail = rest
    .slice(slash + 1)
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${proto}//${host}/${tail}`;
}

export type RemoteReason = "network" | "http" | "too-large" | "html" | "timeout";

export class RemoteError extends Error {
  constructor(
    public reason: RemoteReason,
    public status = 0,
  ) {
    super(`EWEBURL: ${reason}${status ? ` ${status}` : ""}`);
  }
}

export interface FetchOpts {
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
}

export const REMOTE_MAX_BYTES = 5 * 1024 * 1024;

async function get(url: string, o: FetchOpts): Promise<Response> {
  const f = o.fetchImpl ?? fetch;
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), o.timeoutMs ?? 15_000);
  try {
    // credentials 를 보내지 않는다(남의 사이트 로그인 상태로 읽지 않게) · 리퍼러는 출처만.
    const res = await f(url, { signal: ctl?.signal, credentials: "omit", referrerPolicy: "strict-origin-when-cross-origin" });
    if (!res.ok) throw new RemoteError("http", res.status);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > (o.maxBytes ?? REMOTE_MAX_BYTES)) throw new RemoteError("too-large");
    return res;
  } catch (e) {
    if (e instanceof RemoteError) throw e;
    if ((e as { name?: string })?.name === "AbortError") throw new RemoteError("timeout");
    // CORS 거절·DNS·오프라인은 브라우저가 모두 TypeError 하나로 준다 — 구별할 수 없다
    throw new RemoteError("network");
  } finally {
    clearTimeout(timer);
  }
}

/** 원격 텍스트(마크다운). HTML 페이지면 거절 — 대개 원문(raw) 주소가 아닌 웹 페이지 주소다. */
export async function fetchText(url: string, o: FetchOpts = {}): Promise<string> {
  const res = await get(url, o);
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  const text = await res.text();
  if (text.length > (o.maxBytes ?? REMOTE_MAX_BYTES)) throw new RemoteError("too-large");
  if (type.includes("text/html") || /^\s*<!doctype html/i.test(text)) throw new RemoteError("html");
  return text.replace(/\r\n?/g, "\n");
}

export async function fetchBytes(url: string, o: FetchOpts = {}): Promise<Uint8Array> {
  const res = await get(url, o);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > (o.maxBytes ?? REMOTE_MAX_BYTES)) throw new RemoteError("too-large");
  return buf;
}

/** 탭 제목이 될 이름(경로의 끝 조각). */
export const nameOfWebPath = (path: string): string => path.split("/").pop() || "index.md";
