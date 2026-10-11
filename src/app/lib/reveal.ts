// 줄 보여 주기 — 에이전트 브리지 `open_in_app(line)` 이 "이 문서를 이 줄에서 열어 달라"고 할 때.
//
// 어려운 곳은 *언제* 스크롤하느냐다. 미리보기 iframe 은 탭을 바꿔도 다시 만들어지지 않고(pane-a 는
// 언마운트되지 않는다), 새 문서의 HTML 은 워커 → 정화 → mermaid → srcdoc → load 를 거쳐 늦게 온다.
// 그 사이 iframe 에는 **앞 문서**가 들어 있으므로 바로 스크롤하면 엉뚱한 문서가 움직이고, 곧 이어질
// load 가 "직전 위치 복원"으로 덮어쓴다. 그래서 iframe 에 지금 어느 경로가 그려져 있는지를 보고
// 지금 할지, 다음 load 에 할지를 정한다. 다음 load 로 미룬 요청은 **그 경로의 load 에서만** 쓴다 —
// 아무 load 에서나 쓰면 나중에 타자 한 번에 화면이 그 줄로 튀어 돌아간다.

export type Reveal = { path: string; line: number; seq: number };
export type PendingReveal = { path: string; line: number };

/** 도구의 1-based 줄 → 미리보기·편집기가 쓰는 0-based 소스 줄(markdown-it `data-line`). */
export function toSourceLine(line1: number): number {
  return Math.max(0, Math.floor(line1) - 1);
}

/** 호스트가 각 패널에 넘길 요청 — 그 패널의 문서일 때만. */
export function revealFor(
  reveal: Reveal | null,
  path: string | null | undefined,
): { line: number; seq: number } | null {
  if (!reveal || !path || reveal.path !== path) return null;
  return { line: toSourceLine(reveal.line), seq: reveal.seq };
}

/**
 * 요청이 왔을 때: 이 문서가 이미 그려져 있으면 지금 스크롤한다. 다시 그리는 중이면(srcdoc 을 넣고 load
 * 전) 지금 해도 곧 load 의 위치 복원이 덮으므로 다음 load 에도 한 번 더 건다. 아직 다른 문서가
 * 그려져 있으면 다음 load 까지 기다린다.
 */
export function planReveal(s: {
  line: number;
  path: string;
  loadedPath: string | null;
  inFlight: boolean;
}): { now: boolean; pending: PendingReveal | null } {
  const shown = s.loadedPath === s.path;
  const pending = !shown || s.inFlight ? { path: s.path, line: s.line } : null;
  return { now: shown, pending };
}

/** load 때: 미뤄 둔 요청이 **방금 그려진 그 문서** 것이면 그 줄, 아니면 null. */
export function takeRevealOnLoad(pending: PendingReveal | null, loadedPath: string | null): number | null {
  return pending && loadedPath === pending.path ? pending.line : null;
}

/**
 * 다시 그리기 직전, load 뒤에 돌려놓을 줄. **같은 문서를 다시 그릴 때만**(테마·글꼴·줌·편집) 위치를
 * 지킨다 — 다른 문서로 바뀌는데 앞 문서의 줄을 넘기면 새 문서가 엉뚱한 중간에서 열린다(v0.6.5 부터
 * 그랬다: Alpha 를 150줄에 둔 채 Beta 를 열면 Beta 도 150줄 언저리).
 */
export function restoreLineFor(s: {
  loadedPath: string | null;
  nextPath: string | null;
  top: number | null;
}): number | null {
  return s.loadedPath != null && s.loadedPath === s.nextPath ? s.top : null;
}

/**
 * 밖에서 오는 스크롤(편집기 동기화) — iframe 에 **이 패널의 문서**가 그려져 있을 때만. 탭을 바꾼
 * 직후엔 앞 문서가 남아 있어서, 새 문서 편집기의 위치로 앞 문서를 움직이게 된다.
 */
export function canSyncScroll(loadedPath: string | null, path: string | null): boolean {
  return loadedPath != null && loadedPath === path;
}
