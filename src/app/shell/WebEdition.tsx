// 웹 에디션 W2 화면 동작 — 한 훅(useWebEdition)에 모은다. AppShell 은 `__WEB__ ? useWebEdition() : null` 한 줄로만 부른다
// (데스크톱 번들에서는 상수 접기로 import 째 빠진다 — 그러려면 이 파일과 이 파일이 import 하는 웹 모듈에 모듈 최상위 부작용이 없어야 한다).
//
//   · 페이지(언어·랜딩) 맞추기 — 언어는 URL 이 정한다. 앱에서 언어를 바꾸면 **다른 언어 URL 로 이동**하고, 열린 탭(미저장 포함)은
//     IndexedDB 에 보관했다가 새 페이지가 되살린다(platform/web/stash.ts). 편집·파일 열기·보기 전환은 절대 새로고침하지 않는다.
//   · 부팅 뒤 열기 — launchQueue(설치한 앱으로 .md 열기) · `?url=` · `#md=` 공유 링크 · 랜딩 견본(열린 문서가 없을 때).
//   · URL 로 열기 대화상자 · 공유 링크 만들기 · 실패 안내.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { readFile } from "@platform";
import { useAppStore } from "../store";
import { useWebSidebarCollapsed } from "./WebSidebar";
import { PromptModal, type PromptSpec } from "./PromptModal";
import { ConfirmDialog, type ConfirmSpec } from "./ConfirmDialog";
import { bootDone, impl, leave, restored, restoredDirty } from "../platform/web/bridge";
import { readPage, type PageInfo } from "../platform/web/page";
import { LANG_PREF_KEY, counterpartPath, isLang, type Lang } from "../platform/web/site/routes";
import { STASH_FLAG, buildStash, saveStash } from "../platform/web/stash";
import { RemoteError, fetchText, nameOfWebPath, normalizeSourceUrl, urlToWebPath } from "../platform/web/remote";
import { ShareError, decodeShare, encodeShare, isShareHash, sharePath } from "../platform/web/share";
import { sampleDoc } from "../platform/web/samples";

export interface WebActions {
  openUrl: () => void;
  share: () => void;
  /** 대화상자들 — AppShell 의 웹 사이드바 슬롯에서 렌더한다(모달은 위치와 무관하게 화면 위에 뜬다). */
  overlay: ReactNode;
}

interface ShareView {
  url: string;
  copied: boolean;
}

interface LaunchQueueLike {
  setConsumer(cb: (params: { files?: readonly unknown[] }) => void): void;
}

function currentPage(): PageInfo {
  return readPage(document.documentElement, import.meta.env.BASE_URL || "/");
}

function setLangPref(lang: Lang): void {
  try {
    localStorage.setItem(LANG_PREF_KEY, lang);
  } catch {
    /* 저장소 없음 — 루트가 브라우저 언어로 고른다 */
  }
}

