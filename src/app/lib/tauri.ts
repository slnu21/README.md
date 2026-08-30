// Rust 커맨드 래퍼 + 다이얼로그. 실제 파일 I/O는 풀 접근 권한의 Rust(std::fs)에서 수행한다.
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir, openUrl as openerOpenUrl } from "@tauri-apps/plugin-opener";
import type { ThemeBundle } from "../themes/custom";
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

/** base64 바이트를 파일로 저장(클립보드 이미지 붙여넣기). 부모 폴더가 없으면 만든다.
 *  writeFile은 문자열 전용이라 바이너리를 무손실로 쓸 수 없다. */
export function writeFileBase64(path: string, b64: string): Promise<void> {
  return invoke<void>("write_file_base64", { path, b64 });
}

/** 새 문서 생성. 부모 폴더가 없으면 만들고, **이미 있으면 "EEXIST" 로 거절**한다(덮어쓰지 않는다). */
export function createFile(path: string, contents = ""): Promise<void> {
  return invoke<void>("create_file", { path, contents });
}

/** 경로 존재 여부(이미지 파일명 충돌 회피용). */
export function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

/** 폴더를 재귀 스캔한 트리를 반환. */
export function readDirTree(path: string): Promise<DirEntryNode> {
  return invoke<DirEntryNode>("read_dir_tree", { path });
}

/** 사용자 테마 파일 경로(`%APPDATA%\com.readme.app\themes.jsonc`). 폴더는 필요하면 만들고
 *  파일 자체는 만들지 않는다. 생성은 `createFile`(create_new)로 — `writeFile` 은 조용히
 *  덮어쓰므로 "존재 검사 후 쓰기"는 사용자 테마를 날릴 수 있는 TOCTOU 다. */
export function themeFilePath(): Promise<string> {
  return invoke<string>("theme_file_path");
}

/** 사용자 테마 폴더 경로(`…\com.readme.app\themes`). 없으면 만든다.
 *  여기 `*.jsonc` 를 떨어뜨리는 것이 곧 "테마 가져오기"다 — 별도 대화상자가 필요 없다. */
export function themeDirPath(): Promise<string> {
  return invoke<string>("theme_dir_path");
}

/** 테마 입력(themes.jsonc + themes/*.jsonc + themes/*.css)을 한 번에 읽는다.
 *  파일마다 IPC 를 왕복하면 부팅이 느려지고, 읽는 중 파일이 바뀌면 섞인 상태가 된다. */
export function readThemeBundle(): Promise<ThemeBundle> {
  return invoke<ThemeBundle>("read_theme_bundle");
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

/** 가져온 폴더 **구조** 변경(생성·삭제·이름변경) 이벤트 구독 → 워크스페이스 트리 재파생용.
 *  file-changed 와 별개다: 저쪽은 내용 변경까지 포함한 "열린 탭 리로드"용이라 빈도가 훨씬 높다. */
export function onFsStructural(cb: (paths: string[]) => void): Promise<UnlistenFn> {
  return listen<string[]>("fs-structural", (e) => cb(e.payload));
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

/** 폴더 인덱싱 완료 이벤트. count=새로 인덱싱한 수, removed=사라진 파일을 인덱스에서 정리한 수. */
export interface IndexDone {
  root: string;
  count: number;
  removed: number;
}
export const onIndexDone = (cb: (p: IndexDone) => void): Promise<UnlistenFn> =>
  listen<IndexDone>("index-done", (e) => cb(e.payload));
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

/** 외부 링크(http(s)/mailto/tel)를 OS 기본 브라우저·메일 클라이언트로 연다.
 *  미리보기 iframe 안에서 직접 이동하면 srcdoc 문서가 날아가므로(빈 화면) 호스트가 대신 처리한다.
 *
 *  **반드시 `openUrl` 이어야 한다.** `openPath` 는 `plugin:opener|open_path` 를 부르는데
 *  `capabilities/default.json` 의 `opener:default` 에는 그 커맨드가 없어 ACL 에서 거부된다
 *  ("Command plugin:opener|open_path not allowed by ACL" — 실행 중인 앱에 CDP 로 붙어 확인).
 *  v0.6.8~v0.7.0 이 그걸 부르고 있었고, 거부를 `.catch(()=>{})` 로 삼켜서 외부 링크가
 *  아무 반응 없이 죽어 있었다. `open_url` 은 기본 스코프(mailto:*·tel:*·http://*·https://*)로
 *  이미 허용돼 있다 — 여기 넘기는 스킴 집합은 lib/links.ts 의 EXTERNAL_SCHEMES 와 같아야 한다. */
export const openExternalUrl = (url: string): Promise<void> => openerOpenUrl(url);

/** 앱에서 못 여는 로컬 파일을 OS 기본 프로그램으로 연다(미리보기의 .pdf·이미지 링크).
 *  플러그인의 `open_path` 가 아니라 **우리 Rust 커맨드**를 쓴다 — 확장자 허용 목록을 백엔드에
 *  두기 위해서다(사유는 `commands/shell_open.rs` 머리말). 실패 코드: "ENOENT" | "EUNSAFE". */
export const openWithDefault = (path: string): Promise<void> =>
  invoke<void>("open_with_default", { path });
