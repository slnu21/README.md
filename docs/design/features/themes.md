# 테마

CSS 변수 토큰 기반 **테마 레지스트리**. 코드 수정 없이 테마를 추가할 수 있다 —
`App.css`에는 테마 이름이 박힌 규칙이 **하나도 없다**(0개, 테스트로 확인 가능).

## 내장 테마

| id | 이름(ko / en) | 성격 |
|---|---|---|
| `light` | 라이트 / Light | 기본 |
| `dark` | 다크 / Dark | |
| `paper` | 페이퍼 / Paper | 크림톤 종이 |
| `hanji` | 한지 / Hanji | 미색 바탕 · 먹 글자 · 주사(朱砂) 강조 · 발(簾) 무늬 |
| `epaper` | 전자잉크 / E-Paper | 무채색 · 평면(그림자 없음) · 링크는 밑줄 |

## 토큰 세 층

### 1. 핵심 5토큰 — `tokens`

`--bg` `--fg` `--accent` `--surface` `--border`. **여기서 앱 크롬·CodeMirror·mermaid·미리보기가
전부 파생된다**(`App.css`의 `--muted`/`--faint`/`--hover`/… 는 `color-mix` 파생).

**반드시 6자리 hex** 여야 한다. `lib/mermaid.ts` `diagramConfig()`가 이 다섯을 khroma로 파생하므로
`color-mix()`·`var()`·`rgb()`가 섞이면 다이어그램 렌더가 통째로 터진다. `lib/mermaid.test.ts`가
모든 테마에 대해 `themeVariables` 결과를 `/^#[0-9a-f]{6}$/i` 로 검사한다.

### 2. 서식 색 23개 — `prose`

미리보기(리딩) 문서 안에서만 쓰는 `--prose-*`. 목록·의미·순서 계약은
[rendering.md](rendering.md#서식-색-위계prose-토큰) 참고.

**적지 않아도 된다.** 지정하지 않은 항목은 `PROSE_DEFAULT_CSS`가 핵심 5토큰에서
`color-mix`로 파생한다 → 사용자 테마의 최소 기재량이 0이다.

### 3. 면(面) 열거값 — `texture` · `elevation`

| 필드 | 값 | 뜻 |
|---|---|---|
| `texture` | `"none"`(기본) · `"hanji"` | 리딩 카드 바탕 무늬 |
| `elevation` | `"soft"`(기본) · `"flat"` | 카드·앱 그림자 |

**열거값인 이유**: 사용자 파일이 CSS 문자열을 그대로 넣게 두면 값 안의 `;`+`}` 로 스타일 블록을
벗어날 수 있다. 값을 hex와 열거값으로만 좁히면 그 경로가 구조적으로 사라진다.

한지 무늬는 손으로 뜬 종이에 남는 가로 발자국을 `repeating-linear-gradient` 로 흉내 낸다 —
자산 0바이트, 필터 합성 없음, 확대해도 안전. 인쇄·PDF에서는 `PRINT_CSS`가 끄고,
프레젠테이션에서는 `SLIDE_CSS`의 `background:transparent`(단축 속성)가 저절로 지운다.

`applyTheme()`는 `--shadow`를 **분기마다 반드시 대입한다** — `setProperty`는 속성을 지우지 않아,
안 그러면 `flat` → `soft` 로 되돌려도 그림자가 안 돌아온다.

## 사용자 테마 파일

`%APPDATA%\com.readme.app\themes.jsonc` — SQLite DB 옆. 설정 팝오버의
**테마 파일 열기** / **다시 불러오기** 두 버튼이 입구다.

```jsonc
{
  "version": 1,
  "themes": [
    {
      "id": "my-hanji",       // 기본 테마 id 를 쓰면 그 테마를 덮어쓴다
      "name": "내 한지",
      "extends": "hanji",     // 바탕 테마 — 바뀐 값만 적으면 된다
      "type": "light",
      "texture": "hanji",
      "elevation": "soft",
      "tokens": { "bg": "#f2ecdf", "fg": "#221f1c" },
      "prose": { "heading": "#1f1c19", "marker": "#9c3a2e" }
    }
  ]
}
```

규칙: 색은 **6자리 hex 만**(`#abc` 는 `#aabbcc` 로 정규화, 그 밖은 무시) · 주석 가능 ·
트레일링 콤마 불가 · 값을 지우면 기본 파생으로 돌아간다.

**fail-soft** — 파일이 없으면 조용히 내장 테마만, JSON 이 깨지면 줄 번호를 토스트로 알리고
내장 테마를 유지, 잘못된 색은 그 항목만 버린다. 선택 중이던 테마가 파일에서 사라지면
기본 테마로 떨어진다.

### 부팅 순서 (첫 페인트 깜빡임 없음)

`main.tsx` 는 첫 페인트 전에 `applyTheme` 를 **동기** 호출한다. 디스크 읽기는 비동기 IPC라
그대로 두면 사용자 테마 사용자에게 light 가 한 번 번쩍인다 → **파일 원문을 스토어에 캐시**하고
(`customThemesText`, localStorage 는 동기), 부팅 때 그 원문을 동기 파싱해 레지스트리에 넣는다.
디스크 읽기는 그 뒤에 따라와 다르면 갱신한다(`themeRev` 증가 → 앱 크롬·미리보기 재적용).

**파싱 결과가 아니라 원문을 캐시하는 이유**: 검증을 안 거친 객체가 localStorage 를 통해 테마로
승격되는 경로가 없어지고, `Theme` 모양이 바뀌어도 낡은 캐시가 표류하지 않는다.

## 구현

`src/app/themes/` — `index.ts`(레지스트리·내장 테마) · `prose.ts`(서식 토큰·기본값) ·
`apply.ts`(:root 주입) · `custom.ts`(사용자 파일 파싱, 순수) · `load.ts`(디스크 I/O).
미리보기 주입은 `lib/renderDoc.ts` `themeVarsCss()`. 상태는 `src/app/store`.
