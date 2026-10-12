/**
 * file 노드 카드 정보(Rust `canvas_cards`) — Tauri 밖(프로브)에서는 **열린 탭의 내용**으로 같은 모양을 만든다.
 */
import { invoke } from "@tauri-apps/api/core";
import { loadMarkdown } from "../markdownLazy";

export interface CardOutline {
  level: number;
  text: string;
  line: number;
}

export interface CardInfo {
  file: string;
  path: string | null;
  title: string;
  outline: CardOutline[];
  excerpt: string;
}

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** 프로브용 — 경로 → 내용(열린 탭). */
let fallbackSource: ((path: string) => string | undefined) | null = null;
export function setCardSource(fn: (path: string) => string | undefined): void {
  fallbackSource = fn;
}

export async function loadCards(items: { file: string; candidates: string[] }[]): Promise<CardInfo[]> {
  if (!items.length) return [];
  if (inTauri()) return invoke<CardInfo[]>("canvas_cards", { items });
  const { createMarkdown, extractToc } = await loadMarkdown();
  const md = createMarkdown();
  return items.map(({ file, candidates }) => {
    for (const c of candidates) {
      const text = fallbackSource?.(c);
      if (text == null) continue;
      const toc = extractToc(md, text);
      const lines = text.split("\n");
      const excerpt = lines.find((l) => l.trim() && !/^(#|```|\||---)/.test(l.trim()))?.trim() ?? "";
      return {
        file,
        path: c,
        title: toc.find((h) => h.level === 1)?.text ?? c.split(/[\/]/).pop()!.replace(/\.[^.]+$/, ""),
        outline: toc.filter((h) => h.level <= 3).slice(0, 12).map((h) => ({ level: h.level, text: h.text, line: 1 + lines.findIndex((l) => l.replace(/^#+\s*/, "").trim() === h.text) })),
        excerpt,
      };
    }
    return { file, path: null, title: file.split(/[\/]/).pop()!.replace(/\.[^.]+$/, ""), outline: [], excerpt: "" };
  });
}

export async function vaultRoot(canvasPath: string): Promise<string | null> {
  if (!inTauri()) return null;
  try {
    return await invoke<string | null>("canvas_vault_root", { path: canvasPath });
  } catch {
    return null;
  }
}
