// 웹 W2 순수 로직 — 공유 링크 인코딩 · URL 변환 · 페이지 영속 패치 · 언어 전환 보관 · 등록부 put.
import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url, crc32 } from "./bytes";
import { decodeShare, encodeShare, isShareHash, shareName, sharePath, ShareError, SHARE_MAX_HASH } from "./share";
import {
  RemoteError,
  fetchText,
  fetchBytes,
  isUrlWebPath,
  nameOfWebPath,
  normalizeSourceUrl,
  urlToWebPath,
  webPathToUrl,
} from "./remote";
import { applyPageToStorage, pagePatch, patchPersisted, readPage } from "./page";
import { buildStash, validStash, STASH_TTL_MS } from "./stash";
import { WebFiles } from "./files";
import { resolvePath, dirOf } from "../../lib/paths";
import { sampleDoc } from "./samples";

describe("bytes — base64url", () => {
  it("왕복(길이 0~5 · 모든 바이트)", () => {
    for (let n = 0; n < 6; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) & 255);
      expect(fromBase64Url(toBase64Url(b))).toEqual(b);
    }
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(fromBase64Url(toBase64Url(all))).toEqual(all);
    expect(toBase64Url(all)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("잘못된 글자·길이는 undefined", () => {
    expect(fromBase64Url("ab+c")).toBeUndefined();
    expect(fromBase64Url("abcde")).toBeUndefined();
  });
  it("crc32 기준값", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("공유 링크", () => {
  const doc = "# 제목\n\n본문 — **굵게**, `코드`, 이모지 🎉\n\n```mermaid\nflowchart LR\n  A --> B\n```\n";

  it("왕복 — 이름·내용(한글·이모지) 그대로, 같은 링크는 같은 경로", async () => {
    const r = await encodeShare(doc, "노트 1.md");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isShareHash(r.hash)).toBe(true);
    expect(r.hash).toMatch(/^n=[^&]+&md=[A-Za-z0-9_-]+$/);
    const back = await decodeShare(`#${r.hash}`);
    expect(back).toMatchObject({ name: "노트 1.md", text: doc });
    const again = await decodeShare(r.hash);
    expect(sharePath(again!)).toBe(sharePath(back!));
    expect(sharePath(back!)).toMatch(/^\/web\/share-[0-9a-f]{8}\/노트 1\.md$/);
  });

  it("압축이 된다(반복 많은 문서는 원문보다 훨씬 짧다)", async () => {
    const r = await encodeShare("| a | b |\n|---|---|\n".repeat(400), "t.md");
    expect(r.ok && r.length).toBeLessThan(1000);
  });

  it("상한 초과 — 길이와 상한을 알려 주고 거절", async () => {
    let rnd = "";
    let x = 1;
    for (let i = 0; i < 60_000; i++) rnd += String.fromCharCode(33 + (((x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 16) % 90));
    const r = await encodeShare(rnd, "big.md");
    expect(r).toMatchObject({ ok: false, reason: "too-long", max: SHARE_MAX_HASH });
    if (!r.ok && r.reason === "too-long") expect(r.length).toBeGreaterThan(SHARE_MAX_HASH);
  });

  it("공유 링크가 아니면 null, 잘리거나 깨지면 corrupt", async () => {
    expect(await decodeShare("#section-2")).toBeNull();
    expect(await decodeShare("")).toBeNull();
    const r = await encodeShare(doc, "a.md");
    if (!r.ok) throw new Error("encode");
    await expect(decodeShare(r.hash.slice(0, r.hash.length - 7))).rejects.toBeInstanceOf(ShareError);
    await expect(decodeShare("md=@@@")).rejects.toMatchObject({ reason: "corrupt" });
  });

  it("이름 정리 — 경로 조각·확장자", () => {
    expect(shareName("C:\\x\\y\\a.md")).toBe("a.md");
    expect(shareName("notes")).toBe("notes.md");
    expect(shareName("")).toBe("shared.md");
    expect(shareName(null)).toBe("shared.md");
  });
});

describe("URL 로 열기 — 주소 변환", () => {
  it("github blob·raw·tree·저장소 → raw.githubusercontent", () => {
    expect(normalizeSourceUrl("https://github.com/o/r/blob/main/docs/README.md")).toEqual({
      ok: true,
      url: "https://raw.githubusercontent.com/o/r/main/docs/README.md",
      converted: true,
    });
    expect(normalizeSourceUrl("github.com/o/r")).toMatchObject({ url: "https://raw.githubusercontent.com/o/r/HEAD/README.md" });
    expect(normalizeSourceUrl("https://github.com/o/r.git")).toMatchObject({ url: "https://raw.githubusercontent.com/o/r/HEAD/README.md" });
    expect(normalizeSourceUrl("https://github.com/o/r/tree/dev/pkg")).toMatchObject({ url: "https://raw.githubusercontent.com/o/r/dev/pkg/README.md" });
    expect(normalizeSourceUrl("https://github.com/o/r/raw/v1/a.md#x")).toMatchObject({ url: "https://raw.githubusercontent.com/o/r/v1/a.md" });
    expect(normalizeSourceUrl("https://github.com/o/r/issues/1")).toEqual({ ok: false, reason: "invalid" });
  });
  it("gist·gitlab·그 밖은 그대로", () => {
    expect(normalizeSourceUrl("https://gist.github.com/u/abc123")).toMatchObject({ url: "https://gist.githubusercontent.com/u/abc123/raw" });
    expect(normalizeSourceUrl("https://gitlab.com/g/p/-/blob/main/README.md")).toMatchObject({ url: "https://gitlab.com/g/p/-/raw/main/README.md" });
    expect(normalizeSourceUrl("https://raw.githubusercontent.com/o/r/main/a.md")).toMatchObject({ converted: false });
  });
  it("거절 — 빈 값·http(루프백 제외)·다른 프로토콜", () => {
    expect(normalizeSourceUrl("  ")).toEqual({ ok: false, reason: "empty" });
    expect(normalizeSourceUrl("http://example.com/a.md")).toEqual({ ok: false, reason: "protocol" });
    expect(normalizeSourceUrl("javascript:alert(1)")).toEqual({ ok: false, reason: "protocol" });
    expect(normalizeSourceUrl("ftp://x/a.md")).toEqual({ ok: false, reason: "protocol" });
    expect(normalizeSourceUrl("http://127.0.0.1:5194/a.md")).toMatchObject({ ok: true });
    expect(normalizeSourceUrl("https://")).toEqual({ ok: false, reason: "invalid" });
  });
  it("가상 경로 ↔ 주소 왕복, 상대 이미지·링크가 같은 저장소 주소가 된다", () => {
    const url = "https://raw.githubusercontent.com/o/r/main/docs/README.md";
    const p = urlToWebPath(url);
    expect(p).toBe("/web/url/raw.githubusercontent.com/o/r/main/docs/README.md");
    expect(isUrlWebPath(p)).toBe(true);
    expect(nameOfWebPath(p)).toBe("README.md");
    expect(webPathToUrl(p)).toBe(url);
    expect(webPathToUrl(resolvePath(dirOf(p), "../img/a b.png"))).toBe("https://raw.githubusercontent.com/o/r/main/img/a%20b.png");
    expect(webPathToUrl(resolvePath(dirOf(p), "./guide.md"))).toBe("https://raw.githubusercontent.com/o/r/main/docs/guide.md");
    expect(urlToWebPath("http://127.0.0.1:5194/x/y.md")).toBe("/web/url-http/127.0.0.1:5194/x/y.md");
    expect(webPathToUrl("/web/url-http/127.0.0.1:5194/x/y.md")).toBe("http://127.0.0.1:5194/x/y.md");
    expect(urlToWebPath("https://gist.githubusercontent.com/u/abc/raw")).toBe("/web/url/gist.githubusercontent.com/u/abc/raw/index.md");
    expect(urlToWebPath("https://e.com/%ED%95%9C.md")).toBe("/web/url/e.com/한.md");
    expect(webPathToUrl("/web/abc/a.md")).toBeNull();
  });

  const fake = (body: string, init: { status?: number; type?: string; len?: number } = {}) =>
    (async () =>
      new Response(body, {
        status: init.status ?? 200,
        headers: { "content-type": init.type ?? "text/plain; charset=utf-8", ...(init.len ? { "content-length": String(init.len) } : {}) },
      })) as unknown as typeof fetch;

  it("받기 — 줄바꿈 LF, 실패는 이유별(친절한 안내의 근거)", async () => {
    expect(await fetchText("https://x/a.md", { fetchImpl: fake("a\r\nb") })).toBe("a\nb");
    await expect(fetchText("https://x/a.md", { fetchImpl: fake("no", { status: 404 }) })).rejects.toMatchObject({ reason: "http", status: 404 });
    await expect(fetchText("https://x/a.md", { fetchImpl: fake("<!doctype html><p>", { type: "text/html" }) })).rejects.toMatchObject({ reason: "html" });
    await expect(fetchText("https://x/a.md", { fetchImpl: fake("x", { len: 9e9 }) })).rejects.toMatchObject({ reason: "too-large" });
    await expect(fetchText("https://x/a.md", { fetchImpl: fake("x".repeat(20)), maxBytes: 10 })).rejects.toMatchObject({ reason: "too-large" });
    const cors = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchText("https://x/a.md", { fetchImpl: cors })).rejects.toMatchObject({ reason: "network" });
    const slow = ((_u: string, init: RequestInit) =>
      new Promise((_r, j) => init.signal?.addEventListener("abort", () => j(Object.assign(new Error("a"), { name: "AbortError" }))))) as unknown as typeof fetch;
    await expect(fetchText("https://x/a.md", { fetchImpl: slow, timeoutMs: 20 })).rejects.toBeInstanceOf(RemoteError);
    expect(await fetchBytes("https://x/p.png", { fetchImpl: fake("PNG") })).toEqual(new TextEncoder().encode("PNG"));
  });
});

describe("페이지 — 언어·랜딩이 영속 상태를 정한다", () => {
  it("html 속성 읽기(모르는 값은 기본)", () => {
    expect(readPage({ lang: "ko", dataset: { route: "mermaid-preview", base: "/" } })).toMatchObject({ lang: "ko", route: { id: "mermaid-preview", mode: "split" } });
    expect(readPage({ lang: "fr", dataset: {} })).toMatchObject({ lang: "en", route: { id: "app" }, base: "/" });
    expect(readPage(null, "/sub/").base).toBe("/sub/");
  });
  it("영속 원문 패치 — 다른 필드·version 보존, 깨진 원문은 새로", () => {
    const raw = JSON.stringify({ state: { language: "en", themeId: "dark", readerMode: true }, version: 0 });
    const p = JSON.parse(patchPersisted(raw, { language: "ko" }));
    expect(p).toEqual({ state: { language: "ko", themeId: "dark", readerMode: true }, version: 0 });
    expect(JSON.parse(patchPersisted("{oops", { language: "ko" }))).toEqual({ state: { language: "ko" }, version: 0 });
    expect(JSON.parse(patchPersisted(null, { a: 1 })).state).toEqual({ a: 1 });
  });
  it("랜딩의 보기 — viewer=리딩, mermaid·readme=편집, 앱=건드리지 않음", () => {
    expect(pagePatch(readPage({ lang: "en", dataset: { route: "markdown-viewer" } }))).toEqual({ language: "en", readerMode: true });
    expect(pagePatch(readPage({ lang: "ko", dataset: { route: "readme-preview" } }))).toEqual({ language: "ko", readerMode: false });
    expect(pagePatch(readPage({ lang: "ko", dataset: { route: "app" } }))).toEqual({ language: "ko" });
  });
  it("저장소에 적용 — 던져도 조용히", () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    applyPageToStorage(st, readPage({ lang: "ko", dataset: { route: "markdown-viewer" } }));
    expect(JSON.parse(m.get("md-reader")!).state).toEqual({ language: "ko", readerMode: true });
    const bad = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(() => applyPageToStorage(bad, readPage(null))).not.toThrow();
    expect(() => applyPageToStorage(undefined, readPage(null))).not.toThrow();
  });
});

describe("언어 전환 보관", () => {
  const tabs = [
    { path: "/web/a/one.md", title: "one.md", content: "# 1", dirty: true },
    { path: "/web/b/two.md", title: "two.md", content: "# 2", dirty: false },
  ];
  it("탭 전부(내용·미저장·핸들) + 활성", () => {
    const h = { name: "two.md" };
    const s = buildStash(tabs, "/web/a/one.md", (p) => (p.endsWith("two.md") ? h : undefined), 1000);
    expect(s).toEqual({
      at: 1000,
      active: "/web/a/one.md",
      tabs: [
        { path: "/web/a/one.md", name: "one.md", content: "# 1", dirty: true },
        { path: "/web/b/two.md", name: "two.md", content: "# 2", dirty: false, handle: h },
      ],
    });
  });
  it("검증 — 오래되거나(5분) 미래거나 모양이 틀리면 버린다", () => {
    const s = buildStash(tabs, null, () => undefined, 1000);
    expect(validStash(s, 1000 + 1000)?.tabs).toHaveLength(2);
    expect(validStash(s, 1000 + STASH_TTL_MS + 1)).toBeNull();
    expect(validStash(s, 1000 - 120_000)).toBeNull();
    expect(validStash({ at: 1000, tabs: [{ path: 1 }, ...s.tabs] }, 1000)?.tabs).toHaveLength(2);
    expect(validStash("x", 1000)).toBeNull();
    expect(validStash(null, 1000)).toBeNull();
  });
});

describe("등록부 put — 정한 경로에 텍스트 문서", () => {
  it("새로 두고, 다시 두면 내용만 바뀐다(핸들 문서는 건드리지 않음)", async () => {
    const f = new WebFiles({ newId: () => "x", download: () => {} });
    f.put("/web/url/h/a.md", "a.md", "1");
    expect(await f.read("/web/url/h/a.md")).toBe("1");
    f.put("/web/url/h/a.md", "a.md", "2");
    expect(await f.read("/web/url/h/a.md")).toBe("2");
    const p = await f.register("b.md", { handle: { name: "b.md", getFile: async () => ({ text: async () => "disk" }) } });
    f.put(p, "b.md", "other");
    expect(await f.read(p)).toBe("disk");
  });
});

describe("랜딩 견본", () => {
  it("언어별 · 경로가 고정(다시 와도 탭이 하나)", () => {
    expect(sampleDoc("mermaid", "ko").path).toBe(sampleDoc("mermaid", "ko").path);
    expect(sampleDoc("mermaid", "ko").text).toContain("```mermaid");
    expect(sampleDoc("readme", "en").name).toBe("README.md");
    expect(sampleDoc("viewer", "en").path).not.toBe(sampleDoc("viewer", "ko").path);
  });
});
