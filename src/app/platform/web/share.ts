// 공유 링크 — 문서를 압축해 주소의 `#` 뒤에 담는다. 서버 없음: 해시는 요청에 실리지 않아 서버(Cloudflare)로 가지 않는다.
// 형식: `#n=<파일 이름(URI 인코딩)>&md=<base64url(deflate-raw(UTF-8))>` — 둘 다 URLSearchParams 로 읽힌다
// (base64url 글자 `-`·`_` 는 그대로 안전하고 `+` 가 없다).
// 길이 상한: 해시 32,000자. 해시는 서버 제한을 안 받지만, 메신저·메일·링크 미리보기가 그보다 긴 주소를 자르는 일이 흔하다.
// 압축 후 32KB 면 README 대부분(평문 약 80~120KB)이 들어간다. 넘으면 길이를 알려 주고 파일로 보내라고 안내한다.
import { crc32, deflateRaw, fromBase64Url, hasDeflateRaw, inflateRaw, toBase64Url } from "./bytes";

export const SHARE_MAX_HASH = 32_000;
export const SHARE_DEFAULT_NAME = "shared.md";

export type ShareBuild =
  | { ok: true; hash: string; length: number }
  | { ok: false; reason: "too-long"; length: number; max: number }
  | { ok: false; reason: "unsupported" };

export interface SharedDoc {
  name: string;
  text: string;
  /** 같은 링크는 같은 가상 경로로 — 다시 열어도 탭이 둘로 갈라지지 않게. */
  id: string;
}

export class ShareError extends Error {
  constructor(public reason: "corrupt" | "unsupported") {
    super(`EWEBSHARE: ${reason}`);
  }
}

/** 파일 이름 정리 — 경로 구분자 제거, 마크다운 확장자 보장. */
export function shareName(name: string | null | undefined): string {
  const base = (name ?? "").split(/[\\/]/).pop()?.trim() ?? "";
  if (!base) return SHARE_DEFAULT_NAME;
  return /\.(md|markdown|mdx|txt)$/i.test(base) ? base.slice(0, 120) : `${base.slice(0, 115)}.md`;
}

/** 문서 → 해시(앞의 `#` 없이). 상한을 넘으면 길이와 함께 거절. */
export async function encodeShare(text: string, name: string, max = SHARE_MAX_HASH): Promise<ShareBuild> {
  if (!hasDeflateRaw()) return { ok: false, reason: "unsupported" };
  const payload = toBase64Url(await deflateRaw(new TextEncoder().encode(text)));
  const hash = `n=${encodeURIComponent(shareName(name))}&md=${payload}`;
  return hash.length > max ? { ok: false, reason: "too-long", length: hash.length, max } : { ok: true, hash, length: hash.length };
}

/** 해시가 공유 링크인가(풀지 않고). */
export function isShareHash(hash: string): boolean {
  return /(?:^|[#&])md=/.test(hash);
}

/** 해시 → 문서. 공유 링크가 아니면 null, 잘렸거나 깨졌으면 ShareError. */
export async function decodeShare(hash: string): Promise<SharedDoc | null> {
  const h = hash.replace(/^#/, "");
  if (!isShareHash(h)) return null;
  const params = new URLSearchParams(h);
  const payload = (params.get("md") ?? "").replace(/\s+/g, "");
  if (!hasDeflateRaw()) throw new ShareError("unsupported");
  const bytes = payload ? fromBase64Url(payload) : undefined;
  if (!bytes) throw new ShareError("corrupt");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await inflateRaw(bytes));
  } catch {
    throw new ShareError("corrupt");
  }
  const id = crc32(new TextEncoder().encode(payload)).toString(16).padStart(8, "0");
  return { name: shareName(params.get("n")), text, id };
}

/** 공유 문서의 가상 경로. */
export const sharePath = (doc: SharedDoc): string => `/web/share-${doc.id}/${doc.name}`;
