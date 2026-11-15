// 웹 플랫폼(platform/web/index.ts)과 웹 전용 화면 훅(shell/WebEdition.tsx) 사이의 다리.
// 훅은 데스크톱 번들에서 import 째 빠져야 하므로 부작용 있는 index.ts 를 직접 import 할 수 없다(데스크톱 tsc 는
// `@platform` 을 tauri.ts 로 본다). 그래서 부작용 없는 이 모듈에 자리를 두고 index.ts 가 구현을 꽂는다.
// **모듈 최상위 부작용 금지**(상태 선언·객체 리터럴만).

export interface WebImpl {
  /** 텍스트 문서를 정한 경로에 올린다(URL·공유·견본). 같은 경로면 내용을 바꾼다. */
  put(path: string, name: string, text: string): void;
  /** 파일 핸들(launchQueue)을 올리고 가상 경로를 돌려준다. */
  registerHandle(handle: unknown): Promise<string>;
  /** 탭의 파일 핸들(언어 전환 보관용). */
  handleOf(path: string): unknown;
}

export const impl: Partial<WebImpl> = {};

/** 언어 전환으로 떠나는 중 — 탭 닫기 경고(beforeunload)를 띄우지 않는다(내용은 보관했다). */
export const leave = { now: false };

/** 언어 전환으로 옮겨 온 탭 목록(보관 순서)과 활성 탭 — 세션 복원(openPaths)은 같은 브라우저의 다른 탭이 덮어썼을 수 있어
 *  훅이 이 목록으로 빠진 탭을 마저 열고 활성 탭을 되돌린다. */
export const restored: { paths: string[]; active: string | null; ready: Promise<void> | null } = { paths: [], active: null, ready: null };

/** 되살린 문서 중 미저장이던 것 — 훅이 탭이 생기면 미저장 표시를 다시 단다. */
let dirty: Map<string, string> | null = null;
export const restoredDirty = (): Map<string, string> => (dirty ??= new Map());

let gate: Promise<void> | null = null;
let openGate: (() => void) | null = null;

/** 부팅(세션 복원)이 끝났다 — 앱이 takePendingOpen 을 부르는 순간. URL·공유·견본은 그 뒤에 연다(복원이 활성 탭을 덮지 않게). */
export function bootDone(): Promise<void> {
  return (gate ??= new Promise<void>((r) => (openGate = r)));
}

export function markBootDone(): void {
  void bootDone();
  openGate?.();
}
