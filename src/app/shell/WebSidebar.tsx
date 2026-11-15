// 웹 에디션 사이드바 — 데스크톱의 탐색기(워크스페이스 트리) 자리. 위에서부터
//   목차(미리보기 TOC — 오버레이 아웃라인과 같은 데이터·같은 이동) · 최근 파일 + 짧은 사용법 ·
//   **고정 크기 안내 자리(300×250)** · 데스크톱 앱 링크.
// 안내 자리는 나중에 광고가 들어갈 자리다. 지금은 광고 코드를 넣지 않고 데스크톱 앱 소개·단축키로 채운다 —
// 크기를 CSS 로 **예약**해 두므로 내용이 바뀌어도(광고가 늦게 떠도) 레이아웃이 밀리지 않는다.
// 접으면 이 사이드바가 통째로 사라진다(안내 자리 포함). 좁은 폭(≤900px)에서는 CSS 가 숨긴다.
//
// 클래스는 `wsb-` 접두어 — mermaid 가 쓰는 이름(.node·.label·.cluster…)과 겹치면 측정 스테이지가 오염된다(App.css).
import { useTranslation } from "react-i18next";
import type { TocItem } from "../lib/markdown";
import { STORE_URL } from "@platform";
import { Icon } from "./Icon";

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
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
    </aside>
  );
}
