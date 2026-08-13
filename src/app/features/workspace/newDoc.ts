// 새 문서 만들기 — 이름 검사(lib/paths) → 디스크 생성(Rust) → 탭 열기 → 트리·색인 갱신.
//
// "경로 먼저" 방식이다. 무제 버퍼(빈 탭을 먼저 열고 저장할 때 경로를 정하는 VS Code 방식)를
// 쓰지 않는 이유: 이 앱의 탭은 경로가 곧 식별자라(store OpenTab.path) 세션 복원·파일 감시·
// 자동저장·닫기 가드·최근 목록이 전부 실경로를 전제로 돌아간다. 그 전제를 뒤집는 것보다
// 파일을 먼저 만드는 편이 안전하고, 만든 즉시 워크스페이스와 전역 검색에도 잡힌다.
import { createFile, searchReindexPath } from "../../lib/tauri";
import { normalizeDocName, type NameError } from "../../lib/paths";
import { useAppStore } from "../../store";

export type NewDocResult =
  | { ok: true; path: string }
  | { ok: false; reason: NameError | "exists" | "io"; detail?: string };

/** 만든 파일을 탭으로 열고 트리·검색 색인에 반영. 내용이 비어 있으므로 dirty 는 false 가 맞다. */
async function openCreated(path: string): Promise<NewDocResult> {
  const st = useAppStore.getState();
  st.openFile(path, "");
  await st.refreshWorkspace();
  void searchReindexPath(path).catch(() => {});
  return { ok: true, path };
}

function toReason(e: unknown): NewDocResult {
  const msg = e instanceof Error ? e.message : String(e);
  // Rust create_file 은 이미 있을 때만 정확히 "EEXIST" 를 돌려준다.
  return msg.includes("EEXIST")
    ? { ok: false, reason: "exists" }
    : { ok: false, reason: "io", detail: msg };
}

/** `dir` 안에 `rawName` 으로 새 문서를 만든다(워크스페이스 폴더 우클릭 경로). */
export async function createDocIn(dir: string, rawName: string): Promise<NewDocResult> {
  const check = normalizeDocName(rawName);
  if (!check.ok) return { ok: false, reason: check.error! };
  const path = `${dir.replace(/[/\\]+$/, "")}/${check.name}`;
  try {
    await createFile(path);
  } catch (e) {
    return toReason(e);
  }
  return openCreated(path);
}

/** 저장 대화상자로 고른 전체 경로에 새 문서를 만든다(Ctrl+N·가상 폴더 경로). */
export async function createDocAt(path: string): Promise<NewDocResult> {
  try {
    await createFile(path);
  } catch (e) {
    return toReason(e);
  }
  return openCreated(path);
}
