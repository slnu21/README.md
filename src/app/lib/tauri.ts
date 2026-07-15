// Rust 커맨드 래퍼 + 다이얼로그. 실제 파일 I/O는 풀 접근 권한의 Rust(std::fs)에서 수행한다.
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/** 워크스페이스 트리 노드(Rust `read_dir_tree` 반환, camelCase). */
export interface DirEntryNode {
  name: string;
  path: string;
  isDir: boolean;
  children: DirEntryNode[];
}

/** 파일 내용을 읽어 줄바꿈을 LF로 정규화. CodeMirror 문서 표현(LF)과 일치시켜
 *  열자마자 dirty로 표시되던 CRLF↔LF 불일치를 제거(에디터가 편집 시 이미 LF로 정규화). */
export async function readFile(path: string): Promise<string> {
  const s = await invoke<string>("read_file", { path });
  return s.replace(/\r\n?/g, "\n");
}

export function writeFile(path: string, contents: string): Promise<void> {
  return invoke<void>("write_file", { path, contents });
}

/** 파일 바이트를 base64로 읽기(내보내기 시 로컬 이미지 data URI 내장용). */
export function readFileBase64(path: string): Promise<string> {
  return invoke<string>("read_file_base64", { path });
}

/** 폴더를 재귀 스캔한 트리를 반환. */
export function readDirTree(path: string): Promise<DirEntryNode> {
  return invoke<DirEntryNode>("read_dir_tree", { path });
}

/** 경로가 폴더인지 판별(드롭 분기용). */
export function pathIsDir(path: string): Promise<boolean> {
  return invoke<boolean>("path_is_dir", { path });
}

/** OS 파일 드롭 이벤트 구독(기능 1a). phase: 진입/이동/드롭/이탈. drop 시 실제 경로 제공. */
export type DragDropPhase = "enter" | "over" | "drop" | "leave";
export function onFileDrop(
  cb: (state: { phase: DragDropPhase; paths: string[] }) => void,
): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === "enter") cb({ phase: "enter", paths: p.paths });
    else if (p.type === "over") cb({ phase: "over", paths: [] });
    else if (p.type === "drop") cb({ phase: "drop", paths: p.paths });
    else cb({ phase: "leave", paths: [] });
  });
}

/** 파일 열기 다이얼로그 → 선택 경로(취소 시 null). */
export async function pickFile(
  filters: { name: string; extensions: string[] }[] = [
    { name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] },
  ],
): Promise<string | null> {
  const res = await open({ multiple: false, directory: false, filters });
  return typeof res === "string" ? res : null;
}

/** 폴더 열기 다이얼로그 → 선택 경로(취소 시 null). */
export async function pickFolder(): Promise<string | null> {
  const res = await open({ directory: true, multiple: false });
  return typeof res === "string" ? res : null;
}

/** 저장 다이얼로그(내보내기) → 선택 경로(취소 시 null). filters=[{name, extensions}]. */
export async function saveFile(
  defaultPath: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const res = await save({ defaultPath, filters });
  return typeof res === "string" ? res : null;
}

/** 감시 재등록. openPaths=열린 파일(상위 dir), importedRoots=가져온 폴더(재귀 감시+재인덱싱). */
export function watchFiles(openPaths: string[], importedRoots: string[]): Promise<void> {
  return invoke<void>("watch_files", { openPaths, importedRoots });
}

/** 외부 파일 변경 이벤트 구독. 반환된 함수로 해제. */
export function onFileChanged(cb: (paths: string[]) => void): Promise<UnlistenFn> {
  return listen<string[]>("file-changed", (e) => cb(e.payload));
}

// ── 워크스페이스(SQLite) ──
export interface WorkspaceNode {
  id: string;
  parentId: string | null;
  kind: "virtual_folder" | "file_ref" | "imported_folder";
  name: string;
  realPath: string | null;
  sortOrder: number;
}
export interface WorkspaceSnapshot {
  nodes: WorkspaceNode[];
  favorites: string[];
  recent: string[];
}

export const wsLoad = (): Promise<WorkspaceSnapshot> => invoke("ws_load");
export const wsCreateFolder = (id: string, parentId: string | null, name: string): Promise<WorkspaceNode> =>
  invoke("ws_create_folder", { id, parentId, name });
