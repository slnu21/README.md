// 웹 에디션 사이드바 — 데스크톱의 탐색기(워크스페이스 트리) 자리. 위에서부터
//   목차(미리보기 TOC — 오버레이 아웃라인과 같은 데이터·같은 이동) · 최근 파일 + 짧은 사용법 ·
//   **고정 크기 안내 자리(300×250)** · 데스크톱 앱 링크.
// 안내 자리는 나중에 광고가 들어갈 자리다. 지금은 광고 코드를 넣지 않고 데스크톱 앱 소개·단축키로 채운다 —
// 크기를 CSS 로 **예약**해 두므로 내용이 바뀌어도(광고가 늦게 떠도) 레이아웃이 밀리지 않는다.
// 접으면 이 사이드바가 통째로 사라진다(안내 자리 포함). 좁은 폭(≤900px)에서는 CSS 가 숨긴다.
//
// 클래스는 `wsb-` 접두어 — mermaid 가 쓰는 이름(.node·.label·.cluster…)과 겹치면 측정 스테이지가 오염된다(App.css).
//
// **웹 전용 모듈이다.** AppShell 은 `__WEB__` 뒤에서만 이 파일의 것을 쓰므로 데스크톱 번들에서는 import 째 빠진다 —
// 그러려면 이 파일에 모듈 최상위 부작용(전역 등록·CSS import 등)이 없어야 한다. 스타일·문구는 platform/web/ui.ts.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TocItem } from "../lib/markdown";
import { STORE_URL } from "@platform";
import { Icon } from "./Icon";

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

const COLLAPSED_KEY = "readme-md.web.sidebarCollapsed";
/** 브랜드 허브(같은 브랜드의 다른 도구 — timer.ondolworks.com 등). */
const BRAND_URL = "https://ondolworks.com";

/** 사이드바 접힘 — 브라우저마다 기억(localStorage, 던지면 이번 세션만). 앱 스토어(데스크톱과 공유)에는 두지 않는다. */
export function useWebSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        /* 저장 못 해도 화면은 바뀐다 */
      }
      return !c;
    });
  return [collapsed, toggle];
}

/** 타이틀바의 접기·펴기 버튼. */
export function WebSidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={"tbtn wsb-toggle" + (collapsed ? "" : " on")}
      aria-pressed={!collapsed}
      aria-label={t("web.sidebarToggle")}
      title={t("web.sidebarToggle")}
      onClick={onToggle}
    >
      <Icon name="list" />
    </button>
  );
}

/** 웹에 없는 기능 자리의 안내 — "데스크톱 앱에서" + Store 링크(ConfirmDialog 사양). */
export function desktopOnlySpec(t: (k: string) => string, message: string) {
  return {
    title: t("web.desktopOnlyTitle"),
    message,
    saveLabel: t("web.openStore"),
    onSave: () => void window.open(STORE_URL, "_blank", "noopener,noreferrer"),
  };
}

/** 빈 화면의 데스크톱 앱 링크(좁은 폭에서는 사이드바가 숨으므로). */
export function WebEmptyAppLink() {
  const { t } = useTranslation();
  return (
    <>
      <a className="empty-app-link" href={STORE_URL} target="_blank" rel="noopener noreferrer">
        {t("web.getApp")}
      </a>
      <a className="empty-brand" href={BRAND_URL} target="_blank" rel="noopener" title={t("web.brandTitle")}>
        {t("web.brand")}
      </a>
    </>
  );
}

/** 설정 창의 에이전트 연결 자리 — 데스크톱 기능 한 줄 안내. */
export function WebDesktopNote() {
  const { t } = useTranslation();
  return (
    <p className="set-desktop-note">
      {t("web.desktopFeatures")}{" "}
      <a href={STORE_URL} target="_blank" rel="noopener noreferrer">
        {t("web.openStore")}
      </a>
    </p>
  );
}

export function WebSidebar({
  outline,
  onSelectHeading,
  recent,
  activePath,
  onOpenRecent,
}: {
  outline: TocItem[];
  onSelectHeading: (id: string) => void;
  recent: string[];
  activePath: string | null;
  onOpenRecent: (path: string) => void;
}) {
  const { t } = useTranslation();
  const min = outline.length ? Math.min(...outline.map((it) => it.level)) : 1;

  return (
    <aside className="sidebar wsb" aria-label={t("web.toc")}>
      <section className="wsb-sec wsb-toc" aria-label={t("web.toc")}>
        <h3 className="wsb-h">{t("web.toc")}</h3>
        {outline.length ? (
          <ul className="wsb-list">
            {outline.map((it, i) => (
              <li key={`${it.id}-${i}`}>
                <button
                  type="button"
                  className="wsb-item"
                  style={{ paddingLeft: `${8 + (it.level - min) * 12}px` }}
                  title={it.text}
                  onClick={() => onSelectHeading(it.id)}
                >
                  {it.text}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="wsb-hint">{t("web.tocEmpty")}</p>
        )}
      </section>

      <section className="wsb-sec wsb-recent" aria-label={t("web.recent")}>
        <h3 className="wsb-h">{t("web.recent")}</h3>
        {recent.length ? (
          <ul className="wsb-list">
            {recent.slice(0, 8).map((p) => (
              <li key={p}>
                <button
                  type="button"
                  className={"wsb-item" + (p === activePath ? " active" : "")}
                  title={baseName(p)}
                  onClick={() => onOpenRecent(p)}
                >
                  <Icon name="clock" />
                  <span>{baseName(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="wsb-hint">{t("web.recentEmpty")}</p>
        )}
        <h3 className="wsb-h">{t("web.howTitle")}</h3>
        <ul className="wsb-how">
          <li>{t("web.how1")}</li>
          <li>{t("web.how2")}</li>
          <li>{t("web.how3")}</li>
        </ul>
      </section>

      {/* 고정 크기 자리(300×250) — 지금은 데스크톱 앱 소개. 광고 코드는 W2 이후, 이 상자 안에서만. */}
      <div className="wsb-slot" role="complementary" aria-label={t("web.slotLabel")}>
        <p className="wsb-slot-title">{t("web.promoTitle")}</p>
        <p className="wsb-slot-lead">{t("web.promoLead")}</p>
        <ul className="wsb-slot-list">
          <li>{t("web.promo1")}</li>
          <li>{t("web.promo2")}</li>
          <li>{t("web.promo3")}</li>
        </ul>
        <p className="wsb-slot-sub">{t("web.keysTitle")}</p>
        <dl className="wsb-keys">
          <dt>
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>
          </dt>
          <dd>{t("web.keyPalette")}</dd>
          <dt>
            <kbd>F1</kbd>
          </dt>
          <dd>{t("web.keyHelp")}</dd>
          <dt>
            <kbd>Ctrl</kbd>+<kbd>S</kbd>
          </dt>
          <dd>{t("web.keySave")}</dd>
        </dl>
      </div>

      <a className="wsb-app" href={STORE_URL} target="_blank" rel="noopener noreferrer">
        <Icon name="md" />
        <span>{t("web.getApp")}</span>
      </a>
      <a className="wsb-brand" href={BRAND_URL} target="_blank" rel="noopener" title={t("web.brandTitle")}>
        {t("web.brand")}
      </a>
    </aside>
  );
}
