// 웹 파일 드롭 — 데스크톱은 Tauri 가 OS 드롭을 창 단위로 받지만, 브라우저에서는 문서마다 이벤트가 따로 온다.
// 그래서 앱 문서(window)와 미리보기 iframe 문서 양쪽에 같은 리스너를 단다(attachFrameDrop).
// iframe 쪽을 안 받으면 미리보기 위에 떨어뜨린 파일을 **브라우저가 열어 버려** 편집 중인 글이 날아간다.
//
// capture 단계에서 받고 파일 드래그면 전파를 끊는다 — CodeMirror 가 떨어진 파일을 글로 끼워 넣지 않게.
// DataTransfer 는 이벤트가 끝나면 비므로 항목은 **동기로** 다 꺼내 둔 뒤 기다린다.
import type { DragDropPhase, UnlistenFn } from "../types";
import type { FileHandleLike } from "./files";

/** 드래그가 파일을 나르는가(글자·링크 드래그는 앱의 다른 동작에 맡긴다). */
export function isFileDrag(types: readonly string[] | DOMStringList | undefined | null): boolean {
  if (!types) return false;
  return Array.from(types as ArrayLike<string>).includes("Files");
}

interface ItemLike {
  kind: string;
  getAsFile(): { name: string; text(): Promise<string> } | null;
  getAsFileSystemHandle?: () => Promise<FileHandleLike | null>;
}

export type Dropped = { name: string; handle?: FileHandleLike; text?: string };

/** 드롭 항목 → 이름 + (핸들 | 내용). 폴더 핸들은 건너뛴다(폴더는 데스크톱 기능). **동기로 꺼낸 뒤** 기다린다. */
export async function collectDropped(items: ArrayLike<ItemLike>): Promise<Dropped[]> {
  const grabbed = Array.from(items)
    .filter((i) => i.kind === "file")
    .map((i) => {
      let handle: Promise<FileHandleLike | null> | null = null;
      try {
        handle = i.getAsFileSystemHandle ? i.getAsFileSystemHandle() : null;
      } catch {
        handle = null;
      }
      return { handle, file: i.getAsFile() };
    });
  const out: Dropped[] = [];
  for (const g of grabbed) {
    const h = g.handle ? await g.handle.catch(() => null) : null;
    if (h && h.kind === "directory") continue;
    if (h && (h.kind === undefined || h.kind === "file")) {
      out.push({ name: h.name, handle: h });
    } else if (g.file) {
      out.push({ name: g.file.name, text: await g.file.text() });
    }
  }
  return out;
}

type Sink = (state: { phase: DragDropPhase; paths: string[] }) => void;

/** 드롭 받기 — register 가 항목을 등록하고 가상 경로를 돌려준다. */
export function createDropHub(register: (d: Dropped[]) => Promise<string[]>) {
  const sinks = new Set<Sink>();
  let depth = 0;
  const emit = (phase: DragDropPhase, paths: string[] = []) => sinks.forEach((s) => s({ phase, paths }));

  function attach(win: Window): UnlistenFn {
    const enter = (e: DragEvent) => {
      if (!isFileDrag(e.dataTransfer?.types)) return;
      depth++;
      emit("enter");
    };
    const over = (e: DragEvent) => {
      if (!isFileDrag(e.dataTransfer?.types)) return;
      e.preventDefault(); // 이게 없으면 drop 이 안 온다(브라우저 기본 = 파일 열기)
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      emit("over");
    };
    const leave = (e: DragEvent) => {
      if (!isFileDrag(e.dataTransfer?.types)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) emit("leave");
    };
    const drop = (e: DragEvent) => {
      if (!isFileDrag(e.dataTransfer?.types)) return;
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      const items = e.dataTransfer?.items;
      const pending = items ? collectDropped(items as unknown as ArrayLike<ItemLike>) : Promise.resolve([]);
      void pending
        .then(register)
        .then((paths) => emit("drop", paths))
        .catch(() => emit("leave"));
    };
    const opts = { capture: true } as const;
    win.addEventListener("dragenter", enter, opts);
    win.addEventListener("dragover", over, opts);
    win.addEventListener("dragleave", leave, opts);
    win.addEventListener("drop", drop, opts);
    return () => {
      win.removeEventListener("dragenter", enter, opts);
      win.removeEventListener("dragover", over, opts);
      win.removeEventListener("dragleave", leave, opts);
      win.removeEventListener("drop", drop, opts);
    };
  }

  let detachTop: UnlistenFn | null = null;
  return {
    /** 앱 문서 구독(onFileDrop). 첫 구독자가 생길 때 window 에 단다. */
    subscribe(sink: Sink): UnlistenFn {
      sinks.add(sink);
      if (!detachTop && typeof window !== "undefined") detachTop = attach(window);
      return () => {
        sinks.delete(sink);
        if (!sinks.size && detachTop) {
          detachTop();
          detachTop = null;
        }
      };
    },
    attach,
  };
}
