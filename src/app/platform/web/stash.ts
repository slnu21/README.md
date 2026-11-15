// 언어 전환 임시 보관 — ko/en 은 서로 다른 정적 URL(검색엔진이 각각 색인)이라 언어를 바꾸면 **페이지를 옮긴다**.
// 편집 중이면 미저장 내용이 사라지므로, 옮기기 직전 열린 탭 전부(내용·미저장 여부·파일 핸들)를 IndexedDB 에 두고
// 새 페이지가 부팅하며 꺼내 그대로 되살린다(한 번 쓰면 지운다 · 5분 지나면 버린다).
// 왜 앱 안 전환이 아닌가: 언어별 URL·문구(정적 DOM)·hreflang 이 실제 페이지와 맞아야 하고, 앱 안에서만 바꾸면 주소창의
// 언어와 화면 언어가 어긋난다. 이동 1회 + 복원이 편집 손실 없이 둘을 맞춘다.
// 모듈 최상위 부작용 없음.

export interface StashTab {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  /** 파일 핸들(구조화 복제로 IndexedDB 에 그대로 들어간다) — 되살린 뒤 Ctrl+S 가 같은 파일에 쓰도록. */
  handle?: unknown;
}

export interface Stash {
  at: number;
  active: string | null;
  tabs: StashTab[];
}

export const STASH_TTL_MS = 5 * 60_000;
/** 이 탭이 방금 언어를 바꿔 이동했다는 표시(sessionStorage) — 없으면 부팅 때 IndexedDB 를 열지도 않는다. */
export const STASH_FLAG = "readme-md.web.langSwitch";

export function buildStash(
  tabs: { path: string; title: string; content: string; dirty: boolean }[],
  active: string | null,
  handleOf: (path: string) => unknown,
  now: number,
): Stash {
  return {
    at: now,
    active,
    tabs: tabs.map((t) => {
      const h = handleOf(t.path);
      return { path: t.path, name: t.title, content: t.content, dirty: t.dirty, ...(h ? { handle: h } : {}) };
    }),
  };
}

/** 꺼낸 값 검증 — 모양이 틀리거나 오래됐으면 null. */
export function validStash(raw: unknown, now: number, ttl = STASH_TTL_MS): Stash | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<Stash>;
  if (typeof s.at !== "number" || now - s.at > ttl || now < s.at - 60_000 || !Array.isArray(s.tabs)) return null;
  const tabs = s.tabs.filter(
    (t): t is StashTab => !!t && typeof t.path === "string" && typeof t.name === "string" && typeof t.content === "string" && typeof t.dirty === "boolean",
  );
  return { at: s.at, active: typeof s.active === "string" ? s.active : null, tabs };
}

const DB = "readme-md-stash";
const STORE = "kv";
const KEY = "lang-switch";

function open(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveStash(stash: Stash, idb: IDBFactory | undefined = globalThis.indexedDB): Promise<void> {
  if (!idb) throw new Error("EWEBSTASH: no IndexedDB");
  const d = await open(idb);
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(stash, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  d.close();
}

/** 꺼내고 지운다(한 번만 되살린다). 없거나 실패하면 null. */
export async function takeStash(now: number, idb: IDBFactory | undefined = globalThis.indexedDB): Promise<Stash | null> {
  if (!idb) return null;
  try {
    const d = await open(idb);
    const raw = await new Promise<unknown>((resolve) => {
      const tx = d.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      const req = st.get(KEY);
      req.onsuccess = () => {
        st.delete(KEY);
        resolve(req.result);
      };
      req.onerror = () => resolve(null);
    });
    d.close();
    return validStash(raw, now);
  } catch {
    return null;
  }
}
