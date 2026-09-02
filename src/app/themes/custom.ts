// 사용자 테마 파일 파싱·검증. 순수 — 파일 I/O 는 themes/load.ts 가 맡는다(themes/custom.test.ts).
//
// 규약대로 **fail-soft** 다: 잘못된 항목 하나가 파일 전체를 무효로 만들지 않는다. 대신 무엇을
// 왜 버렸는지 경고로 돌려주고, 호출부가 요약해 토스트로 알린다(v0.7.1에서 배운 "실패를 삼키지
// 않는다" — 조용히 무시하면 사용자는 자기 오타를 영원히 못 찾는다).
//
// **값은 6자리 hex 와 열거값만 받는다.** 이유 둘:
//  1. 5토큰은 mermaid 로 흘러가 khroma 가 파생한다 — CSS 함수가 섞이면 다이어그램이 통째로 터진다.
//  2. 값이 그대로 `:root{}` 에 직렬화되므로 `;`+`}` 를 넣으면 스타일 블록을 벗어날 수 있다.
//     (사용자 자기 파일이라 보안 경계는 아니지만, 좁혀 두면 그 경로가 구조적으로 사라진다.)
import { normalizeHex } from "../lib/color";
import { parseErrorLine, stripJsonComments } from "../lib/jsonc";
import { PROSE_KEYS, type ProseTokens } from "./prose";
import type { Theme, ThemeTokens } from ".";

