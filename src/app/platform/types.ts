// 플랫폼 공용 타입 — 데스크톱(platform/tauri.ts)과 웹(platform/web/) 두 구현이 같은 모양을 돌려준다.
// 함수 목록 자체의 계약은 platform/conformance.ts 가 컴파일 시간에 맞춰 본다(웹 구현 ⊇ 데스크톱 구현).

/** 워크스페이스 트리 노드(Rust `read_dir_tree` 반환, camelCase). */
export interface DirEntryNode {
  name: string;
  path: string;
  isDir: boolean;
  children: DirEntryNode[];
}

/** OS 파일 드롭 이벤트 단계. drop 시 실제 경로(웹은 가상 경로) 제공. */
export type DragDropPhase = "enter" | "over" | "drop" | "leave";

export type FileFilter = { name: string; extensions: string[] };

export type UnlistenFn = () => void;

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

// ── 전역 검색(FTS5) ──
export interface SearchHit {
  realPath: string;
  name: string;
  snippet: string;
}

/** 폴더 인덱싱 완료 이벤트. count=새로 인덱싱한 수, removed=사라진 파일을 인덱스에서 정리한 수. */
export interface IndexDone {
  root: string;
  count: number;
  removed: number;
}

/** 열어야 할 파일과, 있으면 보여 줄 줄(1-based — 에이전트 브리지 `open_in_app(line)` 이 `--line=N` 으로 붙인다). */
export type PendingFile = { path: string; line: number | null };

// ── 문서 기록(스냅샷) ──
export type HistoryEntry = { id: number; mtime: number; takenAt: number; bytes: number };

// ── 받은 문서함 ──
export type InboxItem = { realPath: string; name: string; mtime: number; isNew: boolean };
export type InboxSnapshot = { items: InboxItem[]; total: number };

// ── 에이전트 브리지(MCP) ──
export type AgentInfo = {
  exePath: string;
  /** 별칭이 실제로 깔렸으면 그 경로. Store 설치본이 아니거나 사용자가 별칭을 꺼 두면 null. */
  aliasPath: string | null;
  aliasName: string;
};

/** 판(에디션)마다 있는 기능. UI 는 이 표를 보고 숨기거나 "데스크톱 앱에서" 안내를 띄운다.
 *  빌드 시 alias 로 구현이 하나만 들어가므로 값은 상수다. */
export interface PlatformFeatures {
  edition: "desktop" | "web";
  /** 폴더 열기·워크스페이스 트리·즐겨찾기·전역 찾기바꾸기·재동기화 */
  workspace: boolean;
  /** 전역 검색(FTS5) */
  search: boolean;
  /** 문서 기록(스냅샷·되돌리기) */
  history: boolean;
  /** 받은 문서함(바뀐 문서 종) */
  inbox: boolean;
  /** 에이전트 브리지(MCP) 연결 패널 */
  agentBridge: boolean;
  /** 표시 펜(형광펜·메모) */
  annotations: boolean;
  /** 캔버스(.canvas 문서 지도) */
  canvas: boolean;
  /** 사용자 테마 파일·폴더(내장 테마 팩은 웹에도 번들) */
  userThemes: boolean;
  /** 커스텀 타이틀바 창 버튼(최소화·최대화·닫기) */
  windowControls: boolean;
  /** 탐색기에서 위치 열기·경로 복사(실경로가 있을 때) */
  revealInExplorer: boolean;
}

/** 데스크톱 앱 Store 페이지 — 웹에 없는 기능 자리의 안내가 가리킨다. */
export const STORE_URL = "https://apps.microsoft.com/detail/9N9QMXQPND3H";
