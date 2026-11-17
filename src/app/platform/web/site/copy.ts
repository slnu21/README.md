// 웹 에디션 정적 페이지 문구(ko/en) — 빌드 때만 쓴다(vite.config.ts 의 페이지 생성기). 앱 번들에는 안 들어간다.
// 페이지마다 다른 것: title · h1 · description · 첫 단락(lead). 나머지 설명 절은 공통이다.
// 설명은 앱 아래에 **보이는 본문**으로 나간다(첫 화면 = 앱, 스크롤하면 설명 — 사용자 결정 2026-11-15).
import type { Lang, RouteId } from "./routes";

export interface RouteCopy {
  title: string;
  h1: string;
  description: string;
  /** 이 페이지 고유의 소개 — 첫 단락이 곧 도움말 첫 단락. */
  lead: string[];
  /** 다른 페이지에서 이 페이지를 가리키는 링크 이름. */
  nav: string;
}

export interface SyntaxItem {
  name: string;
  desc: string;
  code: string;
}

export interface LangCopy {
  langName: string;
  ogLocale: string;
  hint: string;
  routes: Record<RouteId, RouteCopy>;
  howTitle: string;
  how: string[];
  syntaxTitle: string;
  syntaxLead: string;
  syntax: SyntaxItem[];
  shareTitle: string;
  share: string[];
  privacyTitle: string;
  privacy: string[];
  desktopTitle: string;
  desktop: string[];
  desktopCta: string;
  pagesTitle: string;
  langTitle: string;
  footer: string;
  rootTitle: string;
  rootLead: string;
  notFoundTitle: string;
  notFoundLead: string;
}

export const SITE_NAME = "README.md";
export const BRAND_NAME = "Ondol Works";
export const BRAND_URL = "https://ondolworks.com";
export const AUTHOR = "slnu21 (SlnU)";

const MERMAID_CODE = "```mermaid\nflowchart LR\n  A[Write] --> B[Preview] --> C[Share]\n```";

