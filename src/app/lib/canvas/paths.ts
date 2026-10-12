/**
 * file 노드의 경로. JSON Canvas 명세는 "파일 경로"라고만 하고, 옵시디언은 **볼트 루트 기준 상대 경로**를 쓴다
 * (`folder/note.md`, 구분자 `/`). 이 앱에는 볼트가 없으므로:
 * - 읽기: 절대 경로면 그대로, 아니면 **볼트 루트(`.obsidian` 이 있는 조상) → 캔버스 폴더 → 그 위 조상들** 순서로
 *   이어 붙여 본다(존재 확인은 Rust 가 — `canvas_cards`). 그래서 옵시디언 볼트 안 캔버스도, 볼트 밖에서 우리가 만든 것도 열린다.
 * - 쓰기: 볼트 안이면 볼트 루트 기준, 아니면 **캔버스 폴더 기준** 상대 경로(`/`). 캔버스 폴더 밖이면 `../` 를 쓴다.
 */

const SEP = /[\\/]+/;

function splitPath(p: string): { root: string; parts: string[] } {
  const m = /^([A-Za-z]:)[\\/]?|^(\\\\[^\\/]+[\\/][^\\/]+)[\\/]?|^\//.exec(p);
  const root = m ? (m[1] ? m[1] + "\\" : m[2] ? m[2] + "\\" : "/") : "";
  const rest = m ? p.slice(m[0].length) : p;
  return { root, parts: rest.split(SEP).filter(Boolean) };
}

export function isAbsolute(p: string): boolean {
  return splitPath(p).root !== "";
}

export function dirOfPath(p: string): string {
  const { root, parts } = splitPath(p);
  return root + parts.slice(0, -1).join(root === "/" ? "/" : "\\");
}

function join(base: string, rel: string): string {
  const { root, parts } = splitPath(base);
  const out = [...parts];
  for (const seg of rel.split(SEP).filter(Boolean)) {
    if (seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return root + out.join(root === "/" ? "/" : "\\");
}

/** 열어 볼 후보(앞이 우선). `vaultRoot` 는 Rust 가 찾은 `.obsidian` 조상(없으면 null). */
export function fileCandidates(file: string, canvasPath: string, vaultRoot: string | null): string[] {
  if (isAbsolute(file)) return [file];
  const out: string[] = [];
  if (vaultRoot) out.push(join(vaultRoot, file));
  let dir = dirOfPath(canvasPath);
  for (let i = 0; i < 32; i++) {
    const c = join(dir, file);
    if (!out.includes(c)) out.push(c);
    const up = dirOfPath(dir);
    if (!up || up === dir || splitPath(up).parts.length === splitPath(dir).parts.length) break;
    dir = up;
  }
  return out;
}

const norm = (p: string) => p.replace(/\//g, "\\").toLowerCase();

/** 새 file 노드에 적을 경로 — 볼트 안이면 볼트 기준, 아니면 캔버스 폴더 기준(`/` 구분). 드라이브가 다르면 절대 경로. */
export function pathForNode(absFile: string, canvasPath: string, vaultRoot: string | null): string {
  const a = splitPath(absFile);
  const baseDir = vaultRoot && norm(absFile).startsWith(norm(vaultRoot).replace(/\\?$/, "\\")) ? vaultRoot : dirOfPath(canvasPath);
  const b = splitPath(baseDir);
  if (a.root.toLowerCase() !== b.root.toLowerCase()) return absFile;
  let i = 0;
  while (i < a.parts.length && i < b.parts.length && a.parts[i].toLowerCase() === b.parts[i].toLowerCase()) i++;
  return [...Array(b.parts.length - i).fill(".."), ...a.parts.slice(i)].join("/");
}
