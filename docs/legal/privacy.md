# 개인정보 처리방침 / Privacy Policy

- **제품 / Product:** README.md (Windows 데스크톱 앱)
- **시행일 / Effective date:** 2026-10-11 (개정 / revised — 최초 / first published 2026-07-02)
- **게시자 / Publisher:** `SlnU`
- **문의 / Contact:** `raltlsdn@naver.com`

> Microsoft Store 등록에는 접근 가능한 개인정보 처리방침이 필요합니다. 공개 URL(예: GitHub)로 게시하면 됩니다.

---

## 한국어

**README.md**(이하 "본 앱")는 **100% 오프라인**으로 동작하는 마크다운 리더·에디터입니다. 본 앱은 사용자의 개인정보를 **수집하지 않으며, 어떤 데이터도 외부로 전송하지 않습니다.**

### 1. 수집하는 정보
본 앱은 어떠한 개인정보도 수집하지 않습니다. 계정 생성이나 로그인이 없으며, 이름·이메일·전화번호·위치 등 개인 식별 정보를 요구하거나 수집하지 않습니다.

### 2. 데이터 저장 (로컬 전용)
사용자가 열거나 편집하는 문서는 **사용자 기기에만** 있으며, 본 앱은 이를 외부로 보내지 않습니다. 본 앱이 기기에 따로 저장하는 것은 아래가 전부이고, 모두 사용자 기기 안의 앱 데이터 폴더에만 있습니다.

- **설정과 편의 정보** — 테마·언어·글꼴 등 설정, 최근 연 파일, 즐겨찾기, 열어 둔 탭(WebView 로컬 저장소와 로컬 SQLite 데이터베이스).
- **워크스페이스 배치** — 사용자가 가져온 폴더와 직접 만든 가상 폴더의 구성.
- **검색 색인** — 워크스페이스에 가져온 폴더 안 문서의 **본문 사본**. 전역 검색을 위해 로컬 SQLite 에 둡니다.
- **문서 기록** — 문서가 바뀌거나 지워지기 직전의 **본문 사본**(되돌리기용). 문서마다·전체 개수에 상한이 있고 오래된 것부터 지워집니다.
- **표시·메모** — 리딩 화면에서 단 형광펜·밑줄·점 표시와 메모. 표시를 단 순간의 **본문 사본** 한 벌을 함께 두며(표시의 자리를 기억하는 바탕), 표시가 남아 있는 동안 그 사본은 위의 상한으로 지워지지 않습니다. 원본 문서 파일은 바꾸지 않습니다.
- **받은 문서함** — 각 문서를 사용자가 마지막으로 본 시점(파일 수정 시각).
- **에이전트 연결 기록** — 아래 4절의 연결을 마지막으로 쓴 시각, 제어 도구를 켰는지 여부.
- **사용자 테마 파일** — 사용자가 만들거나 넣은 테마·스타일 파일.

이 데이터는 사용자 기기를 벗어나지 않습니다. Microsoft Store 설치본을 제거하면 대개 함께 지워지지만, 설치 방식에 따라 `%APPDATA%\com.readme.app` 과 `%LOCALAPPDATA%\com.readme.app` 폴더가 남을 수 있으며, 이 폴더를 지우면 위 데이터가 모두 삭제됩니다.

### 3. 네트워크 통신
본 앱은 외부 서버와 통신하지 않습니다. 업데이트 확인·오류 보고·사용 통계를 보내지 않으며, 콘텐츠 보안 정책(CSP)으로 원격 리소스의 로드·전송을 차단합니다. 문서 안의 웹 링크를 사용자가 누르면 그 주소를 **기본 웹 브라우저**에 넘겨 열 뿐이며, 그 이후의 통신은 브라우저가 합니다. (앱의 설치·업데이트는 Microsoft Store를 통해 Microsoft가 처리하며, 이는 본 방침의 적용 범위 밖입니다.)

### 4. AI 에이전트 연결 (선택)
본 앱에는 사용자가 원할 때 Claude Code 같은 **AI 에이전트 프로그램을 직접 연결**하는 기능(에이전트 브리지, MCP)이 있습니다.

- **연결하지 않으면 아무것도 동작하지 않습니다.** 이 기능은 사용자가 자신의 에이전트 프로그램에 연결 명령을 직접 등록했을 때만, 그 프로그램이 실행합니다.
- **본 앱은 네트워크를 쓰지 않습니다.** 연결은 같은 기기 안의 두 프로그램 사이 표준 입출력(stdio)으로만 이루어지며, 네트워크 포트를 열지 않습니다.
- **에이전트가 읽는 범위** — 사용자가 워크스페이스에 넣은 폴더·파일 안의 문서만 검색하고 읽을 수 있습니다. 그 문서에 사용자가 단 **표시·메모**도 읽을 수 있습니다(에이전트에게 검토를 맡기는 용도). 문서를 고치거나 지우는 기능은 제공하지 않습니다. 문서를 워크스페이스에 배치하거나 앱에서 여는 제어 기능은 **기본으로 꺼져 있으며**, 설정에서 사용자가 켤 때만 동작합니다.
- **에이전트가 받은 내용의 처리** — 연결된 에이전트가 읽어 간 문서 내용은 **그 에이전트 프로그램이 처리**합니다. 많은 AI 에이전트는 받은 내용을 자신의 온라인 서비스로 보냅니다. 그 처리는 본 앱이 아니라 **해당 에이전트 제공자의 개인정보 처리방침**을 따르므로, 연결 전에 확인하시기 바랍니다.
- 연결은 언제든 에이전트 프로그램의 설정에서 등록을 지우면 끊깁니다.

