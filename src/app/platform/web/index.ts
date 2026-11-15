// 플랫폼 구현 ② 웹 에디션(W1) — 파일 하나를 브라우저에서 열고·읽고·고친다. **업로드 없음**(서버로 보내는 것이 없다).
// `vite --mode web` 일 때 `@platform` 이 여기로 이어진다. 데스크톱 구현(platform/tauri.ts)과 **같은 이름·같은 모양**의
// 함수를 내놓아야 한다 — platform/conformance.ts 가 컴파일 시간에 잰다.
//
// 매핑(설계 승인 2026-11-15):
//   read/write/create_file·path_exists → File System Access API(Chromium) / <input> 열기 + 다운로드 저장 · 드롭 공통
//   settings → localStorage · 최근 파일 → IndexedDB(파일 핸들) · 테마 → 번들 내장(사용자 테마 파일 없음)
//   ws_*·history_*·inbox_*·watch·agent·search·annot·canvas → 없음(UI 가 features 를 보고 숨기거나 "데스크톱 앱에서" 안내)
import type { ThemeBundle } from "../../themes/custom";
import { seedEntries } from "../../themes/seeds";
import type {
  AgentInfo,
  DirEntryNode,
  DragDropPhase,
  FileFilter,
  HistoryEntry,
  IndexDone,
  InboxSnapshot,
  PendingFile,
  PlatformFeatures,
  SearchHit,
  UnlistenFn,
  WorkspaceNode,
  WorkspaceSnapshot,
} from "../types";
import { WebFiles, WEB_READABLE_RE, type FileHandleLike, type WebEntry } from "./files";
import { downloadText, hasFsAccess, pickOpen, pickSave, suggestedNameOf } from "./pick";
import { idbRecentStore, sanitizeEntry, touchRecent, type RecentEntry } from "./recent";
import { browserStorage, createSettings } from "./settings";
// 웹 전용 문구(`web.*`)·스타일 — 이 모듈이 실리는 빌드(웹)에서만 등록된다.
import "./ui";
import { createDropHub } from "./drop";
import { applyPageToStorage, readPage } from "./page";
import { STASH_FLAG, takeStash } from "./stash";
import { impl, leave, markBootDone, restored, restoredDirty } from "./bridge";
import { fetchBytes, fetchText, isUrlWebPath, nameOfWebPath, webPathToUrl } from "./remote";
import { bytesToB64 } from "./bytes";

export * from "../types";

export const features: PlatformFeatures = {
  edition: "web",
  workspace: false,
  search: false,
  history: false,
  inbox: false,
  agentBridge: false,
  annotations: false,
  canvas: false,
  userThemes: false,
  windowControls: false,
  revealInExplorer: false,
};

/** 데스크톱 전용 기능을 부르면 — UI 가 이미 숨겼으므로 여기까지 오면 코드 경로가 샌 것이다. 조용히 삼키지 않게 던진다. */
const desktopOnly = (what: string) => Promise.reject(new Error(`EWEB: ${what} is desktop-only`));
const noop: UnlistenFn = () => {};
const quiet = () => Promise.resolve(noop);

export const isNative = (): boolean => false;

// ── 페이지(언어·랜딩) — 스토어가 만들어지기 전에 영속 상태를 이 페이지 것으로(platform/web/page.ts). ──
// 이 모듈은 store 보다 먼저 평가된다(store 가 `@platform` 을 import 하므로).
const hasDom = typeof document !== "undefined" && typeof window !== "undefined";
function safeStorage(kind: "localStorage" | "sessionStorage"): Storage | undefined {
  try {
    return hasDom ? window[kind] : undefined;
  } catch {
    return undefined;
  }
}
const page = readPage(hasDom ? document.documentElement : null, import.meta.env.BASE_URL || "/");
applyPageToStorage(safeStorage("localStorage"), page);

// ── 최근 파일(IndexedDB) + 파일 등록부 ──
const recentStore = idbRecentStore();
let recentList: RecentEntry[] = [];
let recentLoaded: Promise<void> | null = null;

function loadRecent(): Promise<void> {
  return (recentLoaded ??= recentStore
    .load()
    .then((list) => {
      recentList = list;
      for (const e of list) files.restore(e);
    })
    .catch(() => {}));
}

