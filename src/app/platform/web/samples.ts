// 랜딩 견본 문서 — 열린 문서가 없을 때 그 랜딩이 무엇을 하는지 바로 보이게. 원격 이미지 없음(오프라인에서도 같은 모양).
// 모듈 최상위 부작용 없음.
import type { Lang, SampleId } from "./site/routes";

interface Sample {
  name: string;
  text: string;
}

const MERMAID_EN = `# Mermaid live preview

Edit the diagrams below — the preview redraws a moment after you stop typing.

## Flowchart

\`\`\`mermaid
flowchart LR
  A[Write Markdown] --> B{Has a diagram?}
  B -- yes --> C[Render with Mermaid]
  B -- no --> D[Render text]
  C --> E[Export or share]
  D --> E
\`\`\`

## Sequence

\`\`\`mermaid
sequenceDiagram
  participant You
  participant Browser
  You->>Browser: type in the editor
  Browser-->>You: diagram redrawn
  You->>Browser: Share link
  Browser-->>You: link with the document inside
\`\`\`

Diagrams sit next to normal Markdown: **bold**, \`code\`, lists and $E = mc^2$.
`;

const MERMAID_KO = `# Mermaid 실시간 미리보기

아래 다이어그램을 고쳐 보세요 — 손을 멈추면 곧바로 미리보기가 다시 그려집니다.

## 순서도

\`\`\`mermaid
flowchart LR
  A[마크다운 쓰기] --> B{다이어그램 있음?}
  B -- 예 --> C[Mermaid 로 그리기]
  B -- 아니오 --> D[글자 조판]
  C --> E[내보내기·공유]
  D --> E
\`\`\`

## 시퀀스

\`\`\`mermaid
sequenceDiagram
  participant 나
  participant 브라우저
  나->>브라우저: 편집기에 입력
  브라우저-->>나: 다이어그램 다시 그림
  나->>브라우저: 공유 링크
  브라우저-->>나: 문서가 든 링크
\`\`\`

다이어그램은 평범한 마크다운 옆에 있습니다: **굵게**, \`코드\`, 목록, $E = mc^2$.
`;

const README_EN = `# my-project

A short line that says what this project does.

## Install

\`\`\`bash
npm install my-project
\`\`\`

## Usage

\`\`\`ts
import { greet } from "my-project";
greet("world"); // → "Hello, world"
\`\`\`

## Options

| Option | Type | Default | Description |
|:-------|:----:|:-------:|-------------|
| \`name\` | string | \`"world"\` | Who to greet |
| \`loud\` | boolean | \`false\` | Shout it |

## Roadmap

- [x] First release
- [ ] Plugins
- [ ] Docs site

> Paste your own README here, or open one from GitHub with \`?url=\`.

## License

MIT[^1]

[^1]: See the LICENSE file.
`;

const README_KO = `# my-project

이 프로젝트가 무엇을 하는지 한 줄로.

## 설치

\`\`\`bash
npm install my-project
\`\`\`

## 사용법

\`\`\`ts
import { greet } from "my-project";
greet("world"); // → "Hello, world"
\`\`\`

## 옵션

| 옵션 | 형식 | 기본값 | 설명 |
|:-----|:----:|:------:|------|
| \`name\` | string | \`"world"\` | 인사할 대상 |
| \`loud\` | boolean | \`false\` | 크게 |

## 로드맵

- [x] 첫 릴리스
- [ ] 플러그인
- [ ] 문서 사이트

> 내 README 를 여기에 붙여넣거나, 주소 뒤에 \`?url=\` 로 GitHub 의 README 를 여세요.

## 라이선스

MIT[^1]

[^1]: LICENSE 파일 참고.
`;

const VIEWER_EN = `# Reading view

This page opens Markdown in **reading mode**: the editor is hidden and the document gets the full width.

## Open a document

1. Press **Open file** or drop a \`.md\` file anywhere on the window.
2. Or add \`?url=\` with a link to a raw Markdown file.
3. Jump between headings with the table of contents on the left.

## What renders

- Tables, task lists and footnotes
- Math such as $\\int_0^1 x^2\\,dx = \\tfrac13$
- Highlighted code and Mermaid diagrams

\`\`\`mermaid
flowchart LR
  Open --> Read --> Edit
\`\`\`

Turn reading mode off in the toolbar to edit — nothing reloads.
`;

const VIEWER_KO = `# 읽기 화면

이 페이지는 마크다운을 **리딩 모드**로 엽니다 — 편집기가 숨고 문서가 화면 폭을 다 씁니다.

## 문서 열기

1. **파일 열기**를 누르거나 \`.md\` 파일을 창 아무 데나 끌어다 놓으세요.
2. 또는 주소 뒤에 \`?url=\` 과 원문(raw) 마크다운 링크를 붙이세요.
3. 왼쪽 목차로 헤딩 사이를 오가세요.

## 그려지는 것

- 표·체크리스트·각주
- $\\int_0^1 x^2\\,dx = \\tfrac13$ 같은 수식
- 문법 강조된 코드와 Mermaid 다이어그램

\`\`\`mermaid
flowchart LR
  열기 --> 읽기 --> 고치기
\`\`\`

고치려면 툴바에서 리딩 모드를 끄세요 — 새로고침되지 않습니다.
`;

const SAMPLES: Record<SampleId, Record<Lang, Sample>> = {
  mermaid: { en: { name: "mermaid-sample.md", text: MERMAID_EN }, ko: { name: "mermaid-견본.md", text: MERMAID_KO } },
  readme: { en: { name: "README.md", text: README_EN }, ko: { name: "README.md", text: README_KO } },
  viewer: { en: { name: "welcome.md", text: VIEWER_EN }, ko: { name: "시작하기.md", text: VIEWER_KO } },
};

export function sampleDoc(id: SampleId, lang: Lang): Sample & { path: string } {
  const s = SAMPLES[id][lang];
  return { ...s, path: `/web/sample-${id}-${lang}/${s.name}` };
}