export const COPY: Record<Lang, LangCopy> = {
  en: {
    langName: "English",
    ogLocale: "en_US",
    hint: "About this tool ↓",
    routes: {
      app: {
        title: "Markdown Editor & Viewer Online — Free, No Upload | README.md",
        h1: "Markdown editor and viewer in your browser",
        description:
          "Open, read and edit Markdown files right in your browser — live preview with Mermaid diagrams, math and code highlighting. Nothing is uploaded, and it works offline.",
        lead: [
          "Drop a .md file onto the page or press Open file. The editor sits on the left and the rendered preview on the right, scrolling together. In Chrome and Edge, Ctrl+S writes back to the same file; other browsers download a copy.",
          "It is the free web edition of README.md, a Markdown reader for Windows: one file at a time, nothing to install, no account.",
        ],
        nav: "Markdown editor",
      },
      "markdown-viewer": {
        title: "Markdown Viewer Online — Open .md Files Instantly | README.md",
        h1: "Open and read .md files online",
        description:
          "A clean reading view for Markdown: open a .md file or a link and read it with a table of contents, diagrams and math. Free, no sign-up, files stay on your device.",
        lead: [
          "This page opens in reading mode — the editor steps aside so the document gets the full width, with its headings listed in the sidebar. Drag a file in, press Open file, or add ?url= followed by a link to a raw Markdown file.",
          "Need to fix a typo? Turn reading mode off from the toolbar and the editor comes back next to the preview; nothing reloads.",
        ],
        nav: "Markdown viewer",
      },
      "mermaid-preview": {
        title: "Mermaid Live Preview — Diagrams Inside Markdown | README.md",
        h1: "Preview Mermaid diagrams as you type",
        description:
          "Write Mermaid flowcharts, sequence and class diagrams inside Markdown and watch them render next to your text. Runs in your browser, no account, works offline.",
        lead: [
          "A sample with a flowchart and a sequence diagram is open in the editor. Change a ```mermaid block and the diagram on the right redraws a moment after you stop typing — errors show up in place instead of blanking the page.",
          "Diagrams sit in the same document as your prose, so you can export the whole page to HTML or PDF, or share it as a link.",
        ],
        nav: "Mermaid preview",
      },
      "readme-preview": {
        title: "README Preview — Check README.md Before You Push | README.md",
        h1: "Preview a README.md before you push",
        description:
          "See how your README.md renders — headings, tables, task lists, code and Mermaid — or open one straight from a GitHub link. Free and private: nothing is uploaded.",
        lead: [
          "Paste your README into the editor, drop the file, or open it from a link: a github.com/…/blob/… address is turned into its raw form automatically, and relative images load from the same repository.",
          "Tables, task lists, footnotes, code blocks and diagrams render the way readers will see them, so you can fix the layout before the commit.",
        ],
        nav: "README preview",
      },
    },
    howTitle: "How to use",
    how: [
      "Open: press Open file, drag a .md file onto the window, or open a link (see below). Several files open as tabs.",
      "Edit: type on the left; the preview follows your cursor. Ctrl+Shift+P opens the command palette, F1 lists every shortcut.",
      "Read: the reading-mode button hides the editor. The sidebar's table of contents jumps to any heading.",
      "Save and export: Ctrl+S saves (same file in Chrome/Edge, a download elsewhere). Export the rendered page to HTML or PDF, or copy it as HTML.",
    ],
    syntaxTitle: "Supported Markdown",
    syntaxLead: "CommonMark plus the extensions people actually write in READMEs and notes:",
    syntax: [
      { name: "Tables, task lists, footnotes", desc: "GitHub-style tables (with alignment), - [x] checkboxes, footnotes, definition lists, abbreviations.", code: "| Name | Done |\n|:-----|:----:|\n| Draft | - [x] |" },
      { name: "Math", desc: "Inline $…$ and display $$…$$ formulas, typeset with KaTeX.", code: "$$\\int_0^1 x^2\\,dx = \\tfrac13$$" },
      { name: "Mermaid diagrams", desc: "Flowcharts, sequence, class, state, ER, Gantt, pie and more, from ```mermaid blocks.", code: MERMAID_CODE },
      { name: "Code", desc: "Syntax highlighting for common languages, with the language taken from the fence.", code: "```ts\nconst ok: boolean = true;\n```" },
      { name: "Extras", desc: "Front matter, ==highlight==, ++inserted++, ~sub~ and ^sup^, custom containers, heading anchors.", code: "---\ntitle: Notes\n---\n==important== H~2~O x^2^" },
    ],
    shareTitle: "Open from a link, share as a link",
    share: [
      "Add ?url= to the address with a link to a Markdown file — for example ?url=https://github.com/owner/repo/blob/main/README.md. GitHub blob and repository links are converted to raw files; the server has to allow cross-origin reads (raw.githubusercontent.com does). If it does not, you get a short explanation and can download and drop the file instead.",
      "Share link puts the whole document, compressed, after the # in the address. That part never reaches a server — whoever opens the link decompresses it in their own browser. Very long documents do not fit in a link; you will be told how long it is and asked to send the file instead.",
    ],
    privacyTitle: "Offline and private",
    privacy: [
      "Files are read and written by your browser. There is no upload and no account; settings and recent files stay in this browser's storage.",
      "Install it from the address bar (Chrome, Edge) and it works offline, opening .md files from Explorer like a desktop app. Your documents are never sent anywhere; visits are counted only with cookie-free Cloudflare Web Analytics.",
    ],
    desktopTitle: "Need folders, search and history?",
    desktop: [
      "README.md for Windows opens whole folders as a workspace, searches every document instantly, keeps earlier versions of each file, highlights what changed overnight, and lets AI agents read your notes through MCP — all offline.",
    ],
    desktopCta: "Get the desktop app (Microsoft Store)",
    pagesTitle: "More tools on this site",
    langTitle: "Language",
    footer: "Runs entirely in your browser · documents stay on this device",
    rootTitle: "README.md — Markdown viewer & editor",
    rootLead: "Choose a language:",
    notFoundTitle: "Page not found",
    notFoundLead: "This address does not exist. Open documents and recent files are still saved in your browser.",
  },
  ko: {
    langName: "한국어",
    ogLocale: "ko_KR",
    hint: "아래에 설명 ↓",
    routes: {
      app: {
        title: "마크다운 에디터·뷰어 온라인 — 무료, 업로드 없음 | README.md",
        h1: "브라우저에서 쓰는 마크다운 에디터·뷰어",
        description:
          "마크다운 파일을 브라우저에서 바로 열고 읽고 고치세요. Mermaid 다이어그램·수식·코드 하이라이트까지 실시간 미리보기. 업로드 없이, 오프라인에서도.",
        lead: [
          ".md 파일을 이 페이지에 끌어다 놓거나 [파일 열기]를 누르세요. 왼쪽은 편집기, 오른쪽은 조판된 미리보기이고 스크롤이 함께 움직입니다. Chrome·Edge 에서는 Ctrl+S 가 같은 파일에 저장하고, 다른 브라우저는 사본을 내려받습니다.",
          "Windows 마크다운 리더 README.md 의 무료 웹판입니다 — 파일 하나씩, 설치·가입 없이.",
        ],
        nav: "마크다운 에디터",
      },
      "markdown-viewer": {
        title: "마크다운 뷰어 온라인 — .md 파일 바로 열기 | README.md",
        h1: ".md 파일을 온라인에서 바로 열어 읽기",
        description:
          "마크다운을 깔끔한 읽기 화면으로. .md 파일이나 링크를 열면 목차·다이어그램·수식과 함께 읽을 수 있습니다. 무료, 가입 없음, 파일은 내 기기에.",
        lead: [
          "이 페이지는 리딩 모드로 열립니다 — 편집기가 비켜서 문서가 화면 폭을 다 쓰고, 헤딩은 사이드바 목차에 나열됩니다. 파일을 끌어다 놓거나 [파일 열기], 또는 주소 뒤에 ?url= 과 원문(raw) 마크다운 링크를 붙이세요.",
          "오타를 고치고 싶으면 툴바에서 리딩 모드를 끄세요. 편집기가 미리보기 옆에 돌아오고, 페이지는 새로고침되지 않습니다.",
        ],
        nav: "마크다운 뷰어",
      },
      "mermaid-preview": {
        title: "Mermaid 실시간 미리보기 — 마크다운 속 다이어그램 | README.md",
        h1: "Mermaid 다이어그램을 치는 대로 미리보기",
        description:
          "마크다운 안에 Mermaid 순서도·시퀀스·클래스 다이어그램을 쓰면 글 옆에서 바로 그려집니다. 브라우저에서 동작, 가입 없음, 오프라인 지원.",
        lead: [
          "순서도와 시퀀스 다이어그램이 든 견본이 편집기에 열려 있습니다. ```mermaid 블록을 고치면 손을 멈춘 직후 오른쪽 그림이 다시 그려지고, 문법이 틀리면 화면을 비우는 대신 그 자리에 오류를 보여 줍니다.",
          "다이어그램이 글과 같은 문서 안에 있으니 페이지 전체를 HTML·PDF 로 내보내거나 링크로 공유할 수 있습니다.",
        ],
        nav: "Mermaid 미리보기",
      },
      "readme-preview": {
        title: "README 미리보기 — 푸시 전에 README.md 확인 | README.md",
        h1: "푸시하기 전에 README.md 미리보기",
        description:
          "README.md 가 어떻게 보일지 확인하세요 — 헤딩·표·체크리스트·코드·Mermaid 까지. GitHub 링크로 바로 열 수도 있습니다. 무료, 업로드 없음.",
        lead: [
          "README 를 편집기에 붙여넣거나, 파일을 끌어다 놓거나, 링크로 여세요. github.com/…/blob/… 주소는 원문(raw) 주소로 자동으로 바뀌고, 상대경로 이미지는 같은 저장소에서 불러옵니다.",
          "표·체크리스트·각주·코드 블록·다이어그램이 읽는 사람이 볼 모양 그대로 그려지니, 커밋 전에 배치를 고칠 수 있습니다.",
        ],
        nav: "README 미리보기",
      },
    },
    howTitle: "사용법",
    how: [
      "열기: [파일 열기]를 누르거나 .md 파일을 창에 끌어다 놓거나, 링크로 엽니다(아래). 여러 파일은 탭으로 열립니다.",
      "편집: 왼쪽에 입력하면 미리보기가 커서를 따라옵니다. Ctrl+Shift+P 는 명령 팔레트, F1 은 단축키 전체.",
      "읽기: 리딩 모드 버튼이 편집기를 숨깁니다. 사이드바 목차로 어느 헤딩이든 바로 이동합니다.",
      "저장·내보내기: Ctrl+S 로 저장(Chrome·Edge 는 같은 파일에, 그 밖은 내려받기). 조판된 페이지를 HTML·PDF 로 내보내거나 HTML 로 복사합니다.",
    ],
    syntaxTitle: "지원하는 마크다운",
    syntaxLead: "CommonMark 에 README·메모에서 실제로 쓰는 확장을 더했습니다:",
    syntax: [
      { name: "표·체크리스트·각주", desc: "GitHub 식 표(정렬 포함), - [x] 체크박스, 각주, 정의 목록, 약어.", code: "| 이름 | 완료 |\n|:-----|:----:|\n| 초안 | - [x] |" },
      { name: "수식", desc: "인라인 $…$ 과 블록 $$…$$ 수식을 KaTeX 로 조판합니다.", code: "$$\\int_0^1 x^2\\,dx = \\tfrac13$$" },
      { name: "Mermaid 다이어그램", desc: "순서도·시퀀스·클래스·상태·ER·간트·파이 등, ```mermaid 블록에서.", code: MERMAID_CODE },
      { name: "코드", desc: "널리 쓰는 언어의 문법 강조 — 언어는 펜스에 적은 이름으로.", code: "```ts\nconst ok: boolean = true;\n```" },
      { name: "그 밖에", desc: "front matter, ==형광펜==, ++삽입++, ~아래~·^위^ 첨자, 사용자 컨테이너, 헤딩 앵커.", code: "---\ntitle: 메모\n---\n==중요== H~2~O x^2^" },
    ],
    shareTitle: "링크로 열기, 링크로 공유",
    share: [
      "주소 뒤에 ?url= 과 마크다운 파일 링크를 붙이세요 — 예: ?url=https://github.com/owner/repo/blob/main/README.md. GitHub 의 blob·저장소 링크는 원문(raw) 파일로 바뀝니다. 서버가 교차 출처 읽기를 허용해야 하며(raw.githubusercontent.com 은 허용), 안 되면 이유를 짧게 알려 드립니다 — 그때는 파일을 내려받아 끌어다 놓으세요.",
      "[공유 링크]는 문서 전체를 압축해 주소의 # 뒤에 담습니다. 이 부분은 서버로 가지 않습니다 — 링크를 연 사람의 브라우저가 직접 풀어 엽니다. 너무 긴 문서는 링크에 들어가지 않으며, 그때는 길이를 알려 드리고 파일로 보내시길 권합니다.",
    ],
    privacyTitle: "오프라인·개인정보",
    privacy: [
      "파일은 브라우저가 읽고 씁니다. 업로드도 계정도 없고, 설정과 최근 파일은 이 브라우저 저장소에만 남습니다.",
      "주소창에서 앱으로 설치하면(Chrome·Edge) 오프라인에서도 동작하고, 탐색기에서 .md 파일을 데스크톱 앱처럼 엽니다. 문서 내용은 어디에도 보내지 않고, 방문 수만 쿠키 없는 Cloudflare Web Analytics 로 셉니다.",
    ],
    desktopTitle: "폴더·검색·기록이 필요하다면",
    desktop: [
      "Windows 용 README.md 는 폴더째 워크스페이스로 열고, 모든 문서를 즉시 검색하고, 파일마다 이전 판을 보관하고, 밤사이 바뀐 문서를 알려 주며, MCP 로 AI 에이전트가 내 노트를 읽게 합니다 — 전부 오프라인으로.",
    ],
    desktopCta: "데스크톱 앱 받기(Microsoft Store)",
    pagesTitle: "이 사이트의 다른 도구",
    langTitle: "언어",
    footer: "모든 처리가 브라우저 안에서 · 문서는 이 기기에 남습니다",
    rootTitle: "README.md — 마크다운 뷰어·에디터",
    rootLead: "언어를 고르세요:",
    notFoundTitle: "페이지를 찾을 수 없어요",
    notFoundLead: "없는 주소입니다. 열어 둔 문서와 최근 파일은 브라우저에 그대로 남아 있습니다.",
  },
};