function persistEntry(e: WebEntry): void {
  // 이미 최근 목록에 있는 것만 사본을 고친다 — 순서는 열 때(wsTouchRecent)만 바뀐다.
  const i = recentList.findIndex((r) => r.path === e.path);
  if (i < 0) return;
  const cur = recentList[i];
  const upd = sanitizeEntry({ ...cur, handle: e.handle, text: e.handle ? undefined : e.text });
  recentList = upd ? recentList.map((r, j) => (j === i ? upd : r)) : recentList.filter((_, j) => j !== i);
  void recentStore.save(recentList);
}

const newId = (): string => {
  const c = globalThis.crypto;
  return (c?.randomUUID ? c.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 8);
};

const files = new WebFiles({
  newId,
  download: downloadText,
  pickSaveHandle: hasFsAccess() ? (name) => pickSave(name) : undefined,
  persist: persistEntry,
});

// ── 언어 전환으로 옮겨 온 탭 되살리기(platform/web/stash.ts) ──
// 세션 복원(hydrate)이 읽는 내용을 보관본으로 돌려준다 — 미저장 편집이 살아나고, 핸들 문서도 권한을 묻지 않는다.
const overrides = new Map<string, string>();
let stashApplied: Promise<void> | null = null;
{
  const ss = safeStorage("sessionStorage");
  let flagged = false;
  try {
    flagged = ss?.getItem(STASH_FLAG) === "1";
    ss?.removeItem(STASH_FLAG);
  } catch {
    /* 없음 */
  }
  if (flagged) {
    stashApplied = takeStash(Date.now()).then((s) => {
      if (!s) return;
      restored.paths = s.tabs.map((t) => t.path);
      restored.active = s.active;
      for (const t of s.tabs) {
        const handle = t.handle as FileHandleLike | undefined;
        files.restore({ path: t.path, name: t.name, handle, text: handle ? undefined : t.content });
        overrides.set(t.path, t.content);
        if (t.dirty) restoredDirty().set(t.path, t.content);
      }
    });
    restored.ready = stashApplied;
  }
}

impl.put = (path, name, text) => files.put(path, name, text);
impl.registerHandle = (h) => files.register((h as FileHandleLike).name, { handle: h as FileHandleLike });
impl.handleOf = (path) => files.get(path)?.handle;

