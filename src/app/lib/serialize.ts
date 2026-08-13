// 비동기 작업 직렬 실행기.
//
// 왜 있나: 모듈 전역 DOM/설정을 만지는 비동기 파이프라인은 두 호출이 겹치면 서로를 밟는다.
// 구체적으로 lib/mermaid.ts 의 renderMermaid 는 **공유 측정 스테이지 하나**에 렌더하고 끝에서
// 그걸 비운다 — 두 호출이 await 지점에서 교차하면 한쪽이 재는 동안 다른 쪽이 스테이지를 비워
// getBBox/getComputedTextLength 가 0을 돌려준다(v0.6.7·v0.6.8을 태운 라벨 측정 버그와 같은 계열).
// 미리보기 패널이 둘이 되면(v0.7 리딩 분할) 그 겹침이 상시가 된다.

/** FIFO 직렬 실행기를 만든다. 반환된 run()에 넘긴 작업은 앞 작업이 **완전히** 끝난 뒤에만 시작한다.
 *  앞 작업이 실패해도 뒤 작업은 실행된다 — 체인이 reject 상태로 굳으면 락이 통째로 죽기 때문에
 *  tail 은 항상 성공으로 중화해 이어 간다(실패는 호출자가 받은 프라미스로만 전파). */
export function createLock(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    // then(fn, fn) — 앞 작업의 성패와 무관하게 이번 작업을 시작한다.
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
