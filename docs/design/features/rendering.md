# 마크다운 렌더링

엔진 **markdown-it** + 플러그인으로 "최대한 다양한 기능"을 지원한다.

## 활성 예정 기능/플러그인
- GFM 류: 표, 체크리스트(task-lists), 자동 링크(linkify), 취소선.
- 인라인 확장: sub/sup, mark, ins, abbr, emoji.
- 블록: footnote, deflist, container(admonition/callout), multimd-table.
- 구조: front-matter, anchor + toc.
- 수식: **KaTeX**(폰트 번들). 다이어그램: **mermaid**(지연 렌더).
- 코드 하이라이트: **highlight.js**(언어 지연 로드).

## 보안
- `html: true`(원시 HTML 허용)지만 렌더 결과는 **반드시 DOMPurify로 정화** 후 **샌드박스 iframe** 주입.
- DOMPurify가 지운 `href`(허용 스킴 밖)는 **`data-blocked-href`에 값만 기록**한다. href를 되살리지 않으므로 보안 경계는 그대로고, "눌러도 아무 일 없는 링크"에 이유를 붙일 수 있다.

## 링크 열기
미리보기·프레젠테이션이 같은 규칙을 쓴다. 순수 분류는 `lib/links.ts`(`classifyLink`·`howFromModifiers`, vitest), DOM 글루는 `lib/previewLinks.ts`.

| 대상 | 클릭 | Ctrl(⌘)+클릭 | Alt+클릭 |
|---|---|---|---|
| `http`·`https`·`mailto`·`tel` | OS 기본 브라우저 | (같음) | (같음) |
| `#앵커` | 문서 내 스크롤 | (같음) | (같음) |
| 내부 `.md`·`.txt` | 현재 탭 활성 | 옆 패널(`openBeside`) | 탐색기에서 위치 |
| 그 밖의 로컬 파일 | OS 기본 앱 | (같음) | 탐색기에서 위치 |

- **맨클릭이 곧 열기다.** 미리보기는 편집면이 아니라 읽는 면이라 클릭에 다른 뜻이 없고, 같은 화면의 내부 문서 링크가 이미 맨클릭으로 열린다. 수식어는 *추가* 목적지에만 쓴다.
- **웹 주소는 `plugin:opener|open_url`** 로 연다. `open_path`는 `opener:default` 스코프에 없어 ACL이 거부한다(v0.6.8~v0.7.0 동안 외부 링크가 죽어 있던 원인). capability는 바꾸지 않는다.
- **로컬 파일은 우리 커맨드 `commands/shell_open.rs open_with_default`** 가 연다. `opener:allow-open-path` + `{"path":"**"}`를 여는 대신 **Rust에서 확장자 허용 목록을 검사**한다 — 링크 대상은 문서 작성자가 쓴 문자열이므로 프런트가 뚫려도 `.exe`가 열리면 안 된다. 실행·스크립트·간접 실행(`lnk`·`url`·`hta`·`chm`)·**로컬 html**은 `EUNSAFE`로 거절하고 대신 탐색기에서 위치를 연다. 없으면 `ENOENT`.
- **실패는 삼키지 않는다** — `shell/Toast.tsx` + 스토어 `notice`(비영속)로 화면에 남긴다. 링크에는 목적지를 `title`로 단다.
- **markdown-it 의 `validateLink` 가 먼저 거른다** — `javascript:`·`file:`·`vbscript:`·`data:` 는 **링크 자체가 만들어지지 않고 글자로 남는다.** 그래서 `data-blocked-href`·`file:///` 처리는 문서에 **원시 HTML 로 적힌 `<a>`** 와 그 밖의 스킴(`obsidian:` 등)에 대해 동작한다. 실검증 픽스처도 그 둘을 HTML 로 적어야 재현된다.
- `file:///`는 로컬 경로로 옮겨 다룬다(호스트가 붙은 UNC `file://server/share`는 무시). 스킴이 한 글자일 때만 Windows 드라이브 문자로 본다 — 등록된 URL 스킴은 모두 두 글자 이상이라, 이 규칙이 `obsidian:`류가 로컬 경로 분기로 새는 것을 막는다.
- 링크로 감싼 이미지(배지)는 **링크가 라이트박스를 이긴다**. 감싸지 않은 이미지만 라이트박스.

## 성능
- 파싱·하이라이트는 **Web Worker**에서. 입력 디바운스. 무거운 블록은 IntersectionObserver 지연.

참고: `src/app/lib/markdown.ts`, `src/app/workers/markdown.worker.ts`, [architecture](../architecture.md).
