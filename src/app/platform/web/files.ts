// 웹 파일 등록부 — 웹에는 경로가 없다. 앱의 탭·최근·세션 복원은 **경로 문자열이 곧 식별자**라서
// (store OpenTab.path) 열린 파일마다 가상 경로 `/web/<id>/<이름>` 을 붙이고 이 등록부가 실물을 들고 있는다.
//   · 핸들 있음(Chromium File System Access API) — 읽기·제자리 쓰기. 권한은 쓸 때 묻는다.
//   · 핸들 없음(<input> 열기·아직 저장 안 한 새 문서) — 내용을 메모리에 두고, 저장은
//     "저장 위치 고르기"(지원하면) 또는 다운로드로.
// 가상 경로의 마지막 조각이 진짜 파일 이름이라 탭 제목·내보내기 이름·확장자 판정이 그대로 돈다.
// 브라우저 API 는 의존성으로 받는다(테스트는 가짜 핸들·가짜 다운로드로 돈다).

/** File System Access API 의 FileSystemFileHandle 중 쓰는 부분. lib.dom 에 아직 없는 메서드는 선택. */
export interface FileHandleLike {
  readonly name: string;
  readonly kind?: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable?(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  isSameEntry?(other: FileHandleLike): Promise<boolean>;
  queryPermission?(desc: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(desc: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

export interface WebEntry {
  path: string;
  name: string;
  handle?: FileHandleLike;
  /** 핸들 없는 문서의 내용(메모리 · 최근 목록에 사본). */
  text?: string;
}

export interface WebFilesDeps {
  newId(): string;
  /** 핸들 없는 문서 저장의 마지막 수단. */
  download(name: string, text: string): void;
  /** 저장 위치 고르기(showSaveFilePicker). 지원 안 하면 undefined → 다운로드. 취소면 null. */
  pickSaveHandle?: (suggestedName: string) => Promise<FileHandleLike | null>;
  /** 열거나 저장할 때 최근 목록 사본을 고친다(경로는 같고 핸들·내용이 바뀔 수 있다). */
  persist?: (entry: WebEntry) => void;
}

export const WEB_ROOT = "/web/";

export function makeWebPath(id: string, name: string): string {
  return `${WEB_ROOT}${id}/${name.replace(/[\\/]/g, "_")}`;
}

export function isWebPath(path: string): boolean {
  return path.startsWith(WEB_ROOT);
}

/** 웹에서 여는 문서 — 마크다운 계열 + 텍스트(캔버스는 데스크톱 전용). */
export const WEB_READABLE_RE = /\.(md|markdown|mdx|txt)$/i;

/** 권한 확인 → 필요하면 요청. 사용자 동작 없이 요청하면 브라우저가 거절한다(부팅 세션 복원은 그래서 조용히 건너뛴다). */
export async function ensurePermission(h: FileHandleLike, mode: "read" | "readwrite"): Promise<void> {
  if (!h.queryPermission) return;
  if ((await h.queryPermission({ mode })) === "granted") return;
  const r = h.requestPermission ? await h.requestPermission({ mode }) : "denied";
  if (r !== "granted") throw new Error("EPERM");
}

export class WebFiles {
  private entries = new Map<string, WebEntry>();
  constructor(private deps: WebFilesDeps) {}

  has(path: string): boolean {
    return this.entries.has(path);
  }

  get(path: string): WebEntry | undefined {
    return this.entries.get(path);
  }

  /** 최근 목록에서 되살린 항목을 그대로 넣는다(같은 경로가 이미 있으면 그쪽이 이긴다 — 세션 중 바뀐 것이 최신). */
  restore(entry: WebEntry): void {
    if (!this.entries.has(entry.path)) this.entries.set(entry.path, { ...entry });
  }

  /** 정한 경로에 텍스트 문서를 둔다(URL·공유 링크·견본 — 같은 원본이면 같은 경로라 탭이 갈라지지 않는다).
   *  이미 있으면 내용만 바꾼다. 핸들은 없다 — 저장하면 저장 위치를 묻는다. */
  put(path: string, name: string, text: string): void {
    const e = this.entries.get(path);
    if (e && !e.handle) e.text = text;
    else if (!e) this.entries.set(path, { path, name, text });
  }

  /** 새로 연 파일을 올린다. 같은 파일(핸들 isSameEntry)을 다시 열면 **같은 경로**를 돌려준다 —
   *  그래야 같은 문서가 탭 두 개로 갈라지지 않는다. */
  async register(name: string, src: { handle?: FileHandleLike; text?: string }): Promise<string> {
    if (src.handle) {
      for (const e of this.entries.values()) {
        if (!e.handle?.isSameEntry) continue;
        try {
          if (await e.handle.isSameEntry(src.handle)) {
            e.handle = src.handle; // 새 핸들이 방금 받은 권한을 들고 있다
            return e.path;
          }
        } catch {
          /* 다른 파일 */
        }
      }
    }
    const path = makeWebPath(this.deps.newId(), name);
    this.entries.set(path, { path, name, handle: src.handle, text: src.handle ? undefined : (src.text ?? "") });
    return path;
  }

  async read(path: string): Promise<string> {
    const e = this.entries.get(path);
    if (!e) throw new Error("ENOENT");
    if (e.handle) {
      await ensurePermission(e.handle, "read");
      return (await e.handle.getFile()).text();
    }
    if (typeof e.text === "string") return e.text;
    throw new Error("ENOENT");
  }

  /** 저장. 핸들 있으면 제자리에. 없으면 저장 위치를 고르게 하고(핸들이 생긴다) 그것도 안 되면 다운로드. */
  async write(path: string, text: string): Promise<void> {
    const e = this.entries.get(path);
    if (!e) throw new Error("ENOENT");
    if (!e.handle && this.deps.pickSaveHandle) {
      const h = await this.deps.pickSaveHandle(e.name);
      if (!h) throw new Error("ECANCELED");
      e.handle = h;
      e.text = undefined;
    }
    if (e.handle?.createWritable) {
      await ensurePermission(e.handle, "readwrite");
      const w = await e.handle.createWritable();
      await w.write(text);
      await w.close();
    } else {
      this.deps.download(e.name, text);
      e.text = text;
    }
    this.deps.persist?.(e);
  }

  /** 새 문서·저장 대화상자로 막 받은 경로에 첫 내용을 둔다. 핸들 없는 문서는 **다운로드하지 않는다** —
   *  빈 새 문서를 만들 때마다 파일이 떨어지면 안 된다(저장할 때 내려받는다). */
  async create(path: string, text: string): Promise<void> {
    const e = this.entries.get(path);
    if (!e) throw new Error("ENOENT");
    if (e.handle) return this.write(path, text);
    e.text = text;
    this.deps.persist?.(e);
  }

  /** 자동저장을 조용히 해도 되나 — 제자리에 쓸 수 있는 핸들이 있을 때만(다운로드 폴백은 저장마다 파일이 떨어진다). */
  canAutosave(path: string): boolean {
    return !!this.entries.get(path)?.handle?.createWritable;
  }
}