### 5. 제3자 구성요소
- 본 앱은 화면 표시를 위해 Windows의 **Microsoft Edge WebView2 런타임**을 사용합니다. WebView2 자체의 데이터 처리는 Microsoft의 정책을 따릅니다. 본 앱은 WebView2를 통해 사용자 데이터를 외부로 전송하지 않습니다.
- **분석(analytics)·광고·추적 SDK를 일절 포함하지 않습니다.**
- 포함된 오픈소스 구성요소의 라이선스 고지는 [THIRD-PARTY-NOTICES](../../THIRD-PARTY-NOTICES.md)를 따릅니다.

### 6. 아동의 개인정보
본 앱은 개인정보를 수집하지 않으므로, 아동을 포함한 어떤 사용자로부터도 개인정보를 수집하지 않습니다.

### 7. 방침의 변경
본 앱이 외부와 통신하는 기능(예: 클라우드 동기화)을 도입하게 되면, 본 방침을 사전에 갱신하고 앱 내 또는 스토어 페이지에서 고지합니다. 변경 내역은 이 문서의 공개 저장소 기록으로 확인할 수 있습니다.

### 8. 문의
개인정보 관련 문의는 `raltlsdn@naver.com` 로 연락 주시기 바랍니다.

---

## English

**README.md** (the "App") is a fully **offline** Markdown reader and editor. The App does **not collect personal information and does not transmit any data** off your device.

### 1. Information We Collect
The App collects no personal information. There is no account or sign-in, and the App does not request or gather identifying data such as name, email, phone number, or location.

### 2. Data Storage (Local Only)
The documents you open or edit stay **on your device**; the App does not send them anywhere. The only things the App stores separately are listed below, all inside the App's data folders on your device.

- **Settings and convenience data** — theme, language, font and other settings, recent files, favorites, open tabs (WebView local storage and a local SQLite database).
- **Workspace layout** — the folders you imported and the virtual folders you arranged.
- **Search index** — a **copy of the text** of documents inside folders you imported into the workspace, kept in local SQLite for full-text search.
- **Document history** — a **copy of a document's text** taken just before it changes or is deleted, so you can roll back. It is capped per document and in total; the oldest copies are removed first.
- **Marks and notes** — highlights, underlines, margin marks and notes you add while reading. A **copy of the document's text** at the moment you marked it is kept with them (it is what the marks are anchored to) and is not removed by the caps above while marks still use it. The original document file is never changed.
- **Inbox** — when you last viewed each document (the file's modification time).
- **Agent connection record** — when the connection in section 4 was last used, and whether control tools are enabled.
- **Your theme files** — theme and style files you create or add.

This data never leaves your device. Uninstalling the Microsoft Store version usually removes it; depending on how the App was installed, the folders `%APPDATA%\com.readme.app` and `%LOCALAPPDATA%\com.readme.app` may remain — deleting them removes all of the above.

### 3. Network Communication
The App does not communicate with external servers. It sends no update checks, crash reports or usage statistics, and a Content Security Policy (CSP) blocks loading or sending remote resources. When you click a web link inside a document, the App only hands that address to your **default web browser**; any communication after that is done by the browser. (Installation and updates are handled by Microsoft via the Microsoft Store and fall outside this policy.)

### 4. Connecting an AI Agent (Optional)
The App lets you **connect an AI agent program** such as Claude Code yourself, if you choose to (the agent bridge, MCP).

- **Nothing runs unless you connect it.** The feature only runs when you register the connection command in your own agent program, and that program starts it.
- **The App uses no network.** The connection is standard input/output (stdio) between two programs on the same device; no network port is opened.
- **What the agent can read** — only documents inside the folders and files you put in your workspace, including the **marks and notes** you left on them (so you can hand a review to your agent). The App provides no way to edit or delete documents. Control tools that place a document in the workspace or open it in the App are **off by default** and work only after you enable them in Settings.
- **How the agent handles what it reads** — document content read by a connected agent is **processed by that agent program**. Many AI agents send what they receive to their own online service. That processing is governed by **the agent provider's privacy policy**, not by the App — please review it before connecting.
- You can disconnect at any time by removing the registration from your agent program's settings.

### 5. Third-Party Components
- The App uses the **Microsoft Edge WebView2 runtime** on Windows to render its UI. WebView2's own data handling is governed by Microsoft's policies. The App does not send user data through WebView2 to any external party.
- The App contains **no analytics, advertising, or tracking SDKs.**
- License notices for bundled open-source components are provided in [THIRD-PARTY-NOTICES](../../THIRD-PARTY-NOTICES.md).

### 6. Children's Privacy
Because the App collects no personal information, it collects none from children or any other users.

### 7. Changes to This Policy
If the App ever introduces a feature that communicates externally (e.g., cloud sync), this policy will be updated in advance and disclosed in the App or on the store page. The history of changes is visible in this document's public repository.

### 8. Contact
For privacy inquiries, please contact `raltlsdn@naver.com`.
