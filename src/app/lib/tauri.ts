// Rust 커맨드 래퍼 + 다이얼로그. 실제 파일 I/O는 풀 접근 권한의 Rust(std::fs)에서 수행한다.
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

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

// TODO: watch(파일 감시), search(FTS5), export 래퍼 추가
