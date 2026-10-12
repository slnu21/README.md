/**
 * 표시 저장소 — Rust 커맨드(`commands/annot.rs`) 래퍼. Tauri 밖(헤드리스 프로브·데모)에서는 **메모리
 * 저장소**로 같은 계약을 흉내 낸다 — 프로브가 진짜 앱 셸을 띄우되 IPC 는 없기 때문이다. 메모리 쪽도
 * Rust 와 같은 검사(범위의 글 = quote)를 해서 프런트의 오프셋 계산이 틀리면 프로브에서 드러나게 한다.
 */
import { invoke } from "@tauri-apps/api/core";
import { canonicalText } from "./relocate";
import type { AnnotColor, AnnotKind, AnnotStyle } from "./pens";

export interface Annotation {
  id: string;
  path: string;
  snapshotId: number;
  kind: AnnotKind;
  style: AnnotStyle;
  color: AnnotColor;
  srcStart: number;
  srcEnd: number;
  quote: string;
  prefix: string;
  suffix: string;
  note: string | null;
  resolved: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NewAnnotation {
  id: string;
  path: string;
  kind: AnnotKind;
  style: AnnotStyle;
  color: AnnotColor;
  srcStart: number;
  srcEnd: number;
  quote: string;
  prefix: string;
  suffix: string;
  note: string | null;
}

export interface AnnotationPatch {
  style?: AnnotStyle;
  color?: AnnotColor;
  /** null = 메모 지우기 */
  note?: string | null;
  resolved?: boolean;
}

export interface SnapshotText {
  id: number;
  content: string;
}

export interface AnnotationSet {
  annotations: Annotation[];
  snapshots: SnapshotText[];
}

export interface AnnotBackend {
  add(a: NewAnnotation): Promise<{ annotation: Annotation; snapshot: SnapshotText }>;
  list(path: string): Promise<AnnotationSet>;
  update(id: string, patch: AnnotationPatch): Promise<Annotation>;
  remove(id: string): Promise<void>;
}

const tauriBackend: AnnotBackend = {
  add: (annotation) => invoke("annot_add", { annotation }),
  list: (path) => invoke("annot_list", { path }),
  update: (id, patch) => invoke("annot_update", { id, patch }),
  remove: (id) => invoke("annot_delete", { id }),
};

/** 메모리 저장소. `diskText` 가 "지금 디스크의 글"을 준다(프로브는 열린 탭 내용을 넘긴다). */
export function memoryBackend(diskText: (path: string) => string | undefined): AnnotBackend {
  const anns = new Map<string, Annotation>();
  const snaps: { id: number; path: string; content: string }[] = [];
  return {
    async add(a) {
      const disk = diskText(a.path);
      if (disk == null) throw new Error("ENOENT");
      let snap = snaps.find((s) => s.path === a.path && s.content === disk);
      if (!snap) snaps.push((snap = { id: snaps.length + 1, path: a.path, content: disk }));
      if (canonicalText(disk).slice(a.srcStart, a.srcEnd) !== a.quote) throw new Error("The document just changed");
      const now = Date.now();
      const ann: Annotation = { ...a, snapshotId: snap.id, resolved: false, createdAt: now, updatedAt: now };
      anns.set(a.id, ann);
      return { annotation: ann, snapshot: { id: snap.id, content: snap.content } };
    },
    async list(path) {
      const annotations = [...anns.values()].filter((x) => x.path === path).sort((p, q) => p.srcStart - q.srcStart);
      const ids = new Set(annotations.map((x) => x.snapshotId));
      return { annotations, snapshots: snaps.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, content: s.content })) };
    },
    async update(id, patch) {
      const cur = anns.get(id);
      if (!cur) throw new Error("No such annotation");
      const next: Annotation = {
        ...cur,
        ...(patch.style ? { style: patch.style } : {}),
        ...(patch.color ? { color: patch.color } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.resolved !== undefined ? { resolved: patch.resolved } : {}),
        updatedAt: Date.now(),
      };
      anns.set(id, next);
      return next;
    },
    async remove(id) {
      anns.delete(id);
    },
  };
}

let backend: AnnotBackend | null = null;

/** Tauri 안이면 진짜 저장소, 밖이면 setAnnotBackend 로 꽂은 것(없으면 메모리 — 내용 모름). */
export function annotBackend(): AnnotBackend {
  if (backend) return backend;
  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  backend = inTauri ? tauriBackend : memoryBackend(() => undefined);
  return backend;
}

export function setAnnotBackend(b: AnnotBackend): void {
  backend = b;
}

/** 표시 id — 영숫자·`-`(Rust 가 좁히는 모양). */
export function newAnnotId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
