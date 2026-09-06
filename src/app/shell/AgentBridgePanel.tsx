// 설정 > 에이전트 연결. 브리지는 눈에 안 보이는 기능이라 **여기가 유일한 입구**다 —
// 연결 방법을 그대로 복사해 주고, 원격 제어를 사용자가 보고 끌 수 있게 한다(ADR 0002).
//
// 제어 토글은 zustand(localStorage)가 아니라 **SQLite `settings` 테이블**에 넣는다.
// MCP 서버는 별도 프로세스라 localStorage 를 못 읽는다 — 진실원이 DB 여야 토글이 실제로 먹는다.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { agentInfo, settingsGetAll, settingsSet, type AgentInfo } from "../lib/tauri";
import { useAppStore } from "../store";

const CONTROL_KEY = "agentControlEnabled";
const LAST_KEY = "agentLastConnectedAt";

/** 별칭이 깔려 있으면 그 이름, 아니면 실행 파일 절대 경로. */
export function bridgeCommand(info: AgentInfo): string {
  return info.aliasPath ? info.aliasName : info.exePath;
}

/** MCP 클라이언트 설정 조각. 경로에 공백이 흔해 JSON 이 안전한 형식이다. */
export function bridgeJson(info: AgentInfo): string {
  return JSON.stringify(
    { mcpServers: { "readme-md": { command: bridgeCommand(info), args: ["mcp"] } } },
    null,
    2,
  );
}

/** `claude mcp add` 한 줄. 경로에 공백이 있을 수 있으므로 따옴표로 감싼다. */
export function bridgeCliCommand(info: AgentInfo): string {
  return `claude mcp add --scope user readme-md -- "${bridgeCommand(info)}" mcp`;
}

export function AgentBridgePanel() {
  const { t, i18n } = useTranslation();
  const showNotice = useAppStore((s) => s.showNotice);
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [control, setControl] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void agentInfo()
      .then((i) => alive && setInfo(i))
      .catch(() => {});
    void settingsGetAll()
      .then((rows) => {
        if (!alive) return;
        const map = new Map(rows);
        setControl(map.get(CONTROL_KEY) === "1");
        const raw = map.get(LAST_KEY);
        setLastAt(raw ? Number(raw) : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function toggleControl(next: boolean) {
    setControl(next); // 낙관적 — 실패하면 아래에서 되돌린다
    void settingsSet(CONTROL_KEY, next ? "1" : "0").catch(() => {
      setControl(!next);
      showNotice(t("agent.saveFailed"), "error");
    });
  }

  function copy(text: string) {
    void navigator.clipboard
      .writeText(text)
      .then(() => showNotice(t("agent.copied")))
      .catch(() => showNotice(t("agent.copyFailed"), "error"));
  }

  const status = !info
    ? t("agent.statusUnknown")
    : lastAt
      ? t("agent.statusConnected", {
          when: new Date(lastAt).toLocaleString(i18n.language === "ko" ? "ko-KR" : "en-US"),
        })
      : t("agent.statusNever");

  return (
    <>
      <div className="set-row agent-head">
        <span>{t("agent.title")}</span>
      </div>
      <p className="agent-note">{t("agent.what")}</p>
      <p className="agent-note">{status}</p>

      <button
        type="button"
        className="set-reset"
        disabled={!info}
        title={info ? bridgeCliCommand(info) : undefined}
        onClick={() => info && copy(bridgeCliCommand(info))}
      >
        {t("agent.copyCommand")}
      </button>
      <button
        type="button"
        className="set-reset"
        disabled={!info}
        title={info ? bridgeJson(info) : undefined}
        onClick={() => info && copy(bridgeJson(info))}
      >
        {t("agent.copyJson")}
      </button>

      {/* 별칭이 없으면 절대 경로로 안내한다. Store 설치본에서 별칭이 사라지는 경우가 실제로 있다 —
          사용자가 설정 > 앱 > 고급 앱 설정 > 앱 실행 별칭에서 꺼 둘 수 있다. */}
      {info && !info.aliasPath && <p className="agent-note dim">{t("agent.noAlias")}</p>}

      <label className="set-row toggle">
        <span>{t("agent.control")}</span>
        <input type="checkbox" checked={control} onChange={(e) => toggleControl(e.target.checked)} />
      </label>
      <p className="agent-note dim">{t("agent.controlNote")}</p>
    </>
  );
}
