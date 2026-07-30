// 경로 해석 공용. 미리보기의 상대경로 이미지·문서 링크가 함께 쓴다.
// Windows 경로(드라이브 문자·역슬래시)와 `.`/`..` 세그먼트를 다룬다. 출력은 슬래시(`/`) 통일 —
// Rust std::fs 는 Windows에서 두 구분자를 모두 받는다.

/** 경로의 폴더 부분. `C:/a/b.md` → `C:/a`. 구분자가 없으면 빈 문자열. */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(0, i) : "";
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
