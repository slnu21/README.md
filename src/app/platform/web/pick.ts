// 웹 파일 고르기·저장 — File System Access API(Chromium)가 있으면 핸들, 없으면 <input type=file> 열기 + 다운로드 저장.
// 변환 함수(필터 → accept/types, 기본 경로 → 제안 이름)는 순수라 테스트로 지킨다.
import type { FileFilter } from "../types";
import type { FileHandleLike } from "./files";

type PickerType = { description: string; accept: Record<string, string[]> };

interface FsAccessWindow {
  showOpenFilePicker?: (o: { multiple?: boolean; types?: PickerType[]; excludeAcceptAllOption?: boolean }) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (o: { suggestedName?: string; types?: PickerType[] }) => Promise<FileHandleLike>;
}

/** 이 브라우저가 파일 핸들(제자리 저장)을 주는가. */
export function hasFsAccess(w: unknown = globalThis): boolean {
  const x = w as FsAccessWindow;
  return typeof x?.showOpenFilePicker === "function" && typeof x?.showSaveFilePicker === "function";
}

/** `<input accept>` 문자열 — `.md,.markdown,…`(중복 제거). */
export function acceptOf(filters: FileFilter[]): string {
  const exts = new Set<string>();
  for (const f of filters) for (const e of f.extensions) exts.add("." + e.replace(/^\./, "").toLowerCase());
  return [...exts].join(",");
}

function mimeOf(ext: string): string {
  switch (ext) {
    case "md":
    case "markdown":
    case "mdx":
      return "text/markdown";
    case "html":
    case "htm":
      return "text/html";
    case "json":
    case "jsonc":
      return "application/json";
    default:
      return "text/plain";
  }
}

/** showOpenFilePicker/showSaveFilePicker 의 `types` — 필터마다 MIME 별로 확장자를 묶는다. */
export function pickerTypesOf(filters: FileFilter[]): PickerType[] {
  return filters
    .filter((f) => f.extensions.length)
    .map((f) => {
      const accept: Record<string, string[]> = {};
      for (const raw of f.extensions) {
        const e = raw.replace(/^\./, "").toLowerCase();
        (accept[mimeOf(e)] ??= []).push("." + e);
      }
      return { description: f.name, accept };
    });
}

/** 데스크톱 저장 대화상자에 넘기던 기본 경로(`C:/docs/새 문서.md` 또는 이름만) → 제안 파일 이름. */
export function suggestedNameOf(defaultPath: string): string {
  const parts = defaultPath.split(/[\\/]/);
  return parts[parts.length - 1] || "untitled.md";
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** 열기 — 핸들 또는 (폴백) 이름+내용. 취소면 null. */
export async function pickOpen(filters: FileFilter[]): Promise<{ name: string; handle?: FileHandleLike; text?: string } | null> {
  const w = globalThis as unknown as FsAccessWindow;
  if (hasFsAccess(w)) {
    try {
      const [h] = await w.showOpenFilePicker!({ multiple: false, types: pickerTypesOf(filters) });
      return h ? { name: h.name, handle: h } : null;
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  const file = await pickWithInput(acceptOf(filters));
  return file ? { name: file.name, text: await file.text() } : null;
}

/** `<input type=file>` 폴백. 취소 이벤트가 없는 옛 브라우저에서는 약속이 안 풀린 채 남는다(다음 열기에는 지장 없다). */
function pickWithInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    const done = (f: File | null) => {
      input.remove();
      resolve(f);
    };
    input.addEventListener("change", () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => done(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** 저장 위치 고르기(핸들). 지원 안 하면 undefined 를 돌려줄 함수가 없다 — hasFsAccess 로 먼저 가른다. 취소면 null. */
export async function pickSave(suggestedName: string, filters: FileFilter[] = []): Promise<FileHandleLike | null> {
  const w = globalThis as unknown as FsAccessWindow;
  try {
    return await w.showSaveFilePicker!({ suggestedName, types: filters.length ? pickerTypesOf(filters) : undefined });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/** 다운로드로 저장(폴백). */
export function downloadText(name: string, text: string): void {
  const type = /\.html?$/i.test(name) ? "text/html" : /\.jsonc?$/i.test(name) ? "application/json" : "text/markdown";
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
