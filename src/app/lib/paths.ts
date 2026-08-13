// 경로 해석 공용. 미리보기의 상대경로 이미지·문서 링크가 함께 쓴다.
// Windows 경로(드라이브 문자·역슬래시)와 `.`/`..` 세그먼트를 다룬다. 출력은 슬래시(`/`) 통일 —
// Rust std::fs 는 Windows에서 두 구분자를 모두 받는다.
import { READABLE_RE } from "./fileTypes";

/** 경로의 폴더 부분. `C:/a/b.md` → `C:/a`. 구분자가 없으면 빈 문자열. */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(0, i) : "";
}

/** `path` 가 `root` 자신이거나 그 하위인가.
 *
 *  단순 `startsWith` 는 형제 접두어를 잡는다(`C:/w` 가 `C:/workspace/a.md` 를 삼킨다) — 구분자
 *  경계를 요구해야 한다. 구분자 종류와 ASCII 대소문자는 무시한다(Windows).
 *  Rust 쪽 `commands/search.rs rel_under()` 와 같은 규칙이다 — 한쪽만 고치지 말 것. */
export function isUnderRoot(path: string, root: string): boolean {
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();
  const r = norm(root).replace(/\/+$/, "");
  if (!r) return false;
  const p = norm(path);
  return p === r || p.startsWith(r + "/");
}

/** 경로 중 하나라도 루트 중 하나의 아래인가(빈 배열이면 false). */
export function anyUnderRoots(paths: string[], roots: string[]): boolean {
  return paths.some((p) => roots.some((r) => isUnderRoot(p, r)));
}

// ── 새 문서 이름 ─────────────────────────────────────────────────────────────
export type NameError = "empty" | "separator" | "illegal-chars" | "reserved" | "too-long";
export interface NameCheck {
  ok: boolean;
  name: string;
  error?: NameError;
}

/** Windows 예약 장치 이름. `CON.md` 도 못 만든다 — 확장자를 붙여도 예약이다. */
const RESERVED_RE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
/** 파일명에 못 쓰는 문자 + 제어문자. 구분자(`/`·`\`)는 사유를 나눠 안내하려고 따로 본다. */
// eslint-disable-next-line no-control-regex
const ILLEGAL_RE = /[<>:"|?*\u0000-\u001f]/;

/** 사용자가 입력한 문서 이름 → 실제 파일명. 실패 사유는 코드로 돌려주고 문구는 호출부가 지역화한다. */
export function normalizeDocName(raw: string): NameCheck {
  let s = raw.trim();
  if (/[/\\]/.test(s)) return { ok: false, name: s, error: "separator" };
  if (ILLEGAL_RE.test(s)) return { ok: false, name: s, error: "illegal-chars" };
  // Windows 는 후행 점·공백을 조용히 잘라내 "만들었는데 못 여는" 파일이 된다 — 먼저 없앤다.
  s = s.replace(/[. ]+$/, "");
  if (!s) return { ok: false, name: raw.trim(), error: "empty" };

  // 확장자 판정은 READABLE_RE 하나로 통일한다. "점이 있으면 확장자"로 보면 `v1.2` 가
  // 확장자 `.2` 인 파일이 되어 열 수도 미리보기할 수도 없다.
  const hasExt = READABLE_RE.test(s);
  const stem = hasExt ? s.slice(0, s.lastIndexOf(".")) : s;
  if (RESERVED_RE.test(stem)) return { ok: false, name: s, error: "reserved" };

  const name = hasExt ? s : `${s}.md`;
  if (name.length > 255) return { ok: false, name, error: "too-long" };
  return { ok: true, name };
}

/** 새 문서를 만들 기본 폴더: 활성 문서 폴더 → 최근 문서 폴더 → 빈 문자열(다이얼로그 기본값에 맡김). */
export function pickDefaultDir(activePath: string | null, recent: string[]): string {
  const from = (p: string | null | undefined) => (p ? dirOf(p) : "");
  return from(activePath) || from(recent[0]) || "";
}

/** 절대 경로인가(드라이브 문자 또는 루트 시작). */
export function isAbsolute(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\");
}

/** `dir` 기준으로 `rel`을 해석한 경로. `rel`이 절대경로면 그대로 정규화만 한다.
 *  `.`/`..` 를 실제로 접는다 — 이전 구현(previewImages.joinPath)은 `./`만 떼고 `..`를 남겨
 *  상위 폴더를 가리키는 상대경로가 열리지 않았다. */
export function resolvePath(dir: string, rel: string): string {
  const raw = isAbsolute(rel) ? rel : dir ? `${dir}/${rel}` : rel;
  const s = raw.replace(/\\/g, "/");
  // 드라이브(`C:`)나 루트(``)는 접기 대상이 아니므로 떼어 둔다.
  const driveMatch = /^([a-zA-Z]:)\/?/.exec(s);
  const rooted = s.startsWith("/");
  const prefix = driveMatch ? `${driveMatch[1]}/` : rooted ? "/" : "";
  const body = driveMatch ? s.slice(driveMatch[0].length) : rooted ? s.slice(1) : s;

  const out: string[] = [];
  for (const seg of body.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      // 루트/드라이브 위로는 올라가지 않는다. 상대 경로에서는 ".." 를 그대로 남긴다.
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!prefix) out.push("..");
      continue;
    }
    out.push(seg);
  }
  return prefix + out.join("/");
}
