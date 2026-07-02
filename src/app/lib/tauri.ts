// Rust 커맨드 래퍼 + 다이얼로그. 실제 파일 I/O는 풀 접근 권한의 Rust(std::fs)에서 수행한다.
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 워크스페이스 트리 노드(Rust `read_dir_tree` 반환, camelCase). */
export interface DirEntryNode {
  name: string;
  path: string;
  isDir: boolean;
  children: DirEntryNode[];
}

export function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export function writeFile(path: string, contents: string): Promise<void> {
  return invoke<void>("write_file", { path, contents });
}

/** 폴더를 재귀 스캔한 트리를 반환. */
export function readDirTree(path: string): Promise<DirEntryNode> {
  return invoke<DirEntryNode>("read_dir_tree", { path });
}

/** 파일 열기 다이얼로그 → 선택 경로(취소 시 null). */
export async function pickFile(): Promise<string | null> {
  const res = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] }],
  });
  return typeof res === "string" ? res : null;
}

/** 폴더 열기 다이얼로그 → 선택 경로(취소 시 null). */
export async function pickFolder(): Promise<string | null> {
  const res = await open({ directory: true, multiple: false });
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

// TODO: search(FTS5), export 래퍼 추가
