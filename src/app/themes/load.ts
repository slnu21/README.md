// 사용자 테마 파일 디스크 I/O. 파싱·검증은 themes/custom.ts(순수)가 하고 여기는 글루만 맡는다.
//
// 부팅 순서가 이 파일의 핵심이다. main.tsx 는 첫 페인트 전에 applyTheme 를 **동기** 호출하는데
// 디스크 읽기는 비동기 IPC라, 그대로 두면 사용자 테마를 쓰는 사람에게 light 가 한 번 번쩍인다
// (창은 tauri.conf.json 에서 visible:false 가 아니라 프레임 0부터 화면에 있다).
// → 파일 원문을 localStorage 에 캐시해 두고 부팅 때 **동기 파싱**한다(hydrateUserThemes).
//   디스크 읽기는 그 뒤에 따라와, 달라졌을 때만 갱신한다(loadUserThemes).
import i18n from "../lib/i18n";
import {
  createFile,
  pathExists,
  readThemeBundle,
  revealInExplorer,
  themeDirPath,
  themeFilePath,
} from "../lib/tauri";
import { useAppStore } from "../store";
import { applyTheme } from "./apply";
import { parseThemeBundle, type ThemeBundle, type ThemeWarning } from "./custom";
import { THEME_FILE_TEMPLATE, THEME_FOLDER_GUIDE } from "./template";
import { BUILTIN_THEMES, defaultThemeId, setUserThemes, themes } from ".";

/** 구조화된 경고 → 현재 언어의 한 줄. 파서는 순수하게 두고 문구는 여기서 붙인다. */
export function warningText(w: ThemeWarning): string {
  return i18n.t(`theme.w.${w.code}`, { ...w.params, defaultValue: w.code });
}

/** 경고를 한 줄로 요약한다 — 토스트는 슬롯이 하나다. 자세한 내용은 콘솔로 흘린다. */
function notice(warnings: ThemeWarning[]): void {
  if (!warnings.length) return;
  for (const w of warnings) console.warn("[themes.jsonc]", w.code, w.params ?? "");
  const { showNotice } = useAppStore.getState();
  const head = warningText(warnings[0]);
  showNotice(
    warnings.length === 1
      ? i18n.t("theme.warnOne", { detail: head })
      : i18n.t("theme.warnMany", { detail: head, more: warnings.length - 1 }),
    "error",
  );
}

/** 선택 중이던 테마가 파일에서 사라졌으면 기본 테마로 되돌린다. */
function reconcileSelection(): void {
  const s = useAppStore.getState();
  if (!themes[s.themeId]) s.setTheme(defaultThemeId);
}

/** **동기** — 캐시된 뭉치를 파싱해 레지스트리에 넣는다. 첫 페인트 전에 부른다.
 *  경고는 내지 않는다(캐시는 이미 한 번 검증을 통과한 원문이고, 부팅 때 오류 토스트를
 *  띄우면 사용자는 무엇 때문인지 알 수 없다). 진짜 검증은 loadUserThemes 가 한다. */
export function hydrateUserThemes(): void {
  const raw = useAppStore.getState().customThemesText;
  if (!raw) return;
  try {
    const bundle = JSON.parse(raw) as ThemeBundle;
    setUserThemes(parseThemeBundle(bundle, BUILTIN_THEMES).themes);
  } catch {
    setUserThemes({}); // 캐시는 파생 데이터다 — 깨졌으면 버리고 디스크가 고쳐 준다.
  }
}

/** 디스크에서 읽어 반영한다. 파일이 없으면 조용히 내장 테마만 남긴다.
 *
 *  경고는 여기서 바로 띄운다(부팅 경로에도 호출부가 없기 때문). 다만 **결과를 돌려주어
 *  호출부가 성공 토스트를 덮지 않게** 한다 — 토스트 슬롯이 하나라 "3개 불러왔습니다" 가
 *  "12번째 줄이 잘못됐습니다" 를 가리면 사용자는 자기 오타를 못 본다(실구동에서 잡혔다).
 *  @returns 읽은 개수와 경고. 경로를 못 읽었으면(= Tauri 밖) null. */
