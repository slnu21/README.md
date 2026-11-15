import { describe, expect, it } from "vitest";
import { ensurePermission, isWebPath, makeWebPath, WebFiles, WEB_READABLE_RE, type FileHandleLike, type WebFilesDeps } from "./files";

/** 가짜 파일 핸들 — 디스크 대신 객체 하나. 같은 `disk` 를 공유하면 같은 파일(isSameEntry). */
function fakeHandle(name: string, disk: { text: string }, perm: PermissionState = "granted", grant: PermissionState = "granted") {
  let state = perm;
  const h: FileHandleLike & { disk: typeof disk; requests: number } = {
    name,
    kind: "file",
    disk,
    requests: 0,
    getFile: async () => ({ text: async () => disk.text }),
    createWritable: async () => {
      let buf = "";
      return {
        write: async (d: string) => void (buf += d),
        close: async () => void (disk.text = buf),
      };
    },
    isSameEntry: async (o) => (o as unknown as { disk: unknown }).disk === disk,
    queryPermission: async () => state,
    requestPermission: async () => {
      h.requests++;
      state = grant;
      return grant;
    },
  };
  return h;
}

function setup(over: Partial<WebFilesDeps> = {}) {
  let n = 0;
  const downloads: { name: string; text: string }[] = [];
  const persisted: string[] = [];
  const files = new WebFiles({
    newId: () => `id${++n}`,
    download: (name, text) => downloads.push({ name, text }),
    persist: (e) => persisted.push(e.path),
    ...over,
  });
  return { files, downloads, persisted };
}

describe("web virtual paths", () => {
  it("/web/<id>/<이름> — 마지막 조각이 진짜 파일 이름(구분자는 바꾼다)", () => {
    expect(makeWebPath("ab12", "노트.md")).toBe("/web/ab12/노트.md");
    expect(makeWebPath("x", "a/b\\c.md")).toBe("/web/x/a_b_c.md");
    expect(isWebPath("/web/x/a.md")).toBe(true);
    expect(isWebPath("C:/docs/a.md")).toBe(false);
  });

  it("웹에서 여는 것은 마크다운·텍스트뿐(캔버스는 데스크톱)", () => {
    expect(["a.md", "b.MARKDOWN", "c.mdx", "d.txt"].every((f) => WEB_READABLE_RE.test(f))).toBe(true);
    expect(["map.canvas", "img.png", "x.html"].some((f) => WEB_READABLE_RE.test(f))).toBe(false);
  });
});

describe("WebFiles registry", () => {
  it("핸들 문서: 읽기·제자리 쓰기, 자동저장 가능", async () => {
    const { files, downloads } = setup();
    const disk = { text: "# 원본" };
    const p = await files.register("a.md", { handle: fakeHandle("a.md", disk) });
    expect(await files.read(p)).toBe("# 원본");
    await files.write(p, "# 고침");
    expect(disk.text).toBe("# 고침");
    expect(downloads).toEqual([]);
    expect(files.canAutosave(p)).toBe(true);
  });

  it("같은 파일을 다시 열면 같은 경로 — 탭이 둘로 갈라지지 않는다", async () => {
    const { files } = setup();
    const disk = { text: "" };
    const p1 = await files.register("a.md", { handle: fakeHandle("a.md", disk) });
    const p2 = await files.register("a.md", { handle: fakeHandle("a.md", disk) });
    const p3 = await files.register("a.md", { handle: fakeHandle("a.md", { text: "" }) });
    expect(p2).toBe(p1);
    expect(p3).not.toBe(p1);
  });

  it("핸들 없는 문서(<input> 폴백): 메모리에서 읽고, 저장은 다운로드 — 자동저장은 안 한다", async () => {
    const { files, downloads, persisted } = setup();
    const p = await files.register("b.md", { text: "본문" });
    expect(await files.read(p)).toBe("본문");
    expect(files.canAutosave(p)).toBe(false);
    await files.write(p, "새 본문");
    expect(downloads).toEqual([{ name: "b.md", text: "새 본문" }]);
    expect(await files.read(p)).toBe("새 본문");
    expect(persisted).toContain(p);
  });

  it("핸들 없는 문서 + 저장 위치 고르기 지원: 저장 때 핸들이 생기고 이후 제자리 저장", async () => {
    const disk = { text: "" };
    let asked = 0;
    const { files, downloads } = setup({
      pickSaveHandle: async (name) => {
        asked++;
        return fakeHandle(name, disk);
      },
    });
    const p = await files.register("new.md", { text: "" });
    await files.write(p, "첫 저장");
    await files.write(p, "둘째 저장");
    expect(asked).toBe(1);
    expect(disk.text).toBe("둘째 저장");
    expect(downloads).toEqual([]);
    expect(files.canAutosave(p)).toBe(true);
  });

  it("저장 위치 고르기를 취소하면 ECANCELED(탭은 미저장으로 남는다)", async () => {
    const { files } = setup({ pickSaveHandle: async () => null });
    const p = await files.register("new.md", { text: "" });
    await expect(files.write(p, "x")).rejects.toThrow("ECANCELED");
  });

  it("create 는 핸들 없는 새 문서를 다운로드하지 않는다(빈 새 문서마다 파일이 떨어지면 안 된다)", async () => {
    const { files, downloads } = setup();
    const p = await files.register("새 문서.md", { text: "" });
    await files.create(p, "");
    expect(downloads).toEqual([]);
    expect(await files.read(p)).toBe("");
  });

  it("모르는 경로는 ENOENT, has 는 등록 여부", async () => {
    const { files } = setup();
    expect(files.has("/web/zz/a.md")).toBe(false);
    await expect(files.read("/web/zz/a.md")).rejects.toThrow("ENOENT");
    await expect(files.write("/web/zz/a.md", "")).rejects.toThrow("ENOENT");
  });

  it("restore(최근 목록) 는 세션 중 등록한 같은 경로를 덮지 않는다", async () => {
    const { files } = setup();
    const p = await files.register("a.md", { text: "세션 최신" });
    files.restore({ path: p, name: "a.md", text: "옛 사본" });
    files.restore({ path: "/web/old/b.md", name: "b.md", text: "옛 문서" });
    expect(await files.read(p)).toBe("세션 최신");
    expect(await files.read("/web/old/b.md")).toBe("옛 문서");
  });
});

describe("ensurePermission", () => {
  it("이미 허용이면 묻지 않는다", async () => {
    const h = fakeHandle("a.md", { text: "" }, "granted");
    await ensurePermission(h, "read");
    expect(h.requests).toBe(0);
  });

  it("prompt 면 요청하고, 거절되면 EPERM(부팅 세션 복원은 이걸 조용히 건너뛴다)", async () => {
    const ok = fakeHandle("a.md", { text: "" }, "prompt", "granted");
    await ensurePermission(ok, "readwrite");
    expect(ok.requests).toBe(1);
    const no = fakeHandle("a.md", { text: "" }, "prompt", "denied");
    await expect(ensurePermission(no, "read")).rejects.toThrow("EPERM");
  });

  it("권한 API 가 없는 핸들은 그대로 통과", async () => {
    await expect(ensurePermission({ name: "a", getFile: async () => ({ text: async () => "" }) }, "read")).resolves.toBeUndefined();
  });
});
