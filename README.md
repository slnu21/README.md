# README.md

**에이전트가 쓴 문서를, 사람이 읽는 자리.** — 경량 마크다운 **리더 & 에디터**. Windows 데스크톱, Microsoft Store 배포, 100% 오프라인.
**Where people read what agents write.** — a lightweight Markdown **reader & editor** for Windows, on the Microsoft Store, fully offline.

> 제품명 = **README.md** (마크다운의 원형 파일 이름을 그대로 · "read me"). 저장소 디렉터리는 `md-reader` 유지.

[한국어](#한국어) · [English](#english) · [개발 / Development](#개발--development)

---

## 한국어

### 무엇을 하나
- **워크스페이스** — 폴더를 가져오고 가상 폴더로 다시 묶는다. 파일은 그대로, 배치는 내 마음대로.
- **읽기** — 실시간 미리보기 · 리딩 모드(좌우 두 문서) · 프레젠테이션 · 수식(KaTeX) · 다이어그램(mermaid) · 코드 하이라이트 · 테마 · 글 방향(RTL).
- **에이전트와 한 짝** — 에이전트가 워크스페이스를 검색·읽게 하고(에이전트 브리지), 만지고 간 문서를 알아채고(받은 문서함), 덮어쓴 것을 되돌린다(문서 기록).
- **오프라인** — 앱은 외부로 아무것도 보내지 않는다. [개인정보 처리방침](docs/legal/privacy.md)

### 설치
[Microsoft Store](https://apps.microsoft.com/detail/9N9QMXQPND3H) 에서 받거나(검색어 **README.md**), [GitHub 릴리스](https://github.com/slnu21/README.md/releases)에서 설치 파일을 받는다.

### AI 에이전트 연결 (선택)
Claude Code 같은 MCP 지원 에이전트가 **이 앱의 워크스페이스를 검색하고 읽게** 할 수 있다. 따로 설치할 것은 없다 — 앱 자신이 서버를 겸한다.

**Claude Code** — 터미널에서 한 번:
```powershell
claude mcp add --scope user readme-md -- readme-md mcp
```
`claude mcp list` 에 `readme-md: readme-md mcp - ✔ Connected` 가 보이면 끝. 새 세션부터 도구가 보인다.

**Claude Desktop 등 설정 파일을 쓰는 에이전트** — `mcpServers` 에 한 항목:
```json
{ "mcpServers": { "readme-md": { "command": "readme-md", "args": ["mcp"] } } }
```

- `readme-md` 는 Store 설치본이 등록하는 **짧은 실행 이름**(앱 실행 별칭)이다. GitHub 설치본처럼 별칭이 없으면 실행 파일 전체 경로를 쓴다.
- **앱의 설정 > [에이전트 연결]** 이 지금 설치에 맞는 명령·JSON 을 그대로 복사해 주고, 마지막 연결 시각도 보여 준다.
- 에이전트가 할 수 있는 것: 검색(`search_docs`) · 목차(`outline`) · 절 단위 읽기(`read_section`) · 워크스페이스 배치 보기(`list_workspace`).
  **문서를 고치거나 지우는 도구는 없다**(에이전트는 이미 파일로 그렇게 할 수 있다).
- **볼 수 있는 범위는 워크스페이스에 넣은 폴더·파일뿐**이다. 문서를 워크스페이스에 배치하거나 앱 창에 여는 제어 도구는 **기본으로 꺼져 있고** 설정에서 켤 때만 동작한다.
- 연결은 같은 PC 안의 표준 입출력(stdio)뿐이고 앱은 네트워크 포트를 열지 않는다. 다만 **연결한 에이전트가 읽어 간 내용은 그 에이전트가 처리한다**(많은 에이전트가 온라인 서비스로 보낸다) — [방침 4절](docs/legal/privacy.md).
- **업데이트할 때**: 에이전트가 연결돼 있는 동안 Windows 는 앱이 실행 중인 것으로 본다. 업데이트가 안 받아지거나 미뤄지면 앱과 에이전트 세션을 닫았다가 다시 연다. 업데이트 뒤 에이전트가 끊겼으면 다시 연결한다(Claude Code 는 `/mcp`).
- 끊기: `claude mcp remove --scope user readme-md` (또는 설정 파일에서 항목 삭제).

도구 계약 상세: [docs/design/features/agent-bridge.md](docs/design/features/agent-bridge.md)

---

## English

### What it does
- **Workspace** — import folders and regroup them with virtual folders. Files stay where they are; the layout is yours.
- **Reading** — live preview · reading mode (two documents side by side) · presentation · math (KaTeX) · diagrams (mermaid) · code highlighting · themes · text direction (RTL).
- **Made to pair with agents** — let an agent search and read your workspace (agent bridge), notice which documents it touched (Inbox), and roll back what it overwrote (Document history).
- **Offline** — the App sends nothing off your device. [Privacy Policy](docs/legal/privacy.md)

### Install
Get it from the [Microsoft Store](https://apps.microsoft.com/detail/9N9QMXQPND3H) (search for **README.md**), or download an installer from [GitHub Releases](https://github.com/slnu21/README.md/releases).

### Connecting an AI agent (optional)
An MCP-capable agent such as Claude Code can **search and read this App's workspace**. Nothing extra to install — the App itself is the server.

**Claude Code** — once, in a terminal:
```powershell
claude mcp add --scope user readme-md -- readme-md mcp
```
When `claude mcp list` shows `readme-md: readme-md mcp - ✔ Connected`, you're done. The tools appear from the next session.

**Claude Desktop and other agents with a config file** — one entry under `mcpServers`:
```json
{ "mcpServers": { "readme-md": { "command": "readme-md", "args": ["mcp"] } } }
```

- `readme-md` is the **short command name** (app execution alias) registered by the Store install. Installs without the alias, such as the GitHub installer, use the full path to the executable instead.
- **Settings > [Agent bridge]** in the App copies the exact command and JSON for your install, and shows when an agent last connected.
- What an agent can do: search (`search_docs`) · table of contents (`outline`) · read one section (`read_section`) · see the workspace layout (`list_workspace`).
  **There are no tools to edit or delete documents** (an agent can already do that through files).
- **It can only see folders and files you put in your workspace.** Control tools that place a document in the workspace or open it in the App window are **off by default** and work only after you enable them in Settings.
- The connection is standard input/output (stdio) on the same PC; the App opens no network port. However, **what a connected agent reads is handled by that agent** (many send it to their online service) — see [Privacy Policy, section 4](docs/legal/privacy.md).
- **When updating**: while an agent is connected, Windows treats the App as running. If an update won't install or is postponed, close the App and your agent sessions, then reopen them. If the agent is disconnected after an update, reconnect it (`/mcp` in Claude Code).
- To disconnect: `claude mcp remove --scope user readme-md` (or delete the entry from the config file).

Tool contract: [docs/design/features/agent-bridge.md](docs/design/features/agent-bridge.md)

---

## 개발 / Development

### 폴더 구조
```
md-reader/
├─ docs/      # 설계·배포·법무 문서, html 시안, 변경로그 (→ docs/README.md)
├─ src/       # 앱 소스코드 (Tauri v2 + React + TypeScript)
│  ├─ app/        # 웹 프론트엔드 (UI)
│  └─ src-tauri/  # Rust 네이티브 셸 (에이전트 브리지 = 같은 exe 의 `mcp` 모드)
├─ release/   # 버전별 배포 산출물 (→ release/README.md)
├─ THIRD-PARTY-NOTICES.md  # 의존성 라이선스 고지 (생성됨: npm + cargo + 번들 폰트 OFL 전문)
└─ README.md
```

### 기술 스택
Tauri v2 · React · TypeScript · Vite · CodeMirror 6 · markdown-it · SQLite(FTS5). 자세한 내용: [docs/design/architecture.md](docs/design/architecture.md).

### 개발 시작
```bash
# 1) Rust 설치 (최초 1회) — https://www.rust-lang.org/tools/install
# 2) 프론트엔드 의존성
cd src
npm install
# 3) 개발 실행 (데스크톱 창)
npm run tauri dev
```
> Rust 설치 완료 → `tauri dev/build` 동작. 프론트 타입체크는 Rust 없이도 `npx tsc --noEmit`로 가능.

자세한 안내: [docs/notes/development.md](docs/notes/development.md).

## 라이선스 / License
- 앱 사용 조건 / Terms: [docs/legal/EULA.md](docs/legal/EULA.md) (상업적 사용 허용 / commercial use allowed).
- 의존성: 전부 permissive(MIT/Apache/BSD 등) — [ADR 0001](docs/design/decisions/0001-tech-stack-and-packaging.md).
- 서드파티 고지 / Third-party notices: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) (자동 생성, 단독 GPL/AGPL/LGPL/SSPL 없음).