/** 파일에서 쓰는 짧은 이름 → 실제 CSS 변수. `--bg` 처럼 적어도 받아 준다. */
const TOKEN_KEY: Record<string, keyof ThemeTokens> = {
  bg: "--bg",
  fg: "--fg",
  accent: "--accent",
  surface: "--surface",
  border: "--border",
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_NAME = 40;
const MAX_THEMES = 40;
const MAX_WARNINGS = 12;

/** 경고는 **구조화해** 돌려준다 — 이 모듈은 순수해야 하고(i18n 의존 없음), 문구는
 *  표시 시점에 ko/en 으로 번역된다(themes/load.ts). 테스트도 문구 대신 code 를 본다. */
export const THEME_WARNING_CODES = [
  "parseLine",
  "parseFailed",
  "notObject",
  "unknownVersion",
  "themesNotArray",
  "entryNotObject",
  "badId",
  "badExtends",
  "fieldNotObject",
  "unknownKey",
  "badColor",
  "badBool",
  "tooMany",
  "cssTooLong",
  "cssUnsafe",
  "cssImport",
] as const;
export type ThemeWarningCode = (typeof THEME_WARNING_CODES)[number];

export interface ThemeWarning {
  code: ThemeWarningCode;
  params?: Record<string, string | number>;
}

export interface ParsedThemes {
  /** id → 완성된 Theme(extends 병합 끝). */
  themes: Record<string, Theme>;
  /** 이 파일이 인라인으로 들고 있는 CSS(교환용 팩). id → 원문. */
  styles: Record<string, string>;
  /** 사람에게 보여 줄 경고. 비어 있으면 완전히 정상. */
  warnings: ThemeWarning[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 제어문자를 걷어내고 길이를 자른다 — 표시명은 툴팁·상태바·팔레트에 그대로 나간다. */
function cleanName(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return s ? s.slice(0, MAX_NAME) : fallback;
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : undefined;
}

/** 사용자 파일 원문 → 테마 목록. `base` 는 내장 테마(extends 의 바탕이자 기본 폴백). */
export function parseUserThemes(text: string, base: Record<string, Theme>): ParsedThemes {
  const warnings: ThemeWarning[] = [];
  const warn = (code: ThemeWarningCode, params?: Record<string, string | number>): void => {
    if (warnings.length < MAX_WARNINGS) warnings.push(params ? { code, params } : { code });
  };
  const fallbackId = base.light ? "light" : Object.keys(base)[0];

  if (!text.trim()) return { themes: {}, styles: {}, warnings };

  let root: unknown;
  try {
    root = JSON.parse(stripJsonComments(text)) as unknown;
  } catch (e) {
    const line = parseErrorLine(text, e);
    const detail = e instanceof Error ? e.message : String(e);
    if (line !== null) warn("parseLine", { line });
    else warn("parseFailed", { detail: detail.slice(0, 120) });
    return { themes: {}, styles: {}, warnings };
  }

  if (!isRecord(root)) {
    warn("notObject");
    return { themes: {}, styles: {}, warnings };
  }
  if (root.version !== undefined && root.version !== 1) {
    warn("unknownVersion", { version: String(root.version) });
  }
  if (!Array.isArray(root.themes)) {
    warn("themesNotArray");
    return { themes: {}, styles: {}, warnings };
  }

  // 교환용 팩은 CSS 를 파일 안에 갖고 있다(id → 원문). 사이드카는 호출부가 따로 붙인다.
  const styles: Record<string, string> = {};
  if (root.styles !== undefined) {
    if (!isRecord(root.styles)) warn("fieldNotObject", { where: 0, id: "root", field: "styles" });
    else
      for (const [k, v] of Object.entries(root.styles)) {
        if (typeof v === "string") styles[k] = v;
      }
  }

  const out: Record<string, Theme> = {};
  for (const [i, raw] of root.themes.slice(0, MAX_THEMES).entries()) {
    const where = i + 1;
    if (!isRecord(raw)) {
      warn("entryNotObject", { where });
      continue;
    }
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!ID_RE.test(id)) {
      warn("badId", { where, id });
      continue;
    }

    // extends 를 안 적으면 같은 id 의 내장 테마(= 덮어쓰기), 그것도 없으면 기본 테마.
    let parent = base[id] ?? base[fallbackId];
    if (raw.extends !== undefined) {
      const ext = typeof raw.extends === "string" ? raw.extends : "";
      if (base[ext]) parent = base[ext];
      else warn("badExtends", { where, id, ext, fallback: fallbackId });
    }

    const tokens: ThemeTokens = { ...parent.tokens };
    if (raw.tokens !== undefined) {
      if (!isRecord(raw.tokens)) warn("fieldNotObject", { where, id, field: "tokens" });
      else
        for (const [k, v] of Object.entries(raw.tokens)) {
          const cssKey = TOKEN_KEY[k] ?? TOKEN_KEY[k.replace(/^--/, "")];
          if (!cssKey) {
            warn("unknownKey", { where, id, key: k });
            continue;
          }
          const hex = normalizeHex(v);
          if (!hex) {
            warn("badColor", { where, id, key: k, value: String(v).slice(0, 24) });
            continue;
          }
          tokens[cssKey] = hex;
        }
    }

    const prose: Partial<ProseTokens> = { ...parent.prose };
    if (raw.prose !== undefined) {
      if (!isRecord(raw.prose)) warn("fieldNotObject", { where, id, field: "prose" });
      else
        for (const [k, v] of Object.entries(raw.prose)) {
          if (!(PROSE_KEYS as string[]).includes(k)) {
            warn("unknownKey", { where, id, key: k });
            continue;
          }
          if (k === "linkUnderline") {
            if (typeof v === "boolean") prose.linkUnderline = v;
            else warn("badBool", { where, id, key: k });
            continue;
          }
          const hex = normalizeHex(v);
          if (!hex) {
            warn("badColor", { where, id, key: k, value: String(v).slice(0, 24) });
            continue;
          }
          (prose as Record<string, string>)[k] = hex;
        }
    }

    for (const k of Object.keys(raw)) {
      if (!["id", "name", "type", "extends", "texture", "elevation", "tokens", "prose"].includes(k))
        warn("unknownKey", { where, id, key: k });
    }

    out[id] = {
      id,
      name: cleanName(raw.name, parent.name),
      type: pickEnum(raw.type, ["light", "dark"] as const) ?? parent.type,
      tokens,
      ...(Object.keys(prose).length ? { prose } : {}),
      texture: pickEnum(raw.texture, ["none", "hanji"] as const) ?? parent.texture,
      elevation: pickEnum(raw.elevation, ["soft", "flat"] as const) ?? parent.elevation,
    };
  }

  if (root.themes.length > MAX_THEMES) {
    warn("tooMany", { max: MAX_THEMES });
  }
  return { themes: out, styles, warnings };
}

// ── 스타일 팩 ────────────────────────────────────────────────────────────────
//
// 테마는 색뿐 아니라 **모양**(CSS)도 갖는다. 전역 custom.css 로 두지 않은 이유:
// 끄는 방법이 없고, 두 사람의 팩이 섞이며, 공유 단위가 "테마 + 그 CSS" 로 안 떨어진다.
// 테마별로 두면 셋이 한꺼번에 풀린다 — 전환이 곧 토글이고, 한 번에 하나만 활성이다.

/** CSS 한 장의 상한. 이보다 크면 통째로 버린다(부팅 캐시에도 들어가는 값이다). */
const MAX_CSS = 64 * 1024;

/** `</style` 를 찾는다. 대소문자·공백 변형까지 — 이게 유일한 진짜 탈출구다. */
const STYLE_CLOSE_RE = /<\s*\/\s*style/i;

/** 사용자 CSS 를 `<style>` 에 넣기 전에 거른다. 순수.
 *
 *  **CSS 파서를 넣지 않는다** — 큰 의존성이고 "검사했다"는 착각만 준다. 브라우저가 이미
 *  모르는 규칙을 조용히 무시한다. 대신 **문서를 벗어나는 것 하나만** 확실히 막는다:
 *  값이 `</style>` 을 품으면 스타일 요소를 닫고 임의 HTML 이 되어 버린다. 샌드박스에
 *  스크립트가 없어 실행은 안 되지만, 미리보기에 가짜 내용을 그릴 수는 있다. */
export function sanitizeThemeCss(
  css: string,
  id: string,
): { css: string; warnings: ThemeWarning[] } {
  const warnings: ThemeWarning[] = [];
  if (css.length > MAX_CSS) {
    warnings.push({ code: "cssTooLong", params: { id, max: Math.round(MAX_CSS / 1024) } });
    return { css: "", warnings };
  }
  if (STYLE_CLOSE_RE.test(css)) {
    warnings.push({ code: "cssUnsafe", params: { id } });
    return { css: "", warnings };
  }
  // @import 는 CSP 가 막고, 어차피 시트 맨 앞이 아니면 무효다. 조용히 죽는 대신 알려 준다.
  if (/@import/i.test(css)) warnings.push({ code: "cssImport", params: { id } });
  return { css, warnings };
}

/** 디스크에서 읽어 온 테마 입력 뭉치(Rust `read_theme_bundle` 의 결과와 같은 모양). */
export interface ThemeBundle {
  file: string;
  dir: string;
  /** `themes.jsonc` — 손으로 쓰는 파일. */
  main: string | null;
  /** `themes/*.jsonc` — 받은 팩. 파일명 오름차순. name = 확장자 뗀 이름, file = 진짜 파일명. */
  packs: { name: string; file?: string; text: string }[];
  /** `themes/*.css` — 사이드카. name = 테마 id. */
  styles: { name: string; file?: string; text: string }[];
}

/** 뭉치 전체 → 최종 테마 목록. 순수(파일 I/O 없음).
 *
 *  **우선순위는 하나의 원칙에서 나온다 — 내가 손으로 쓴 것이 남이 준 것을 이긴다.**
 *   1. 내장 테마
 *   2. `themes/*.jsonc` (파일명 순 — 겹치면 뒤가 이긴다)
 *   3. `themes.jsonc` (내가 쓴 것 — 최종 승자)
 *  CSS 도 같다: 사이드카 `themes/<id>.css` 가 팩에 인라인된 것을 이긴다. */
export function parseThemeBundle(bundle: ThemeBundle, base: Record<string, Theme>): ParsedThemes {
  const themes: Record<string, Theme> = {};
  const inline: Record<string, string> = {};
  const warnings: ThemeWarning[] = [];

  const absorb = (r: ParsedThemes): void => {
    Object.assign(themes, r.themes);
    Object.assign(inline, r.styles);
    warnings.push(...r.warnings);
  };

  for (const pack of bundle.packs) absorb(parseUserThemes(pack.text, base));
  if (bundle.main) absorb(parseUserThemes(bundle.main, base));

  // 사이드카가 인라인을 덮는다.
  const sidecar: Record<string, string> = {};
  for (const s of bundle.styles) sidecar[s.name] = s.text;

  for (const [id, theme] of Object.entries(themes)) {
    const raw = sidecar[id] ?? inline[id];
    if (raw === undefined) continue;
    const { css, warnings: w } = sanitizeThemeCss(raw, id);
    warnings.push(...w);
    if (css) themes[id] = { ...theme, css };
  }

  return { themes, styles: inline, warnings };
}

/** 테마 하나 → 자기완결 팩 파일 원문(교환용). 순수.
 *
 *  왜 필요한가: 내 `themes.jsonc` 에는 테마가 여러 개인데 공유할 건 하나고, CSS 는
 *  사이드카로 흩어져 있다. 하나로 모아 **파일 한 개**로 만드는 것이 내보내기의 본체다.
 *  받는 쪽은 이 파일을 `themes/` 에 넣기만 하면 된다 — 쪼갤 필요가 없다. */
export function buildThemePack(theme: Theme): string {
  const tokens: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.tokens)) tokens[k.replace(/^--/, "")] = v;

  const entry: Record<string, unknown> = {
    id: theme.id,
    name: theme.name,
    type: theme.type,
    tokens,
  };
  if (theme.texture && theme.texture !== "none") entry.texture = theme.texture;
  if (theme.elevation && theme.elevation !== "soft") entry.elevation = theme.elevation;
  if (theme.prose && Object.keys(theme.prose).length) entry.prose = theme.prose;

  const doc: Record<string, unknown> = { version: 1, themes: [entry] };
  if (theme.css) doc.styles = { [theme.id]: theme.css };

  // 머리말은 받는 사람이 파일만 보고도 무엇인지 알게 한다. JSONC 라 주석이 남는다.
  const head =
    `// README.md 테마 팩 — ${theme.name}\n` +
    `//\n` +
    `// 이 파일을 [설정 ▸ 테마 폴더 열기] 로 열리는 폴더에 넣으면 바로 쓸 수 있습니다.\n` +
    `// 색은 6자리 16진수만, 주석은 써도 되고 마지막 쉼표는 안 됩니다.\n`;
  return head + JSON.stringify(doc, null, 2) + "\n";
}
