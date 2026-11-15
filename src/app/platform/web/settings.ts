// 웹 설정 저장소 — 데스크톱의 SQLite `settings` 표(settings_get_all/settings_set) 자리를 localStorage 가 맡는다.
// 앱의 뷰 설정 대부분은 이미 zustand persist(localStorage)라 여기 오는 것은 펜 뜻처럼 Rust 쪽에 두던 키뿐이다.
//
// localStorage 는 사생활 모드·저장소 차단에서 **던진다**. 그때는 메모리로 떨어진다(세션 동안만 기억) —
// 설정 하나 못 쓴다고 앱이 서면 안 된다(fail-soft).

/** localStorage 에서 쓰는 만큼만. 테스트는 Map 으로 흉내 낸다. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SETTINGS_PREFIX = "readme-md.settings.";

export interface WebSettings {
  getAll(): [string, string][];
  set(key: string, value: string): void;
}

export function createSettings(storage: StorageLike | null, prefix = SETTINGS_PREFIX): WebSettings {
  const memory = new Map<string, string>();
  let broken = storage == null;

  // memory 는 이번 세션에 쓴 값의 거울이다 — 쓰기는 됐는데 읽기가 막히는 환경에서도 방금 쓴 값이 보이게.
  return {
    getAll() {
      const out = new Map(memory);
      if (!broken && storage) {
        try {
          for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (k == null || !k.startsWith(prefix)) continue;
            const v = storage.getItem(k);
            if (v != null) out.set(k.slice(prefix.length), v);
          }
        } catch {
          broken = true;
        }
      }
      return [...out.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    },
    set(key, value) {
      memory.set(key, value);
      if (broken || !storage) return;
      try {
        storage.setItem(prefix + key, value);
      } catch {
        broken = true; // 용량 초과·차단 — 이번 세션은 메모리로
      }
    },
  };
}

/** 브라우저의 localStorage(접근 자체가 던지는 환경이면 null). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
