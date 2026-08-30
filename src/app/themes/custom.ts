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
] as const;
export type ThemeWarningCode = (typeof THEME_WARNING_CODES)[number];

export interface ThemeWarning {
  code: ThemeWarningCode;
  params?: Record<string, string | number>;
}

export interface ParsedThemes {
  /** id → 완성된 Theme(extends 병합 끝). */
  themes: Record<string, Theme>;
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

  if (!text.trim()) return { themes: {}, warnings };

  let root: unknown;
  try {
    root = JSON.parse(stripJsonComments(text)) as unknown;
  } catch (e) {
    const line = parseErrorLine(text, e);
    const detail = e instanceof Error ? e.message : String(e);
    if (line !== null) warn("parseLine", { line });
    else warn("parseFailed", { detail: detail.slice(0, 120) });
    return { themes: {}, warnings };
  }

  if (!isRecord(root)) {
    warn("notObject");
    return { themes: {}, warnings };
  }
  if (root.version !== undefined && root.version !== 1) {
    warn("unknownVersion", { version: String(root.version) });
  }
  if (!Array.isArray(root.themes)) {
    warn("themesNotArray");
    return { themes: {}, warnings };
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
  return { themes: out, warnings };
}
