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

## 성능
- 파싱·하이라이트는 **Web Worker**에서. 입력 디바운스. 무거운 블록은 IntersectionObserver 지연.

참고: `src/app/lib/markdown.ts`, `src/app/workers/markdown.worker.ts`, [architecture](../architecture.md).
