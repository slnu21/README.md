// 웹 최근 파일 — 데스크톱의 SQLite `recent` 자리. **파일 핸들**(File System Access API)을 IndexedDB 에 둔다.
// 핸들은 구조화 복제가 되므로 그대로 저장되고, 다시 열 때 읽기 권한만 다시 묻는다(경로 문자열은 웹에 없다).
// 핸들이 없는 문서(Firefox·Safari 의 <input> 열기, 아직 저장 안 한 새 문서)는 **내용 사본**을 둔다 —
// 그래야 최근 목록이 그 브라우저에서도 쓸모 있다. 너무 크면 사본을 안 둔다(다시 못 여니 목록에서도 뺀다).
import type { FileHandleLike } from "./files";

export interface RecentEntry {
  path: string;
  name: string;
  handle?: FileHandleLike;
  text?: string;
  at: number;
}

export const RECENT_MAX = 20;
/** 핸들 없는 문서의 내용 사본 상한(글자). 넘으면 사본을 두지 않는다. */
export const RECENT_TEXT_MAX = 1_000_000;

/** 맨 앞으로(같은 경로는 하나만), 상한까지. 순수 — 저장소는 따로. */
export function touchRecent(list: RecentEntry[], entry: RecentEntry, max = RECENT_MAX): RecentEntry[] {
  const keep = sanitizeEntry(entry);
  const rest = list.filter((e) => e.path !== entry.path);
  return keep ? [keep, ...rest].slice(0, max) : rest.slice(0, max);
}

/** 다시 열 수 없는 항목(핸들도 사본도 없음)은 null — 목록에 남기면 눌러도 안 열린다. */
export function sanitizeEntry(e: RecentEntry): RecentEntry | null {
  if (e.handle) return { path: e.path, name: e.name, handle: e.handle, at: e.at };
  if (typeof e.text === "string" && e.text.length <= RECENT_TEXT_MAX) return { path: e.path, name: e.name, text: e.text, at: e.at };
  return null;
}

/** 불러온 목록 정리 — 모양이 깨진 항목·다시 못 여는 항목을 버리고 최신 순으로. */
export function normalizeRecent(raw: unknown, max = RECENT_MAX): RecentEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RecentEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const e = r as Partial<RecentEntry>;
    if (typeof e.path !== "string" || typeof e.name !== "string" || seen.has(e.path)) continue;
    const ok = sanitizeEntry({ path: e.path, name: e.name, handle: e.handle, text: e.text, at: typeof e.at === "number" ? e.at : 0 });
    if (!ok) continue;
    seen.add(ok.path);
    out.push(ok);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, max);
}

export interface RecentStore {
  load(): Promise<RecentEntry[]>;
  save(list: RecentEntry[]): Promise<void>;
}

export function memoryRecentStore(initial: RecentEntry[] = []): RecentStore {
  let list = initial.slice();
  return {
    load: async () => list.slice(),
    save: async (next) => {
      list = next.slice();
    },
  };
}

const DB_NAME = "readme-md";
const STORE = "kv";
const KEY = "recent";

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB 저장소. 못 열면(사생활 모드 등) 메모리로 떨어진다 — 최근 목록이 세션 동안만 남을 뿐이다. */
export function idbRecentStore(idb: IDBFactory | undefined = globalThis.indexedDB): RecentStore {
  const fallback = memoryRecentStore();
  let dbp: Promise<IDBDatabase | null> | null = null;
  const db = () => (dbp ??= idb ? openDb(idb).catch(() => null) : Promise.resolve(null));
  return {
    async load() {
      const d = await db();
      if (!d) return fallback.load();
      return new Promise<RecentEntry[]>((resolve) => {
        try {
          const req = d.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
          req.onsuccess = () => resolve(normalizeRecent(req.result));
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    },
    async save(list) {
      const d = await db();
      if (!d) return fallback.save(list);
      await new Promise<void>((resolve) => {
        try {
          const tx = d.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(list, KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    },
  };
}