// ── 서비스 워커(오프라인 · 빌드가 sw.js 를 만든다) — 개발 서버에는 없다 ──
if (hasDom && !import.meta.env.DEV && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${page.base}sw.js`, { scope: page.base }).catch(() => {});
  });
}

const MD_FILTER: FileFilter[] = [{ name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] }];

// ── 파일 I/O ──
export async function readFile(path: string): Promise<string> {
  // 방금 연 파일은 이미 등록돼 있다 — 최근 목록(IndexedDB)을 기다리지 않는다. 기다리면 부팅 스냅샷(wsLoad)이
  // 같은 약속 뒤에서 먼저 풀려, 그 사이 연 문서가 늦게 도착한 옛 최근 목록에 덮인다(프로브가 잡았다).
  if (stashApplied) await stashApplied;
  const kept = overrides.get(path);
  if (kept !== undefined) {
    overrides.delete(path); // 한 번만 — 그 뒤 다시 읽기는 실물에서
    return kept.replace(/\r\n?/g, "\n");
  }
  if (!files.has(path)) await loadRecent();
  // 원격 문서 옆의 문서(상대 링크) — 경로가 곧 URL 이라 처음 보는 것도 받아 올 수 있다(remote.ts).
  const url = !files.has(path) && isUrlWebPath(path) ? webPathToUrl(path) : null;
  if (url) files.put(path, nameOfWebPath(path), await fetchText(url));
  return (await files.read(path)).replace(/\r\n?/g, "\n");
}
export const writeFile = (path: string, contents: string): Promise<void> => files.write(path, contents);
/** 상대경로 이미지 — 원격(URL 로 연) 문서면 같은 출처에서 받는다. 로컬 파일 문서는 옆 폴더에 닿을 수 없다
 *  (폴더 핸들은 TASKS 남은 일). 실패하면 미리보기가 원본 src 를 둔다. */
export async function readFileBase64(path: string): Promise<string> {
  const url = webPathToUrl(path);
  if (!url) throw new Error("ENOENT");
  return bytesToB64(await fetchBytes(url, { maxBytes: 10 * 1024 * 1024 }));
}
export const writeFileBase64 = (_path: string, _b64: string): Promise<void> => desktopOnly("image paste");
export const createFile = (path: string, contents = ""): Promise<void> => files.create(path, contents);
export const pathExists = async (path: string): Promise<boolean> => {
  if (!files.has(path)) await loadRecent();
  return files.has(path);
};
export const readDirTree = (_path: string): Promise<DirEntryNode> => desktopOnly("folders");
export const pathIsDir = (_path: string): Promise<boolean> => Promise.resolve(false);

// ── 테마 — 기본 테마 팩(한지·전자잉크…)은 번들 원문을 "사용자 테마 파일"처럼 내준다. 사용자 파일은 없다. ──
export const themeFilePath = (): Promise<string> => desktopOnly("theme file");
export const themeDirPath = (): Promise<string> => desktopOnly("theme folder");
export const readThemeBundle = (): Promise<ThemeBundle> =>
  Promise.resolve({ file: "", dir: "", main: null, packs: seedEntries(".jsonc"), styles: seedEntries(".css") });

// ── 드롭·고르기 ──
const drops = createDropHub(async (dropped) => {
  const paths: string[] = [];
  for (const d of dropped) {
    if (!WEB_READABLE_RE.test(d.name)) continue; // 폴더·캔버스·이미지는 웹에서 안 연다
    paths.push(await files.register(d.name, d));
  }
  return paths;
});
export const onFileDrop = (cb: (state: { phase: DragDropPhase; paths: string[] }) => void): Promise<UnlistenFn> =>
  Promise.resolve(drops.subscribe(cb));
/** 미리보기 안의 scrollIntoView(목차·앵커 이동)가 **iframe 안에서만** 스크롤하게. 브라우저의 scrollIntoView 는 조상 문서까지
 *  굴린다 — 웹 페이지는 앱 아래로 설명이 이어져 스크롤되므로, 목차를 누르면 페이지가 700px 내려가 앱이 밀려났다(프로브가 잡았다).
 *  데스크톱에는 바깥 스크롤이 없어 이 차이가 안 생긴다 — 그래서 공용 Preview 는 그대로 두고 웹 쪽에서만 막는다. */
export function frameScrollTop(cur: number, rect: { top: number; height: number }, viewH: number, block: ScrollLogicalPosition): number | null {
  if (block === "center") return cur + rect.top - (viewH - rect.height) / 2;
  if (block === "end") return cur + rect.top - (viewH - rect.height);
  if (block === "nearest") {
    if (rect.top >= 0 && rect.top + rect.height <= viewH) return null;
    return rect.top < 0 || rect.height > viewH ? cur + rect.top : cur + rect.top - (viewH - rect.height);
  }
  return cur + rect.top;
}

function confineScrollIntoView(win: Window): void {
  const proto = (win as unknown as { Element: typeof Element }).Element?.prototype;
  if (!proto || (proto as unknown as { __confined?: boolean }).__confined) return;
  (proto as unknown as { __confined?: boolean }).__confined = true;
  proto.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
    const se = this.ownerDocument.scrollingElement ?? this.ownerDocument.documentElement;
    const o: ScrollIntoViewOptions = typeof arg === "object" && arg ? arg : { block: arg === false ? "end" : "start" };
    const top = frameScrollTop(se.scrollTop, this.getBoundingClientRect(), win.innerHeight, o.block ?? "start");
    if (top !== null) se.scrollTo({ top: Math.max(0, top), behavior: o.behavior });
  };
}

/** 미리보기 iframe 이 새 문서를 실을 때마다 — 드롭 받기 + 스크롤 사슬 끊기. 웹 페이지는 앱 아래로 설명이 이어져
 *  스크롤되는데, 미리보기 끝에 닿은 휠이 페이지로 넘어가면 읽던 자리에서 앱이 화면 밖으로 밀려난다. */
export const attachFrameDrop = (win: Window): UnlistenFn => {
  try {
    const d = win.document;
    if (d?.documentElement && !d.getElementById("wsb-overscroll")) {
      const st = d.createElement("style");
      st.id = "wsb-overscroll";
      st.textContent = "html,body{overscroll-behavior:contain}";
      (d.head ?? d.documentElement).appendChild(st);
    }
    confineScrollIntoView(win);
  } catch {
    /* 다른 출처 — 없다 */
  }
  return drops.attach(win);
};

export async function pickFile(filters: FileFilter[] = MD_FILTER): Promise<string | null> {
  const r = await pickOpen(filters);
  return r ? files.register(r.name, r) : null;
}
export const pickFolder = (): Promise<string | null> => desktopOnly("folders");

/** 저장 위치 — 지원하면 지금 고르고(핸들), 아니면 이름만 정한 가상 문서(쓰면 다운로드). 취소면 null. */
export async function saveFile(defaultPath: string, filters: FileFilter[]): Promise<string | null> {
  const name = suggestedNameOf(defaultPath);
  if (hasFsAccess()) {
    const h = await pickSave(name, filters);
    return h ? files.register(h.name, { handle: h }) : null;
  }
  return files.register(name, { text: "" });
}

export const canAutosave = (path: string): boolean => files.canAutosave(path);

// ── 감시 — 웹에는 디스크 감시가 없다 ──
export const watchFiles = (_openPaths: string[], _importedRoots: string[]): Promise<void> => Promise.resolve();
export const onFileChanged = (_cb: (paths: string[]) => void): Promise<UnlistenFn> => quiet();
export const onFsStructural = (_cb: (paths: string[]) => void): Promise<UnlistenFn> => quiet();

// ── 워크스페이스 — 최근 목록만 산다(트리·즐겨찾기는 데스크톱) ──
/** 진행 중인 최근 목록 갱신의 꼬리. wsLoad 가 이걸 기다린다 — 부팅 하이드레이트(wsLoad)가 IndexedDB 를 여는 사이에
 *  문서를 열면(드롭), 늦게 도착한 옛 스냅샷이 방금 연 문서를 최근 목록에서 지운다(프로브가 잡았다). */
let touching: Promise<void> = Promise.resolve();

export async function wsLoad(): Promise<WorkspaceSnapshot> {
  await loadRecent();
  await touching;
  return { nodes: [], favorites: [], recent: recentList.map((e) => e.path) };
}
export const wsCreateFolder = (_id: string, _parentId: string | null, _name: string): Promise<WorkspaceNode> => desktopOnly("workspace");
export const wsRename = (_id: string, _name: string): Promise<void> => desktopOnly("workspace");
export const wsDelete = (_id: string): Promise<void> => desktopOnly("workspace");
export const wsAddFileRef = (_id: string, _parentId: string | null, _realPath: string): Promise<WorkspaceNode> => desktopOnly("workspace");
export const wsImportFolder = (_id: string, _parentId: string | null, _realPath: string): Promise<WorkspaceNode> => desktopOnly("workspace");
export const wsMove = (_id: string, _p: string | null, _o: number): Promise<void> => desktopOnly("workspace");
export const wsReorder = (_orderedIds: string[]): Promise<void> => desktopOnly("workspace");
export const wsToggleFavorite = (_realPath: string): Promise<boolean> => desktopOnly("favorites");
export function wsTouchRecent(realPath: string): Promise<void> {
  // 동기로 꼬리에 잇는다 — 호출 순간 이후의 wsLoad 는 이 갱신을 본다.
  touching = touching.then(async () => {
    await loadRecent();
    const e = files.get(realPath);
    if (!e) return;
    recentList = touchRecent(recentList, { path: e.path, name: e.name, handle: e.handle, text: e.text, at: Date.now() });
    await recentStore.save(recentList);
  }).catch(() => {}); // 한 번 실패가 꼬리를 영영 끊으면 최근 목록이 다시는 안 뜬다
  return touching;
}
export const wsExport = (): Promise<string> => desktopOnly("workspace");
export const wsImport = (_json: string): Promise<void> => desktopOnly("workspace");

const settings = createSettings(browserStorage());
export const settingsGetAll = (): Promise<[string, string][]> => Promise.resolve(settings.getAll());
export const settingsSet = (key: string, value: string): Promise<void> => {
  settings.set(key, value);
  return Promise.resolve();
};

// ── 검색 — 없음(검색창은 숨는다) ──
export const searchQuery = (_q: string, _limit?: number, _prefix?: string): Promise<SearchHit[]> => Promise.resolve([]);
export const searchIndexFolder = (_path: string): Promise<void> => Promise.resolve();
export const searchReindexPath = (_path: string): Promise<void> => Promise.resolve();
export const searchRemovePath = (_path: string): Promise<void> => Promise.resolve();
export const onIndexDone = (_cb: (p: IndexDone) => void): Promise<UnlistenFn> => quiet();
export const onIndexUpdated = (_cb: () => void): Promise<UnlistenFn> => quiet();

// ── 창 — 브라우저 탭이 창이다 ──
export const winMinimize = (): Promise<void> => Promise.resolve();
export const winToggleMaximize = (): Promise<void> => Promise.resolve();
export const winClose = (): Promise<void> => Promise.resolve();
/** 탭 닫기·새로고침 가드 — 미저장이 있으면 브라우저의 "나가시겠습니까?"를 띄운다(문구는 브라우저가 정한다). */
export const onWindowCloseRequested = (handler: (event: { preventDefault: () => void }) => void): Promise<UnlistenFn> => {
  const on = (e: BeforeUnloadEvent) => {
    if (leave.now) return; // 언어 전환 이동 — 열린 탭은 보관했다(stash.ts)
    let stop = false;
    handler({ preventDefault: () => (stop = true) });
    if (stop) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", on);
  return Promise.resolve(() => window.removeEventListener("beforeunload", on));
};
export const winDestroy = (): Promise<void> => Promise.resolve();

// ── 파일 연결·브리지 이벤트 — 없음(W2: URL 로 열기) ──
/** 앱이 세션 복원을 끝내고 부른다 — 웹은 여기서 "부팅 끝"만 알린다. URL·공유 링크·launchQueue·견본은
 *  shell/WebEdition.tsx 가 그 뒤에 연다(스토어·알림이 필요해서). */
export const takePendingOpen = (): Promise<PendingFile | null> => {
  markBootDone();
  return Promise.resolve(null);
};
export const onRevealLine = (_cb: (f: { path: string; line: number }) => void): Promise<UnlistenFn> => quiet();
export const onOpenFile = (_cb: (path: string) => void): Promise<UnlistenFn> => quiet();
export const onOpenFileBeside = (_cb: (path: string) => void): Promise<UnlistenFn> => quiet();

// ── 문서 기록·받은 문서함·브리지 — 데스크톱 ──
export const historyList = (_path: string): Promise<HistoryEntry[]> => desktopOnly("history");
export const historyGet = (_id: number): Promise<string> => desktopOnly("history");
export const historyRestore = (_id: number): Promise<string> => desktopOnly("history");
export const inboxList = (): Promise<InboxSnapshot> => Promise.resolve({ items: [], total: 0 });
export const inboxMarkSeen = (_path: string): Promise<void> => Promise.resolve();
export const inboxMarkAllSeen = (): Promise<void> => Promise.resolve();
export const agentInfo = (): Promise<AgentInfo> => desktopOnly("agent bridge");

export const revealInExplorer = (_path: string): Promise<void> => desktopOnly("reveal in explorer");
/** 외부 링크 — 새 탭. opener 를 끊는다(열린 페이지가 이 탭을 조작하지 못하게). */
export const openExternalUrl = (url: string): Promise<void> => {
  window.open(url, "_blank", "noopener,noreferrer");
  return Promise.resolve();
};
export const openWithDefault = (_path: string): Promise<void> => desktopOnly("open with default app");

// ── 표시 펜·캔버스 저장소의 Tauri 호출(lib/annot/api.ts·lib/canvas/cards.ts 는 `@platform` 의 invoke 를 쓴다) ──
// 웹에는 백엔드가 없다. 그 두 모듈은 Tauri 밖이면 invoke 를 부르지 않고 메모리 대역을 쓰므로, 여기까지 오면 경로가 샌 것이다.
export function invoke<T>(cmd: string, _args?: unknown): Promise<T> {
  return desktopOnly(`command ${cmd}`);
}