export function useWebEdition(): [boolean, () => void, WebActions] {
  const [collapsed, toggle] = useWebSidebarCollapsed();
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const [prompt, setPrompt] = useState<PromptSpec | null>(null);
  const [alert, setAlert] = useState<ConfirmSpec | null>(null);
  const [shareView, setShareView] = useState<ShareView | null>(null);

  const fail = (message: string, title = tRef.current("web.urlFailTitle")) =>
    setAlert({ title, message, saveLabel: tRef.current("menu.ok"), onSave: () => {} });

  function remoteMessage(e: unknown): string {
    const tt = tRef.current;
    if (!(e instanceof RemoteError)) return tt("web.urlNetwork");
    switch (e.reason) {
      case "http":
        return tt("web.urlHttp", { status: e.status });
      case "too-large":
        return tt("web.urlTooLarge");
      case "html":
        return tt("web.urlHtml");
      case "timeout":
        return tt("web.urlTimeout");
      default:
        return tt("web.urlNetwork");
    }
  }

  /** 링크로 열기. updateAddress = 주소창에 `?url=` 을 남긴다(새로고침 없이 — 그 주소를 그대로 공유할 수 있게). */
  async function openFromUrl(input: string, updateAddress: boolean): Promise<boolean> {
    const n = normalizeSourceUrl(input);
    if (!n.ok) {
      fail(n.reason === "protocol" ? tRef.current("web.urlProtocol") : tRef.current("web.urlInvalid"));
      return false;
    }
    try {
      const text = await fetchText(n.url);
      const path = urlToWebPath(n.url);
      impl.put?.(path, nameOfWebPath(path), text);
      useAppStore.getState().openFile(path, text);
      if (updateAddress) {
        const u = new URL(location.href);
        u.searchParams.set("url", input.trim());
        u.hash = "";
        history.replaceState(history.state, "", u);
      }
      return true;
    } catch (e) {
      fail(remoteMessage(e));
      return false;
    }
  }

  async function openShare(hash: string): Promise<boolean> {
    try {
      const d = await decodeShare(hash);
      if (!d) return false;
      const path = sharePath(d);
      impl.put?.(path, d.name, d.text);
      useAppStore.getState().openFile(path, d.text);
      // 해시를 걷는다 — 남겨 두면 새로고침마다 같은 문서를 다시 덮어 연다(그 사이 고친 내용 위로).
      history.replaceState(history.state, "", location.pathname + location.search);
      return true;
    } catch (e) {
      fail(
        e instanceof ShareError && e.reason === "unsupported" ? tRef.current("web.shareUnsupported") : tRef.current("web.shareCorrupt"),
        tRef.current("web.shareTitle"),
      );
      return false;
    }
  }

  async function share(): Promise<void> {
    const s = useAppStore.getState();
    const tab = s.tabs.find((x) => x.path === s.activePath);
    if (!tab) return;
    const tt = tRef.current;
    const r = await encodeShare(tab.content, tab.title);
    if (!r.ok) {
      fail(
        r.reason === "too-long"
          ? tt("web.shareTooLong", { length: r.length.toLocaleString(), max: r.max.toLocaleString() })
          : tt("web.shareUnsupported"),
        tt("web.shareTitle"),
      );
      return;
    }
    const url = `${location.origin}${location.pathname}#${r.hash}`;
    let copied = false;
    try {
      // 권한 묻기가 끝나지 않는 환경(포커스 없는 창 등)에서 대화상자가 영영 안 뜨지 않게 1.5초에서 끊는다.
      copied = await Promise.race([
        navigator.clipboard.writeText(url).then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 1500)),
      ]);
    } catch {
      /* 권한 없음 — 대화상자에서 직접 복사 */
    }
    setShareView({ url, copied });
  }

  // 페이지 맞추기 + 언어 전환 = 다른 언어 URL 로 이동(보관 → 이동 → 되살림).
  useEffect(() => {
    const page = currentPage();
    const st = useAppStore.getState();
    if (st.language !== page.lang) st.setLanguage(page.lang); // 저장소가 막혀 영속 값을 못 맞췄을 때
    if (page.route.mode === "reader" && !st.readerMode) st.setReaderMode(true);
    if (page.route.mode === "split" && st.readerMode) st.setReaderMode(false);
    setLangPref(page.lang);

    let moving = false;
    async function switchTo(to: Lang) {
      if (import.meta.env.DEV) return; // 개발 서버에는 언어별 정적 페이지가 없다 — 앱 안 전환만
      if (moving) return;
      moving = true;
      const s = useAppStore.getState();
      try {
        if (s.tabs.length) {
          await saveStash(buildStash(s.tabs, s.activePath, (p) => impl.handleOf?.(p), Date.now()));
          sessionStorage.setItem(STASH_FLAG, "1");
        }
      } catch {
        if (s.tabs.some((x) => x.dirty)) {
          moving = false;
          useAppStore.getState().setLanguage(page.lang);
          fail(tRef.current("web.restoreFail"), tRef.current("cmd.language"));
          return;
        }
      }
      setLangPref(to);
      leave.now = true;
      location.assign(counterpartPath(location.pathname, to, page.base));
    }
    return useAppStore.subscribe((s, prev) => {
      if (s.language !== prev.language && s.language !== page.lang && isLang(s.language)) void switchTo(s.language);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 언어 전환으로 되살린 미저장 문서 — 탭이 생기면 미저장 표시를 다시 단다(세션 복원은 언제나 "저장됨"으로 연다).
  useEffect(() => {
    const mark = () => {
      const m = restoredDirty();
      if (!m.size) return;
      const s = useAppStore.getState();
      const hit = new Set(s.tabs.filter((x) => !x.dirty && m.get(x.path) === x.content).map((x) => x.path));
      if (!hit.size) return;
      hit.forEach((p) => m.delete(p));
      useAppStore.setState({ tabs: s.tabs.map((x) => (hit.has(x.path) ? { ...x, dirty: true } : x)) });
    };
    mark();
    return useAppStore.subscribe(mark);
  }, []);

  // 부팅 뒤 열기 — 세션 복원이 끝난 다음(bridge.bootDone)에 연다. 그래야 복원이 활성 탭을 덮지 않는다.
  useEffect(() => {
    let alive = true;
    const page = currentPage();
    void bootDone().then(async () => {
      if (!alive) return;
      // 설치한 앱으로 .md 열기(Chromium file_handlers) — 열린 창이 있으면 그 창이 받는다(launch_handler focus-existing).
      const lq = (window as unknown as { launchQueue?: LaunchQueueLike }).launchQueue;
      lq?.setConsumer(async (params) => {
        for (const h of params.files ?? []) {
          try {
            const p = await impl.registerHandle!(h);
            useAppStore.getState().openFile(p, await readFile(p));
          } catch {
            /* 권한 거절·읽기 실패 */
          }
        }
      });
      let opened = false;
      // 언어 전환으로 옮겨 온 탭 — 세션 복원이 못 연 것(다른 탭이 openPaths 를 덮어썼을 때)을 마저 열고 활성 탭을 되돌린다.
      if (restored.ready) await restored.ready;
      if (alive && restored.paths.length) {
        for (const p of restored.paths) {
          if (useAppStore.getState().tabs.some((x) => x.path === p)) continue;
          try {
            useAppStore.getState().openFile(p, await readFile(p));
          } catch {
            /* 사라짐 */
          }
        }
        const act = restored.active;
        if (act && useAppStore.getState().tabs.some((x) => x.path === act)) useAppStore.getState().setActive(act);
        restored.paths = [];
        opened = true;
      }
      const q = new URLSearchParams(location.search).get("url");
      if (q) opened = await openFromUrl(q, false);
      if (isShareHash(location.hash)) opened = (await openShare(location.hash)) || opened;
      if (!opened && alive && page.route.sample && useAppStore.getState().tabs.length === 0) {
        const s = sampleDoc(page.route.sample, page.lang);
        impl.put?.(s.path, s.name, s.text);
        useAppStore.getState().openFile(s.path, s.text);
      }
    });
    // 이미 열린 탭의 주소창에 다른 공유 링크를 붙여넣으면 해시만 바뀐다 — 새로고침 없이 연다.
    const onHash = () => {
      if (isShareHash(location.hash)) void openShare(location.hash);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      alive = false;
      window.removeEventListener("hashchange", onHash);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const overlay = (
    <>
      {prompt && <PromptModal spec={prompt} onClose={() => setPrompt(null)} />}
      {alert && <ConfirmDialog spec={alert} onClose={() => setAlert(null)} />}
      {shareView && (
        <div className="modal-backdrop" onMouseDown={() => setShareView(null)}>
          <div className="modal wsb-share" role="dialog" aria-label={t("web.shareTitle")} onMouseDown={(e) => e.stopPropagation()}>
            <p className="modal-title">{t("web.shareTitle")}</p>
            <p className="modal-msg">
              {t(shareView.copied ? "web.shareCopied" : "web.shareManual", { count: shareView.url.length.toLocaleString() })}
            </p>
            <input
              className="modal-input"
              readOnly
              value={shareView.url}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => e.key === "Escape" && setShareView(null)}
              autoFocus
            />
            <div className="modal-actions">
              <button type="button" className="modal-btn" onClick={() => void navigator.clipboard?.writeText(shareView.url).catch(() => {})}>
                {t("web.share")}
              </button>
              <button type="button" className="modal-btn primary" onClick={() => setShareView(null)}>
                {t("menu.ok")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return [
    collapsed,
    toggle,
    {
      openUrl: () => setPrompt({ title: t("web.openUrlTitle"), okLabel: t("web.openUrlOk"), onOk: (v) => void openFromUrl(v, true) }),
      share: () => void share(),
      overlay,
    },
  ];
}