export async function loadUserThemes(): Promise<{ count: number; warnings: ThemeWarning[] } | null> {
  const st = useAppStore.getState();
  let bundle: ThemeBundle;
  try {
    bundle = await readThemeBundle();
  } catch (e) {
    // Tauri 밖(데모·프로브)이거나 IPC 실패. 내장 테마로 조용히 남는다.
    console.warn("[themes] 테마 입력을 읽지 못했습니다", e);
    return null;
  }

  const { themes: parsed, warnings } = parseThemeBundle(bundle, BUILTIN_THEMES);
  setUserThemes(parsed);
  st.setCustomThemesText(cacheable(bundle));
  reconcileSelection();
  st.bumpThemeRev();
  applyTheme(useAppStore.getState().themeId);
  notice(warnings);
  return { count: Object.keys(parsed).length, warnings };
}

/** 부팅 깜빡임을 막는 캐시는 localStorage 에 들어간다 — 너무 크면 넣지 않는다.
 *  캐시가 없으면 첫 페인트가 잠깐 기본 테마일 뿐, 디스크 읽기가 곧 바로잡는다. */
const MAX_CACHE = 512 * 1024;
function cacheable(bundle: ThemeBundle): string {
  const json = JSON.stringify(bundle);
  return json.length <= MAX_CACHE ? json : "";
}

/** 파일이 없으면 주석 달린 템플릿을 만든다. @returns 경로(만들었든 이미 있든). */
export async function ensureThemeFile(): Promise<string> {
  const path = await themeFilePath();
  // create_new(true) 라 이미 있으면 "EEXIST" 로 거절된다 — 존재 검사 후 write 의 TOCTOU 가 없다.
  await createFile(path, THEME_FILE_TEMPLATE).catch((e: unknown) => {
    if (String(e) !== "EEXIST") throw e;
  });
  return path;
}

/** 테마 폴더를 탐색기에서 연다. **폴더 안의 무언가를 선택해** 연다 — revealInExplorer 는
 *  대상을 부모에서 고르므로, 폴더 자체를 넘기면 한 단계 위가 열려 버린다.
 *
 *  고르는 순서: 안내문(README.md) → 폴더 안 첫 파일 → (정말 비었으면) 폴더 자체.
 *  안내문은 폴더가 비어 있을 때만 만든다 — 지운 사람에게 다시 들이밀지 않는다. 대신
 *  지웠더라도 팩이 남아 있으면 그 팩을 골라 "폴더 안이 열린다"는 성질은 지킨다.
 *  @returns 실제로 연 경로. */
export async function openThemeFolder(): Promise<string> {
  const dir = await themeDirPath();
  const guide = `${dir}\README.md`;
  if (await pathExists(guide)) {
    await revealInExplorer(guide);
    return guide;
  }
  const bundle = await readThemeBundle();
  if (!bundle.packs.length && !bundle.styles.length) {
    // create_new(true) — 있으면 EEXIST 로 거절되므로 남의 파일을 덮지 않는다.
    await createFile(guide, THEME_FOLDER_GUIDE).catch(() => undefined);
    if (await pathExists(guide)) {
      await revealInExplorer(guide);
      return guide;
    }
  }
  const inside = firstFileName(bundle);
  if (inside) {
    const target = `${dir}\${inside}`;
    await revealInExplorer(target);
    return target;
  }
  await revealInExplorer(dir);
  return dir;
}

/** 폴더 안에서 탐색기에 선택시킬 파일 하나. `file` 은 v0.9.0 에서 생긴 필드라 낡은
 *  localStorage 캐시에는 없다 — stem 만으로는 `.jsonc` 인지 `.json` 인지 되살릴 수 없어
 *  건너뛴다(이 함수는 디스크에서 갓 읽은 뭉치에만 쓰이므로 실사용에서 비지 않는다). */
function firstFileName(bundle: ThemeBundle): string | undefined {
  return [...bundle.packs, ...bundle.styles].map((e) => e.file).find((f): f is string => !!f);
}
