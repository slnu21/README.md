// 웹 플랫폼 조립 — node(브라우저 API 없음)에서 도는 폴백 경로를 그대로 탄다:
// File System Access 없음 → 저장 대화상자 대신 가상 문서 · IndexedDB 없음 → 메모리 최근 목록 · localStorage 없음 → 메모리 설정.
import { describe, expect, it } from "vitest";
import * as web from "./index";

describe("web platform (폴백 경로)", () => {
  it("판 표 — 웹은 파일 하나 열고·읽고·고치기, 나머지는 데스크톱", () => {
    expect(web.features.edition).toBe("web");
    expect(Object.entries(web.features).filter(([k, v]) => k !== "edition" && v)).toEqual([]);
    expect(web.isNative()).toBe(false);
  });

  it("새 문서: 저장 위치 → 첫 내용 → 읽기 → 최근 목록(경로가 세션·최근의 식별자)", async () => {
    const p = await web.saveFile("C:/docs/새 문서.md", [{ name: "Markdown", extensions: ["md"] }]);
    expect(p).toMatch(/^\/web\/[^/]+\/새 문서\.md$/);
    await web.createFile(p!, "# 제목\r\n본문");
    expect(await web.pathExists(p!)).toBe(true);
    expect(await web.readFile(p!)).toBe("# 제목\n본문"); // 데스크톱처럼 LF 로
    expect(web.canAutosave(p!)).toBe(false); // 핸들 없음 → 다운로드 폴백이라 자동저장 안 함
    await web.wsTouchRecent(p!);
    const snap = await web.wsLoad();
    expect(snap.recent[0]).toBe(p);
    expect(snap.nodes).toEqual([]);
  });

  it("부팅 스냅샷(wsLoad)이 도착하기 전에 연 문서도 최근 목록에 남는다(늦은 옛 스냅샷이 지우지 않게)", async () => {
    const p = (await web.saveFile("늦게.md", []))!;
    await web.createFile(p, "x");
    const boot = web.wsLoad(); // 하이드레이트가 먼저 묻고
    void web.wsTouchRecent(p); // 그 사이에 문서를 연다(드롭)
    expect((await boot).recent[0]).toBe(p);
  });

  it("설정 왕복(localStorage 없으면 메모리)", async () => {
    await web.settingsSet("annot.meanings", "{}");
    expect(await web.settingsGetAll()).toContainEqual(["annot.meanings", "{}"]);
  });

  it("테마 — 기본 팩을 번들에서 내준다(사용자 테마 폴더는 없음)", async () => {
    const b = await web.readThemeBundle();
    expect(b.packs.length).toBeGreaterThan(0);
    await expect(web.themeDirPath()).rejects.toThrow(/desktop-only/);
  });

  it("데스크톱 기능은 조용히 성공하지 않는다 — UI 가 숨긴 경로가 새면 드러나게", async () => {
    await expect(web.pickFolder()).rejects.toThrow(/EWEB/);
    await expect(web.historyList("/web/x/a.md")).rejects.toThrow(/EWEB/);
    await expect(web.wsCreateFolder("i", null, "n")).rejects.toThrow(/EWEB/);
  });

  it("감시·색인·받은 문서함은 할 일이 없을 뿐 — 앱 부팅 경로가 깨지지 않게 조용히 끝난다", async () => {
    await expect(web.watchFiles([], [])).resolves.toBeUndefined();
    expect(await web.inboxList()).toEqual({ items: [], total: 0 });
    expect(await web.searchQuery("x")).toEqual([]);
    expect(await web.takePendingOpen()).toBeNull();
    const un = await web.onFileChanged(() => {});
    expect(typeof un).toBe("function");
  });
});
