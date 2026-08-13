// 리딩 모드 좌우 분할의 패널 상태 리듀서(순수).
//
// 왜 따로 빼나: 실패 모드가 조용하다. 두 번째 패널이 이미 닫힌 탭을 가리키면 빈 패널이 남고,
// 두 패널이 같은 문서를 가리키면 분할한 의미가 없다. 그런 어긋남은 탭을 닫는 네 경로
// (closeTab·closeOthers·closeAll·부팅 복원)마다 생기는데, 그중 하나만 빠뜨려도 눈에 잘 안 띈다.
// 규칙을 한 곳에 모아 테스트로 못박고 네 곳이 같은 함수를 부르게 한다.

export interface PaneState {
  activePath: string | null;
  secondaryPath: string | null;
  readerSplit: boolean;
}

/** 열린 탭 목록과 패널 상태를 맞춘다. 멱등이다(두 번 적용해도 결과가 같다). */
export function reconcilePanes(s: PaneState, openPaths: string[]): PaneState {
  const open = new Set(openPaths);
  const activePath: string | null =
    s.activePath && open.has(s.activePath) ? s.activePath : (openPaths[0] ?? null);
  let secondaryPath: string | null =
    s.secondaryPath && open.has(s.secondaryPath) ? s.secondaryPath : null;
  // 같은 문서를 양쪽에 두는 건 분할의 의미가 없다 — 두 번째를 접는다.
  // 활성 문서가 아예 없으면(탭 0개) 두 번째만 남을 수 없다.
  if (!activePath || secondaryPath === activePath) secondaryPath = null;
  return { activePath, secondaryPath, readerSplit: s.readerSplit && secondaryPath !== null };
}

/** `path` 를 두 번째 패널로. 활성 문서가 없으면 그게 먼저 활성이 된다(빈 화면에서 분할은 무의미). */
export function openSecondary(s: PaneState, path: string): PaneState {
  if (!s.activePath) return { activePath: path, secondaryPath: null, readerSplit: false };
  if (path === s.activePath) return s; // 같은 문서 — 무연산
  return { activePath: s.activePath, secondaryPath: path, readerSplit: true };
}

/** 두 패널의 문서를 맞바꾼다. 두 번째가 없으면 무연산. */
export function swapPanes(s: PaneState): PaneState {
  if (!s.secondaryPath || !s.activePath) return s;
  return { ...s, activePath: s.secondaryPath, secondaryPath: s.activePath };
}

/** 두 번째 패널을 닫는다(분할 해제). 활성 문서는 그대로. */
export function closeSecondary(s: PaneState): PaneState {
  return { ...s, secondaryPath: null, readerSplit: false };
}