export const wsRename = (id: string, name: string): Promise<void> => invoke("ws_rename", { id, name });
export const wsDelete = (id: string): Promise<void> => invoke("ws_delete", { id });
export const wsAddFileRef = (id: string, parentId: string | null, realPath: string): Promise<WorkspaceNode> =>
  invoke("ws_add_file_ref", { id, parentId, realPath });
export const wsImportFolder = (id: string, parentId: string | null, realPath: string): Promise<WorkspaceNode> =>
  invoke("ws_import_folder", { id, parentId, realPath });
export const wsMove = (id: string, newParentId: string | null, newSortOrder: number): Promise<void> =>
  invoke("ws_move", { id, newParentId, newSortOrder });
export const wsReorder = (orderedIds: string[]): Promise<void> =>
  invoke("ws_reorder", { orderedIds });
export const wsToggleFavorite = (realPath: string): Promise<boolean> =>
  invoke("ws_toggle_favorite", { realPath });
export const wsTouchRecent = (realPath: string): Promise<void> => invoke("ws_touch_recent", { realPath });
export const wsExport = (): Promise<string> => invoke("ws_export");
export const wsImport = (json: string): Promise<void> => invoke("ws_import", { json });
export const settingsGetAll = (): Promise<[string, string][]> => invoke("settings_get_all");
export const settingsSet = (key: string, value: string): Promise<void> =>
  invoke("settings_set", { key, value });

// ── 전역 검색(FTS5) ──
export interface SearchHit {
  realPath: string;
  name: string;
  snippet: string;
}
export const searchQuery = (query: string, limit?: number, pathPrefix?: string): Promise<SearchHit[]> =>
  invoke("search_query", { query, limit: limit ?? null, pathPrefix: pathPrefix ?? null });
export const searchIndexFolder = (path: string): Promise<void> => invoke("search_index_folder", { path });
export const searchReindexPath = (path: string): Promise<void> => invoke("search_reindex_path", { path });
export const searchRemovePath = (path: string): Promise<void> => invoke("search_remove_path", { path });

/** 폴더 인덱싱 완료 이벤트. */
export const onIndexDone = (cb: (p: { root: string; count: number }) => void): Promise<UnlistenFn> =>
  listen<{ root: string; count: number }>("index-done", (e) => cb(e.payload));
/** 감시로 인한 인덱스 증분 갱신 이벤트(검색 패널 열려있으면 재질의). */
export const onIndexUpdated = (cb: () => void): Promise<UnlistenFn> => listen("index-updated", () => cb());

/** 커스텀 타이틀바(decorations:false) 창 컨트롤. */
export const winMinimize = (): Promise<void> => getCurrentWindow().minimize();
export const winToggleMaximize = (): Promise<void> => getCurrentWindow().toggleMaximize();
export const winClose = (): Promise<void> => getCurrentWindow().close();

/** 창 닫기 요청 가로채기(미저장 변경 가드). handler에서 event.preventDefault()로 종료 취소. */
export const onWindowCloseRequested = (
  handler: (event: { preventDefault: () => void }) => void,
): Promise<UnlistenFn> => getCurrentWindow().onCloseRequested(handler);
/** 가드 통과 후 실제 종료(onCloseRequested를 우회). */
export const winDestroy = (): Promise<void> => getCurrentWindow().destroy();

// ── 파일 연결(.md) 실행 인자 ──
/** 콜드 스타트 시 .md 연결/명령행으로 넘어온 대기 파일 경로(없으면 null). 부팅 시 1회 호출. */
export const takePendingOpen = (): Promise<string | null> => invoke<string | null>("take_pending_open");
/** 실행 중 앱에 .md 연결로 새 파일이 넘어올 때(웜 스타트, single-instance) 이벤트 구독. */
export const onOpenFile = (cb: (path: string) => void): Promise<UnlistenFn> =>
  listen<string>("open-file", (e) => cb(e.payload));

/** 시스템 파일 탐색기에서 해당 파일 위치를 파일 선택 상태로 연다(탭 우클릭 메뉴). */
export const revealInExplorer = (path: string): Promise<void> => revealItemInDir(path);
